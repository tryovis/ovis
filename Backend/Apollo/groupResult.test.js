const assert = require('node:assert/strict');
const { test } = require('node:test');
const { genCategoryGroupedResult } = require('./groupResult');

test('genCategoryGroupedResult builds the sparse grouped matrix', () => {
	const result = genCategoryGroupedResult([
		{
			_id: 'A',
			com: [
				{ grade: 'one', count: 4 },
				{ grade: 'two', count: 2 }
			]
		},
		{ _id: 'B', com: [{ grade: 'two', count: 3 }] },
		{ _id: 'C', com: [{ grade: null, count: 1 }] }
	]);

	assert.deepEqual(result, {
		category: ['A', 'B', 'C'],
		groups: [
			{ label: 'one', count: [4, 0, 0] },
			{ label: 'two', count: [2, 3, 0] },
			{ label: null, count: [0, 0, 1] }
		]
	});
});

test('genCategoryGroupedResult handles empty and missing grouped values', () => {
	assert.deepEqual(genCategoryGroupedResult(), { category: [], groups: [] });
	assert.deepEqual(genCategoryGroupedResult([{ _id: 'A' }]), {
		category: ['A'],
		groups: []
	});
});
