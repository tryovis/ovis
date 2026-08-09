const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const originalLoad = Module._load;
Module._load = function loadWithBsonStub(request, parent, isMain) {
	if (request === 'bson') return { ObjectId: class ObjectId {} };
	return originalLoad.call(this, request, parent, isMain);
};
const { aggregationArry, countAggregationArry } = require('./utils');
const diagnosisResolver = require('./resolver/diagnosis');
const genericResolver = require('./resolver/resolver');
Module._load = originalLoad;

test('histology pagination operates directly on histology documents', async () => {
	const pipeline = await aggregationArry(
		{
			limit: 4,
			offset: 4,
			sortField: 'ICDO_histologyCode',
			sortDirection: 'asc',
			columnFilters: [{ field: 'ICDO_histologyCode', value: '8140' }]
		},
		'histology',
		null
	);

	assert.deepEqual(
		pipeline.map((stage) => Object.keys(stage)[0]),
		['$match', '$sort', '$skip', '$limit']
	);
	assert.deepEqual(pipeline[1], { $sort: { ICDO_histologyCode: 1, _id: -1 } });
	assert.deepEqual(pipeline.at(-2), { $skip: 4 });
	assert.deepEqual(pipeline.at(-1), { $limit: 4 });
});

test('histology counts operate directly on filtered histology documents', async () => {
	const pipeline = await countAggregationArry(
		{
			columnFilters: [{ field: 'ICDO_histologyCode', value: '8140' }]
		},
		'histology',
		null
	);

	assert.deepEqual(
		pipeline.map((stage) => Object.keys(stage)[0]),
		['$match', '$count']
	);
	assert.deepEqual(pipeline.at(-1), { $count: 'count' });
});

test('histology table and count resolvers select the histology collection', async () => {
	const calls = [];
	const context = {
		collections: { diagnosis: 'diagnosis', histology: 'histology' },
		db: {
			collection(name) {
				return {
					aggregate(pipeline) {
						calls.push({ name, pipeline });
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
	assert.deepEqual(calls.map(({ name }) => name), ['histology', 'histology']);
	assert.deepEqual(
		calls[0].pipeline.map((stage) => Object.keys(stage)[0]),
		['$sort', '$skip', '$limit']
	);
	assert.deepEqual(
		calls[1].pipeline.map((stage) => Object.keys(stage)[0]),
		['$count']
	);
});

test('histology cursor paging no longer appends unwind or projection stages', async () => {
	const pipelines = [];
	const context = {
		collections: { histology: 'histology' },
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
		['$sort', '$limit']
	);
	assert.deepEqual(
		pipelines[1].map((stage) => Object.keys(stage)[0]),
		['$sort', '$match', '$limit']
	);
});

test('study overview sorts the patient column by patient count before paging', async () => {
	const pipelines = [];
	const context = {
		collections: { study: 'study', patient: 'patient' },
		db: {
			collection() {
				return {
					aggregate(pipeline) {
						pipelines.push(pipeline);
						return { toArray: async () => [] };
					}
				};
			}
		}
	};

	await genericResolver.Query.getAllStudies(
		null,
		{
			offset: 7,
			limit: 7,
			sortField: 'studyPatients',
			sortDirection: 'desc',
			columnFilters: []
		},
		context
	);

	assert.deepEqual(pipelines[0], [
		{
			$set: {
				__studyPatientCount: { $size: { $ifNull: ['$studyPatients', []] } }
			}
		},
		{ $sort: { __studyPatientCount: -1, _id: -1 } },
		{ $skip: 7 },
		{ $limit: 7 }
	]);
});

test('study overview sorts by the patient count remaining after cohort filters', async () => {
	const studyPipelines = [];
	const context = {
		collections: { study: 'study', patient: 'patient' },
		db: {
			collection(name) {
				return {
					aggregate(pipeline) {
						if (name === 'study') {
							studyPipelines.push(pipeline);
							return { toArray: async () => [] };
						}

						const group = pipeline.at(-1)?.$group;
						if (group?.ids) return { next: async () => ({ ids: ['p1'] }) };
						return { next: async () => ({ ts: [] }) };
					}
				};
			}
		}
	};

	await genericResolver.Query.getAllStudies(
		null,
		{
			filter: JSON.stringify({
				operand: 'OR',
				children: [
					{
						key: 'patID',
						type: 'EQUALS',
						system: 'patient',
						value: 'p1'
					}
				]
			}),
			limit: 7,
			sortField: 'studyPatients',
			sortDirection: 'asc',
			columnFilters: []
		},
		context
	);

	const pipeline = studyPipelines[0];
	const cohortIndex = pipeline.findIndex((stage) => stage.$set?.studyPatients);
	const countIndex = pipeline.findIndex((stage) => stage.$set?.__studyPatientCount);
	const sortIndex = pipeline.findIndex((stage) => stage.$sort?.__studyPatientCount === 1);
	const limitIndex = pipeline.findIndex((stage) => stage.$limit === 7);

	assert.notEqual(cohortIndex, -1);
	assert.ok(cohortIndex < countIndex);
	assert.ok(countIndex < sortIndex);
	assert.ok(sortIndex < limitIndex);
});
