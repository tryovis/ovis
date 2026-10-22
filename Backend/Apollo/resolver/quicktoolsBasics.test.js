const assert = require('node:assert/strict');
const test = require('node:test');
const { ApolloServer } = require('@apollo/server');
const { parse, print, Kind } = require('graphql');
const { createAccessControl } = require('../accessControl');
const diagnosisSchema = require('../schema/diagnosis.graphql');
const diagnosisResolvers = require('./diagnosis');

const fields = ['getQuicktoolsBasicsIcd10', 'getQuicktoolsBasicsHistology'];
// Use the production field definitions so missing filter arguments are caught
// through GraphQL and the real access-control wrapper, not a mocked resolve info.
const query = parse(diagnosisSchema).definitions.find((node) => node.name.value === 'Query');
const typeDefs = print({
	...query,
	kind: Kind.OBJECT_TYPE_DEFINITION,
	fields: query.fields.filter((field) => fields.includes(field.name.value))
});
const collections = { diagnosis: 'diagnosis', histology: 'histology' };
const leaf = (key, value) => ({ system: 'diagnosis', key, type: 'EQUALS', value });
const group = (operand, ...children) => ({ operand, children });
const assigned = group('AND', leaf('isTumor', 'true'), leaf('oz_sarcomaGesamt', 'true'));
const get = (row, path) => path.split('.').reduce((value, key) => value?.[key], row);

// Minimal synthetic MongoDB adapter; unknown operators fail rather than being
// silently ignored. The resolver and filter translator both run unchanged.
function expression(value, row) {
	if (typeof value === 'string' && value.startsWith('$')) return get(row, value.slice(1));
	if (value?.$concat) {
		const parts = value.$concat.map((part) => expression(part, row));
		return parts.some((part) => part == null) ? null : parts.join('');
	}
	if (value?.$setUnion)
		return [...new Set(value.$setUnion.flatMap((part) => expression(part, row)))];
	if (value?.$sortArray) return [...expression(value.$sortArray.input, row)].sort();
	if (value?.$eq) return expression(value.$eq[0], row) === expression(value.$eq[1], row);
	assert.ok(value === null || typeof value !== 'object', 'Unsupported synthetic expression');
	return value;
}
function matches(row, query) {
	return Object.entries(query).every(([key, condition]) => {
		if (key === '$and') return condition.every((part) => matches(row, part));
		if (key === '$or') return condition.some((part) => matches(row, part));
		if (key === '$nor') return !condition.some((part) => matches(row, part));
		if (key === '$expr') return expression(condition, row);
		const value = get(row, key);
		if (condition === null || typeof condition !== 'object') return value === condition;
		return Object.entries(condition).every(([operator, expected]) => {
			if (operator === '$type') return typeof value === expected;
			if (operator === '$eq') return value === expected;
			if (operator === '$in') return expected.includes(value);
			assert.fail(`Unsupported synthetic operator ${operator}`);
		});
	});
}
function database(rows) {
	return {
		collection(name) {
			const documents = rows[name] || [];
			return {
				distinct: async (field, query) => [
					...new Set(documents.filter((row) => matches(row, query)).map((row) => get(row, field)))
				],
				aggregate(stages) {
					const result = stages.reduce((rows, stage) => {
						if (stage.$match) return rows.filter((row) => matches(row, stage.$match));
						if (stage.$group) {
							assert.equal(stage.$group._id, null);
							if (!rows.length) return [];
							const grouped = { _id: null };
							for (const [key, value] of Object.entries(stage.$group)) {
								if (key === '_id') continue;
								assert.ok(value.$addToSet);
								grouped[key] = [...new Set(rows.map((row) => expression(value.$addToSet, row)))];
							}
							return [grouped];
						}
						if (stage.$project)
							return rows.map((row) =>
								Object.fromEntries(
									Object.entries(stage.$project).map(([key, value]) => [
										key,
										expression(value, row)
									])
								)
							);
						if (stage.$sort) {
							assert.ok(rows.length <= 1, 'Synthetic adapter only sorts singleton groups');
							return rows;
						}
						assert.fail(`Unsupported synthetic stage ${Object.keys(stage)}`);
					}, documents);
					return { next: async () => result[0] || null, toArray: async () => result };
				}
			};
		}
	};
}

