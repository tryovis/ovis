const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const originalLoad = Module._load;
Module._load = function loadWithBsonStub(request, parent, isMain) {
	if (request === 'bson') return { ObjectId: class ObjectId {} };
	return originalLoad.call(this, request, parent, isMain);
};
const { aggregationArry, countAggregationArry } = require('./utils');
const { diagnosisHistologyRowStages } = require('./histologyTable');
const diagnosisResolver = require('./resolver/diagnosis');
const genericResolver = require('./resolver/resolver');
Module._load = originalLoad;

test('expanded table pagination limits final histology rows instead of diagnosis documents', async () => {
	const pipeline = await aggregationArry(
		{
			limit: 4,
			offset: 4,
			sortField: 'ICDO_histologyCode',
			sortDirection: 'asc',
			columnFilters: [{ field: 'ICDO_histologyCode', value: '8140' }]
		},
		'diagnosis',
		null,
		{ rowStages: diagnosisHistologyRowStages, stableSortFields: { __histologyIndex: 1 } }
	);

	assert.deepEqual(
		pipeline.map((stage) => Object.keys(stage)[0]),
		['$unwind', '$project', '$match', '$sort', '$skip', '$limit']
	);
	assert.deepEqual(pipeline[3], {
		$sort: { ICDO_histologyCode: 1, _id: -1, __histologyIndex: 1 }
	});
	assert.deepEqual(pipeline.at(-2), { $skip: 4 });
	assert.deepEqual(pipeline.at(-1), { $limit: 4 });
});

test('expanded table counts flattened and filtered histology rows', async () => {
	const pipeline = await countAggregationArry(
		{
			columnFilters: [{ field: 'ICDO_histologyCode', value: '8140' }]
		},
		'diagnosis',
		null,
		{ rowStages: diagnosisHistologyRowStages }
	);

	assert.deepEqual(
		pipeline.map((stage) => Object.keys(stage)[0]),
		['$unwind', '$project', '$match', '$count']
	);
	assert.deepEqual(pipeline.at(-1), { $count: 'count' });
});

test('histology resolvers use final-row paging and counting pipelines', async () => {
	const pipelines = [];
	const context = {
		collections: { diagnosis: 'diagnosis' },
		db: {
			collection() {
				return {
					aggregate(pipeline) {
						pipelines.push(pipeline);
						return {
							toArray: async () => [],
							next: async () => ({ count: 7 })
						};
					}
				};
			}
		}
	};

	await diagnosisResolver.Query.getDiagnosisHistologyTable(
		null,
		{ limit: 4, offset: 4, sortDirection: 'desc', columnFilters: [] },
		context
	);
	const count = await genericResolver.Query.getTableCount(
		null,
		{ collection: 'histology', columnFilters: [] },
		context
	);

	assert.equal(count, 7);
	assert.deepEqual(
		pipelines[0].map((stage) => Object.keys(stage)[0]),
		['$unwind', '$project', '$sort', '$skip', '$limit']
	);
	assert.deepEqual(
		pipelines[1].map((stage) => Object.keys(stage)[0]),
		['$unwind', '$project', '$count']
	);
});

test('legacy histology cursor keeps whole diagnosis documents together', async () => {
	const pipelines = [];
	const context = {
		collections: { diagnosis: 'diagnosis' },
		db: {
			collection() {
				return {
					aggregate(value) {
						pipelines.push(value);
						return { toArray: async () => [] };
					}
				};
			}
		}
	};

	await diagnosisResolver.Query.getDiagnosisHistologyTable(
		null,
		{ limit: 4, sortDirection: 'desc', columnFilters: [] },
		context
	);
	await diagnosisResolver.Query.getDiagnosisHistologyTable(
		null,
		{
			continueFromID: '000000000000000000000010',
			limit: 4,
			sortDirection: 'desc',
			columnFilters: []
		},
		context
	);

	assert.deepEqual(
		pipelines[0].map((stage) => Object.keys(stage)[0]),
		['$sort', '$limit', '$unwind', '$project']
	);
	assert.deepEqual(
		pipelines[1].map((stage) => Object.keys(stage)[0]),
		['$sort', '$match', '$limit', '$unwind', '$project']
	);
});
