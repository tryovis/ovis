import assert from 'node:assert/strict';
import test from 'node:test';

import {
	isDiagnosisLegendItemHidden,
	toggleDiagnosisLegendItemVisibility
} from './diagnosisBarChartLegendState.js';

function createChart(datasets, visibleDatasetIndexes) {
	return {
		data: { datasets },
		isDatasetVisible: (index) => visibleDatasetIndexes.includes(index)
	};
}

test('marks a consolidated diagnosis legend item hidden when all matching datasets are hidden', () => {
	const chart = createChart(
		[{ label: 'C00-C14' }, { label: 'C00-C14' }, { label: 'C15-C26' }],
		[2]
	);

	assert.equal(isDiagnosisLegendItemHidden(chart, 'C00-C14'), true);
});

test('keeps a consolidated diagnosis legend item active while a matching dataset is visible', () => {
	const chart = createChart(
		[{ label: 'C00-C14' }, { label: 'C00-C14' }, { label: 'C15-C26' }],
		[1, 2]
	);

	assert.equal(isDiagnosisLegendItemHidden(chart, 'C00-C14'), false);
});

test('hides every matching dataset and marks the clicked legend item hidden', () => {
	const visibilityChanges = [];
	const legendItem = { text: 'C00-C14', hidden: false };
	const chart = {
		data: {
			datasets: [{ label: 'C00-C14' }, { label: 'C00-C14' }, { label: 'C15-C26' }]
		},
		setDatasetVisibility: (index, visible) => visibilityChanges.push([index, visible]),
		updateCalled: false,
		update() {
			this.updateCalled = true;
		}
	};

	toggleDiagnosisLegendItemVisibility(chart, legendItem);

	assert.deepEqual(visibilityChanges, [
		[0, false],
		[1, false]
	]);
	assert.equal(legendItem.hidden, true);
	assert.equal(chart.updateCalled, true);
});

test('shows every matching dataset when a hidden legend item is clicked', () => {
	const visibilityChanges = [];
	const legendItem = { text: 'C00-C14', hidden: true };
	const chart = {
		data: { datasets: [{ label: 'C00-C14' }, { label: 'C00-C14' }] },
		setDatasetVisibility: (index, visible) => visibilityChanges.push([index, visible]),
		update() {}
	};

	toggleDiagnosisLegendItemVisibility(chart, legendItem);

	assert.deepEqual(visibilityChanges, [
		[0, true],
		[1, true]
	]);
	assert.equal(legendItem.hidden, false);
});
