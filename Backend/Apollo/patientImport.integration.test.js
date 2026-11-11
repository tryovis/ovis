const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { ApolloServer } = require('@apollo/server');
const { MongoClient } = require('mongodb');
const { createAccessControl } = require('./accessControl');

const address = process.env.OVIS_PATIENT_IMPORT_TEST_MONGO;
test(
	'large imports resolve and filter the permitted cohort through GraphQL',
	{ skip: !address },
	async (t) => {
		assert.equal(new URL(address).hostname, '127.0.0.1');
		const client = new MongoClient(address, { monitorCommands: true });
		const db = client.db('ovis_patient_import_test_' + randomUUID().replaceAll('-', ''));
		const collections = {
			patient: 'patient',
			diagnosis: 'diagnosis',
			therapy: 'therapy',
			progress: 'progress'
		};
		const schema = join(__dirname, 'schema');
		const server = new ApolloServer({
			typeDefs: readdirSync(schema)
				.filter((name) => name.endsWith('.graphql'))
				.map((name) => require(join(schema, name))),
			resolvers: createAccessControl().protectResolvers([
				require('./resolver/resolver'),
				require('./resolver/patient')
			])
		});
		let distinct = 0;
		let aggregates = 0;
		client.on('commandStarted', ({ commandName }) => {
			if (commandName === 'distinct') distinct++;
			if (commandName === 'aggregate') aggregates++;
		});
		const { addPatIDs } = await import('../../Frontend/src/components/extendedAstFunctions.js');
		const contextValue = { db, collections, security: { user: {}, role: 'user' } };
		async function call(query, variables) {
			const response = await server.executeOperation({ query, variables }, { contextValue });
			assert.equal(response.body.kind, 'single');
			const { data, errors } = response.body.singleResult;
			assert.equal(errors, undefined, JSON.stringify(errors));
			return data;
		}
		const lookup = async (ids) =>
			(await call('query($ids:[String!]!) { resolvePatientImportIds(ids:$ids) }', { ids }))
				.resolvePatientImportIds;
		const counts = async (ast) =>
			(
				await call(
					'query($filter:String!) { getQuicktoolsCountOverview(collection:[patient,diagnosis,therapy,progress],filter:$filter) { count } }',
					{ filter: JSON.stringify(ast) }
				)
			).getQuicktoolsCountOverview.map((row) => row.count);
		const equals = (key, value) => ({ key, value, type: 'EQUALS', system: 'patient' });
		const empty = { operand: 'OR', children: [] };
		try {
			await client.connect();
			const ids = Array.from({ length: 2000 }, (_, i) => String(i + 1).padStart(12, '0'));
			await db.collection('patient').insertMany(
				ids.map((patID, i) => ({
					patID,
					gender: i % 2 ? 'w' : 'm',
					tumorID: ['T' + patID]
				}))
			);
			for (const name of ['diagnosis', 'therapy', 'progress'])
				await db.collection(name).insertMany(ids.map((patID) => ({ patID, tumorID: 'T' + patID })));
			await db.collection('patient').createIndex({ patID: 1 });
			const selected = ids.slice(0, 1800);
			assert.deepEqual(await lookup(selected), selected);
			assert.equal(aggregates, 1);
			distinct = aggregates = 0;
			assert.deepEqual(await counts(addPatIDs(selected, empty)), [1800, 1800, 1800, 1800]);
			assert.ok(distinct <= 9);
			assert.equal(aggregates, 4);
			t.diagnostic(
				`1,800 IDs, four counts: ${distinct} distinct queries and ${aggregates} aggregations`
			);

			await db.collection('patient').insertMany([
				{ patID: '01', gender: 'm' },
				{ patID: '000', gender: 'm' }
			]);
			assert.deepEqual(await lookup(['1', '01', '0002', '0002', '0', 'absent']), [
				null,
				'01',
				ids[1],
				ids[1],
				'000',
				null
			]);
			contextValue.security.user.userFilter = JSON.stringify(equals('gender', 'w'));
			assert.deepEqual(await lookup([ids[0], '1', ids[1], '2']), [null, null, ids[1], ids[1]]);
			const alternatives = {
				operand: 'OR',
				children: ['m', 'w'].map((gender) => ({
					operand: 'AND',
					children: [{ key: 'gender', operand: 'OR', children: [equals('gender', gender)] }]
				}))
			};
			const imported = addPatIDs(selected, alternatives);
			assert.ok(JSON.stringify(imported).length > 250000);
			assert.deepEqual(await counts(imported), [900, 900, 900, 900]);
			// The dashboard's default isTumor criterion must still bind to the
			// same tumor after upload, including when the account is restricted.
			await db
				.collection('diagnosis')
				.updateMany({ patID: { $in: selected.slice(0, 100) } }, { $set: { isTumor: true } });
			const tumorFilter = {
				operand: 'OR',
				children: [
					{
						operand: 'AND',
						children: [
							{
								key: 'isTumor',
								operand: 'OR',
								children: [{ system: 'diagnosis', key: 'isTumor', type: 'EQUALS', value: 'true' }]
							}
						]
					}
				]
			};
			assert.deepEqual(await counts(addPatIDs(selected, tumorFilter)), [50, 50, 50, 50]);
		} finally {
			await server.stop();
			await db.dropDatabase();
			await client.close();
		}
	}
);
