import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareCategoryChart } from './categoryChartModel.js';

test('normalizes missing labels without mutating the GraphQL response', () => {
	const response = { label: ['A', '', null, 'B'], count: [4, 2, 3, 1] };
	const result = prepareCategoryChart(response, { showNull: true });

	assert.deepEqual(result.full, { label: ['A', 'B', '-'], count: [4, 1, 5] });
	assert.equal(result.missingValueCount, 5);
	assert.deepEqual(response, { label: ['A', '', null, 'B'], count: [4, 2, 3, 1] });
});

test('top-five view groups only an actual remainder and keeps full table data', () => {
	const response = {
		label: ['A', 'B', 'C', 'D', 'E', 'F'],
		count: [6, 5, 4, 3, 2, 1]
	};
	const result = prepareCategoryChart(response, { showTop5: true });

	assert.deepEqual(result.chart, {
		label: ['A', 'B', 'C', 'D', 'E', 'Sonstige'],
		count: [6, 5, 4, 3, 2, 1]
	});
	assert.deepEqual(result.full, response);

	const five = prepareCategoryChart(
		{ label: ['A', 'B', 'C', 'D', 'E'], count: [5, 4, 3, 2, 1] },
		{ showTop5: true }
	);
	assert.equal(five.chart.label.includes('Sonstige'), false);
});
