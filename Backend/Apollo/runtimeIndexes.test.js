const assert = require('node:assert/strict');
const test = require('node:test');

const { createRuntimeIndexes } = require('./runtimeIndexes.js');

test('Apollo startup creates runtime indexes without touching imported study collections', async () => {
	const calls = [];
	const database = {
		collection(name) {
			calls.push({ operation: 'collection', name });
			return {
				async createIndex(specification) {
					calls.push({ operation: 'createIndex', name, specification });
				}
			};
		}
	};

	await createRuntimeIndexes(database, {
		usageEvent: 'usageEvent',
		study: 'study',
		studyPatient: 'studyPatient'
	});

	assert.deepEqual([...new Set(calls.map(({ name }) => name))], ['usageEvent']);
	assert.equal(calls.filter(({ operation }) => operation === 'createIndex').length, 3);
});
