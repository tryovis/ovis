const assert = require('node:assert/strict');
const test = require('node:test');
const { GraphQLString } = require('graphql');
const { Diagnosis } = require('./diagnosis');

test('chronological ECOG histories preserve every assessment and serialize as GraphQL text', () => {
	const diagnosis = { ECOG: [0, '1', null, 0, undefined, '2'] };
	const before = [...diagnosis.ECOG];
	assert.throws(() => GraphQLString.serialize(diagnosis.ECOG));
	const result = Diagnosis.ECOG(diagnosis);
	assert.equal(result, '0, 1, 0, 2');
	assert.equal(GraphQLString.serialize(result), result);
	assert.deepEqual(diagnosis.ECOG, before);
});

test('absent ECOG assessments remain null and scalar zero is retained', () => {
	for (const ECOG of [undefined, null, [], [null, undefined]]) {
		assert.equal(Diagnosis.ECOG({ ECOG }), null);
	}
	assert.equal(Diagnosis.ECOG({ ECOG: 0 }), '0');
	assert.equal(Diagnosis.ECOG({ ECOG: '0' }), '0');
	assert.equal(Diagnosis.ECOG({ ECOG: 'nicht beurteilbar' }), 'nicht beurteilbar');
});
