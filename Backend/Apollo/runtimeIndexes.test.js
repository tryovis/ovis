const assert = require('node:assert/strict');
const test = require('node:test');

const { createRuntimeIndexes } = require('./runtimeIndexes.js');

test('Apollo startup indexes populated analysis collections without touching studies', async () => {
	const calls = [];
	const database = {
		collection(name) {
			calls.push({ operation: 'collection', name });
			return {
				async findOne(filter, options) {
					assert.deepEqual(filter, {});
					assert.deepEqual(options, { projection: { _id: 1 } });
					return { _id: 'existing-document' };
				},
				async createIndex(specification) {
					calls.push({ operation: 'createIndex', name, specification });
				}
			};
		}
	};

	await createRuntimeIndexes(database, {
		usageEvent: 'usageEvent',
		diagnosis: 'diagnosis',
		kaplanmeier: 'kaplanMeier',
		tnm: 'tnm',
		histology: 'histology',
		status: 'status',
		study: 'study',
		studyPatient: 'studyPatient'
	});

	assert.deepEqual(
		[...new Set(calls.map(({ name }) => name))],
		['usageEvent', 'diagnosis', 'kaplanMeier', 'tnm', 'histology', 'status']
	);
	assert.equal(calls.filter(({ operation }) => operation === 'createIndex').length, 8);
	assert.deepEqual(
		calls.find((call) => call.operation === 'createIndex' && call.name === 'diagnosis')
			.specification,
		{ patID: 1, diagnosisDate: 1, tumorID: 1 }
	);
});

test('Apollo startup does not create analysis indexes on missing or empty collections', async () => {
	const indexes = [];
	const database = {
		collection(name) {
			return {
				async findOne() {
					return null;
				},
				async createIndex(specification) {
					indexes.push({ name, specification });
				}
			};
		}
	};
	await createRuntimeIndexes(database, {
		usageEvent: 'usageEvent',
		diagnosis: 'diagnosis',
		kaplanmeier: 'kaplanMeier',
		tnm: 'tnm',
		histology: 'histology',
		status: 'status'
	});
	assert.equal(indexes.length, 3);
	assert.ok(indexes.every(({ name }) => name === 'usageEvent'));
});
