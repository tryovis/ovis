import assert from 'node:assert/strict';
import test from 'node:test';

import {
	applyChartDisplayPreferencesToConfig,
	resolveChartDisplayPreferences
} from './chartDisplayPreferences.js';

test('legacy users retain the existing chart defaults', () => {
	assert.deepEqual(resolveChartDisplayPreferences({}), {
		showTop5: true,
		hideNullValues: true
	});
});

test('stored chart preferences accept both boolean values', () => {
	assert.deepEqual(
		resolveChartDisplayPreferences({
			chartShowTop5: false,
			chartHideNullValues: false
		}),
		{
			showTop5: false,
			hideNullValues: false
		}
	);
});

test('preferences update all matching chart flags and preserve other config', () => {
	assert.deepEqual(
		applyChartDisplayPreferencesToConfig(
			{
				StudyChartShowTop5: true,
				StudyChartShowNull: false,
				StudyChartShowChart: true,
				unrelated: 'unchanged'
			},
			{ showTop5: false, hideNullValues: false }
		),
		{
			StudyChartShowTop5: false,
			StudyChartShowNull: true,
			StudyChartShowChart: true,
			unrelated: 'unchanged'
		}
	);
});
