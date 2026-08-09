const assert = require('node:assert/strict');
const test = require('node:test');

const { combineLogicalClauses, parseAstFilter } = require('./astUtils');
const { internal } = require('./astTranslator');

test('AST parsing normalizes keys only and preserves flat materialized fields', () => {
	const parsed = parseAstFilter(
		JSON.stringify({
			operand: 'AND',
			children: [
				{ key: 'ICD_ICD10', system: 'diagnosis', type: 'EQUALS', value: 'C50_1' },
				{ key: 'ICDO_histologyCode', system: 'diagnosis', type: 'EQUALS', value: '8500_3' },
				{ key: 'grading_first', system: 'diagnosis', type: 'EQUALS', value: 'G_1' }
			]
		})
	);

	assert.deepEqual(
		parsed.children.map(({ key, value }) => ({ key, value })),
		[
			{ key: 'ICD.ICD10', value: 'C50_1' },
			{ key: 'ICDO_histologyCode', value: '8500_3' },
			{ key: 'grading_first', value: 'G_1' }
		]
	);
});

test('legacy nested study-patient keys migrate to the materialized collection', () => {
	const parsed = parseAstFilter(
		JSON.stringify({
			operand: 'AND',
			children: [
				{
					key: 'studyPatients_patID',
					system: 'study',
					type: 'EQUALS',
					value: 'P-1'
				},
				{
					key: 'studyPatients_recruitmentDate',
					system: 'study',
					type: 'BETWEEN',
					value: { min: 1, max: 2 }
				},
				{ key: 'studyID', system: 'study', type: 'EQUALS', value: 'S-1' }
			]
		})
	);

	assert.deepEqual(
		parsed.children.map(({ system, key }) => ({ system, key })),
		[
			{ system: 'studyPatient', key: 'patID' },
			{ system: 'studyPatient', key: 'recruitmentDate' },
			{ system: 'study', key: 'studyID' }
		]
	);
});

test('open date bounds stay open and date equality uses BSON Date values', () => {
	const min = Date.parse('2020-01-02T00:00:00.000Z');
	assert.deepEqual(
		internal.localQuery(
			{
				key: 'diagnosisDate',
				type: 'BETWEEN',
				system: 'diagnosis',
				value: { min, max: null }
			},
			'diagnosis'
		),
		{ diagnosisDate: { $gte: new Date(min) } }
	);
	assert.deepEqual(
		internal.localQuery(
			{
				key: 'diagnosisDate',
				type: 'EQUALS',
				system: 'diagnosis',
				value: min
			},
			'diagnosis'
		),
		{ diagnosisDate: { $eq: new Date(min) } }
	);
});

test('empty-value and negated-range queries are true complements', () => {
	const empty = internal.localQuery(
		{ key: 'ECOG', type: 'EQUALS', system: 'diagnosis', value: '-' },
		'diagnosis'
	);
	assert.deepEqual(empty.$or.at(-1), { ECOG: { $size: 0 } });

	const outside = internal.localQuery(
		{
			key: '!age',
			type: 'NBETWEEN',
			system: 'diagnosis',
			value: { min: 10, max: 20 }
		},
		'diagnosis'
	);
	assert.deepEqual(outside, { $nor: [{ age: { $gte: 10, $lte: 20 } }] });
});

test('AND on object-array fields produces one elemMatch', () => {
	const query = internal.localQuery(
		{
			operand: 'AND',
			children: [
				{ key: 'ops.code', type: 'EQUALS', system: 'therapy', value: 'A' },
				{ key: 'ops.text', type: 'EQUALS', system: 'therapy', value: 'B' }
			]
		},
		'therapy'
	);
	assert.deepEqual(query, {
		ops: {
			$elemMatch: {
				$and: [{ code: { $eq: 'A' } }, { text: { $eq: 'B' } }]
			}
		}
	});
});

test('XOR means exactly one matching branch for any branch count', () => {
	const query = combineLogicalClauses('XOR', [{ a: 1 }, { b: 1 }, { c: 1 }]);
	assert.equal(query.$or.length, 3);
	assert.deepEqual(query.$or[0], {
		$and: [{ a: 1 }, { $nor: [{ b: 1 }, { c: 1 }] }]
	});
	assert.deepEqual(query.$or[2], {
		$and: [{ c: 1 }, { $nor: [{ a: 1 }, { b: 1 }] }]
	});
});
