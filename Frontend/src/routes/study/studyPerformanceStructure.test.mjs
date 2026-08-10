import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const studyChartSource = fs.readFileSync(
	fileURLToPath(new URL('./StudyPatientChart.svelte', import.meta.url)),
	'utf8'
);
const categoryChartSource = fs.readFileSync(
	fileURLToPath(new URL('../../components/GenericCategoryChart.svelte', import.meta.url)),
	'utf8'
);
const genericTableSource = fs.readFileSync(
	fileURLToPath(new URL('../../components/GenericTable.svelte', import.meta.url)),
	'utf8'
);

const occurrences = (source, value) => source.split(value).length - 1;

test('study patient chart contains one backend fetch and local redraw handlers', () => {
	assert.equal(occurrences(studyChartSource, 'getStudyOverviewTable('), 1);
	assert.match(studyChartSource, /function renderBarChart\(\)/);
	assert.match(studyChartSource, /handleLogarithmToggled[\s\S]*?renderBarChart\(\)/);
	assert.match(studyChartSource, /noUiSlider[\s\S]*?renderBarChart\(\)/);
});

test('category chart fetches only in its data loader and redraws visual options locally', () => {
	assert.equal(occurrences(categoryChartSource, 'getCategoryChart('), 1);
	assert.match(categoryChartSource, /function loadCategoryData\(/);
	assert.match(categoryChartSource, /function renderCategoryChart\(/);
	for (const handler of ['handleLogarithmToggled', 'handleTop5Toggled', 'handleNull']) {
		const body = categoryChartSource.split(`function ${handler}`)[1].split('\n\t}')[0];
		assert.match(body, /renderCategoryChart\(\)/);
		assert.doesNotMatch(body, /loadCategoryData\(/);
	}
});

test('study components release manual subscriptions and DataTables on destroy', () => {
	assert.match(studyChartSource, /onDestroy\(\(\) =>/);
	assert.match(studyChartSource, /unsubscribeFilterActive\(\)/);
	assert.match(categoryChartSource, /chartTable\?\.destroy\(\)/);
	assert.match(categoryChartSource, /unsubscribeUser\(\)/);
	assert.match(genericTableSource, /genericTable\?\.destroy\(\)/);
	assert.match(genericTableSource, /unsubscribeVariant\(\)/);
});
