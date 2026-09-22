const assert = require('node:assert/strict');
const test = require('node:test');
const { ApolloServer } = require('@apollo/server');
const genericResolver = require('./resolver');
const therapyResolver = require('./therapy');

const details = {
	subType: 'Peptid-Radio-Rezeptor-Therapie',
	subTypeCode: 'PRRT',
	subTypeDetail: null,
	subTypeDetailCode: null,
	radioNuclid: 'Lutetium-177',
	radioNuclidCode: '001',
	radiopharmaceutical: 'DOTA-TATE',
	radiopharmaceuticalCode: '002'
};
const fields = Object.keys(details);
const leaf = (key, value) => ({ system: 'therapy', key, value, type: 'EQUALS' });

function createContext(documents) {
	const calls = [];
	return {
		calls,
		collections: { therapy: 'therapy' },
		db: {
			collection(name) {
				assert.equal(name, 'therapy');
				return {
					distinct: async () => [...new Set(documents.map((doc) => doc.tumorID))],
					aggregate(pipeline) {
						calls.push(pipeline);
						const group = pipeline.find((stage) => stage.$group)?.$group;
						return {
							toArray: async () =>
								group
									? [{ _id: { label: 'Lutetium-177' }, label: 'Lutetium-177', count: 1 }]
									: structuredClone(documents),
							next: async () => ({ count: documents.length })
						};
					}
				};
			}
		}
	};
}

async function withServer(run) {
	const server = new ApolloServer({
		typeDefs: [
			require('../schema/schema.graphql'),
			require('../schema/therapy.graphql'),
			require('../schema/progress.graphql')
		],
		resolvers: {
			Query: {
				getAllTherapies: genericResolver.Query.getAllTherapies,
				getTableCount: genericResolver.Query.getTableCount,
				getCategoryChart: genericResolver.Query.getCategoryChart,
				getTherapyGroupedByKey: therapyResolver.Query.getTherapyGroupedByKey
			}
		}
	});
	try {
		await run(server);
	} finally {
		await server.stop();
	}
}

test('therapy GraphQL returns new nuclear details and nulls for legacy or other rows', async () => {
	await withServer(async (server) => {
		const context = createContext([
			{ tumorID: 'synthetic-nuclear', therapyID: 'n1', generalType: 'nuclear', ...details },
			{
				tumorID: 'synthetic-other',
				therapyID: 'o1',
				generalType: 'other',
				subType: 'Tumorembolisation'
			}
		]);
		const result = await server.executeOperation(
			{ query: `{ getAllTherapies { generalType ${fields.join(' ')} } }` },
			{ contextValue: context }
		);
		assert.equal(result.body.kind, 'single');
		assert.equal(result.body.singleResult.errors, undefined);
		const rows = result.body.singleResult.data.getAllTherapies;
		assert.deepEqual({ ...rows[0] }, { generalType: 'nuclear', ...details });
		assert.equal(rows[1].subType, 'Tumorembolisation');
		for (const field of fields.filter((name) => name !== 'subType')) {
			assert.equal(rows[1][field], null, `${field} supports earlier imports`);
		}
	});
});

test('new therapy fields support both chart grouping enums', async () => {
	await withServer(async (server) => {
		for (const field of fields) {
			const context = createContext([{ tumorID: 'synthetic-nuclear', ...details }]);
			const result = await server.executeOperation(
				{
					query: `{
						getCategoryChart(collection: therapy, selectedType: ${field}) { label count }
						getTherapyGroupedByKey(groupedBy: ${field}) { label count }
					}`
				},
				{ contextValue: context }
			);
			assert.equal(result.body.singleResult.errors, undefined, field);
			assert.ok(
				context.calls.some((pipeline) =>
					pipeline.some((stage) => stage.$group?._id?.label === `$${field}`)
				)
			);
			assert.ok(
				context.calls.some((pipeline) =>
					pipeline.some((stage) => stage.$group?._id === `$${field}`)
				)
			);
		}
	});
});

test('therapy table, count and chart apply the same subtype and radionuclide scope', async () => {
	await withServer(async (server) => {
		const context = createContext([{ tumorID: 'synthetic-nuclear', ...details }]);
		const filter = JSON.stringify({
			operand: 'AND',
			children: [leaf('generalType', 'nuclear'), leaf('radioNuclidCode', '001')]
		});
		const result = await server.executeOperation(
			{
				query: `query($filter: String) {
					getAllTherapies(filter: $filter, sortField: "subTypeCode", sortDirection: "asc",
						columnFilters: [{ field: "radiopharmaceutical", value: "DOTA" }]) { subTypeCode }
					getTableCount(collection: therapy, filter: $filter,
						columnFilters: [{ field: "radiopharmaceutical", value: "DOTA" }])
					getCategoryChart(collection: therapy, selectedType: radioNuclid, filter: $filter) { label count }
				}`,
				variables: { filter }
			},
			{ contextValue: context }
		);
		assert.equal(result.body.singleResult.errors, undefined);
		assert.equal(context.calls.length, 3);
		for (const pipeline of context.calls) {
			assert.deepEqual(pipeline[0], {
				$match: { $and: [{ generalType: { $eq: 'nuclear' } }, { radioNuclidCode: { $eq: '001' } }] }
			});
		}
		const tablePipeline = context.calls.find((pipeline) => pipeline.some((stage) => stage.$sort));
		const countPipeline = context.calls.find((pipeline) => pipeline.some((stage) => stage.$count));
		const columnFilter = { $match: { radiopharmaceutical: { $regex: 'DOTA', $options: 'i' } } };
		assert.ok(
			tablePipeline.some((stage) => JSON.stringify(stage) === JSON.stringify(columnFilter))
		);
		assert.ok(
			countPipeline.some((stage) => JSON.stringify(stage) === JSON.stringify(columnFilter))
		);
		assert.ok(tablePipeline.some((stage) => stage.$sort?.subTypeCode === 1));
	});
});
