import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const componentUrl = new URL('./components/GenericStackedBarChart.svelte', import.meta.url);
const component = await readFile(componentUrl, 'utf8');

test('stacked bar charts create internal overflow when the expanded result has many bars', () => {
	assert.match(component, /if \(chartNeedsScroll\) return `\$\{scrollPlotHeight\}px`;/);
	assert.match(component, /plotHeightMin \+ \(categoryCount - 10\) \* additionalCategoryHeight/);
	assert.match(component, /\.chartAreaWrapper\s*{[^}]*overflow-y:\s*auto;/s);
});