function fixture() {
	const records = [
		// One patient has both an allowed sarcoma and an out-of-cohort tumor.
		['t1', 'p1', true, true, 'C49', 'C45-C49', '9040', 'Sarcoma A'],
		['t2', 'p1', true, false, 'C50', 'C50-C50', '8500', 'Outside cohort'],
		['t3', 'p2', true, true, 'C40', 'C40-C41', '9180', 'Sarcoma B'],
		['t4', 'p3', false, true, 'D21', 'D10-D36', '8810', 'Not a tumor']
	];
	const diagnosis = records.map(([tumorID, patID, isTumor, sarcomaGesamt, code, icdGroup]) => ({
		tumorID,
		patID,
		isTumor,
		oz: { sarcomaGesamt },
		TZE_D_LOKT: `Label ${code}`,
		ICD: {
			ICD10: code,
			ICD10_3: code,
			ICD10_3Text: `Label ${code}`,
			ICD10Group: icdGroup,
			ICD10GroupText: `Group ${icdGroup}`
		}
	}));
	const histology = records.map(([tumorID, patID, , , , , code, text]) => ({
		tumorID,
		patID,
		ICDO_histologyCode: code,
		ICDO_histologyCodeText: text
	}));
	histology.push({ ...histology[0] }, { tumorID: 't1', patID: 'p1' });
	return { diagnosis, histology };
}

const allowed = {
	getQuicktoolsBasicsIcd10: [
		'C40 → Label C40',
		'C40-C41 → Group C40-C41',
		'C45-C49 → Group C45-C49',
		'C49 → Label C49'
	],
	getQuicktoolsBasicsHistology: ['9040 → Sarcoma A', '9180 → Sarcoma B']
};

async function setup(t, { mandatory = assigned, role = 'user', rows = fixture() } = {}) {
	const control = createAccessControl();
	const resolvers = control.protectResolvers([
		{ Query: Object.fromEntries(fields.map((field) => [field, diagnosisResolvers.Query[field]])) }
	])[0];
	const server = new ApolloServer({ typeDefs, resolvers });
	await server.start();
	t.after(() => server.stop());
	const contextValue = {
		db: database(rows),
		collections,
		security: {
			anonymous: false,
			userId: 'synthetic-restricted',
			role,
			user: { userFilter: mandatory ? [JSON.stringify(mandatory)] : [] }
		}
	};
	return async (filter) => {
		const response = await server.executeOperation(
			{
				query: filter
					? `query ($filter: String) {
					getQuicktoolsBasicsIcd10(filter: $filter)
					getQuicktoolsBasicsHistology(filter: $filter)
				}`
					: '{ getQuicktoolsBasicsIcd10 getQuicktoolsBasicsHistology }',
				variables: filter ? { filter: JSON.stringify(filter) } : {}
			},
			{ contextValue }
		);
		assert.equal(response.body.kind, 'single');
		assert.equal(response.body.singleResult.errors, undefined);
		return JSON.parse(JSON.stringify(response.body.singleResult.data));
	};
}

for (const role of ['user', 'admin']) {
	test(`quicktools honor assigned sarcoma and tumor restrictions for ${role} without a client filter`, async (t) => {
		const execute = await setup(t, { role });
		assert.deepEqual(await execute(), allowed);
	});
}

test('a broad client OR cannot expose codes from another tumor of an allowed patient', async (t) => {
	const execute = await setup(t);
	assert.deepEqual(
		await execute(group('OR', leaf('oz_sarcomaGesamt', 'true'), leaf('ICD_ICD10_3', 'C50'))),
		allowed
	);
});

test('additional client filters narrow both quicktools lists', async (t) => {
	const execute = await setup(t);
	assert.deepEqual(await execute(leaf('ICD_ICD10_3', 'C49')), {
		getQuicktoolsBasicsIcd10: ['C45-C49 → Group C45-C49', 'C49 → Label C49'],
		getQuicktoolsBasicsHistology: ['9040 → Sarcoma A']
	});
});

test('an empty permitted cohort returns empty lists instead of errors', async (t) => {
	const execute = await setup(t, { mandatory: leaf('tumorID', 'absent') });
	assert.deepEqual(await execute(), {
		getQuicktoolsBasicsIcd10: [],
		getQuicktoolsBasicsHistology: []
	});
});

test('unrestricted accounts retain all sorted, deduplicated options', async (t) => {
	const execute = await setup(t, { mandatory: null });
	const result = await execute();
	assert.deepEqual(result.getQuicktoolsBasicsHistology, [
		'8500 → Outside cohort',
		'8810 → Not a tumor',
		'9040 → Sarcoma A',
		'9180 → Sarcoma B'
	]);
	assert.deepEqual(result.getQuicktoolsBasicsIcd10, [
		...allowed.getQuicktoolsBasicsIcd10,
		'C50 → Label C50',
		'C50-C50 → Group C50-C50',
		'D10-D36 → Group D10-D36',
		'D21 → Label D21'
	]);
});

test('empty collections also return empty lists for unrestricted accounts', async (t) => {
	const execute = await setup(t, { mandatory: null, rows: {} });
	assert.deepEqual(await execute(), {
		getQuicktoolsBasicsIcd10: [],
		getQuicktoolsBasicsHistology: []
	});
});
