import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const appCss = await readFile(new URL('./app.css', import.meta.url), 'utf8');
const diagnosisPage = await readFile(
	new URL('./routes/diagnosis/+page.svelte', import.meta.url),
	'utf8'
);
const tableBuilder = await readFile(new URL('./tableBuilder.ts', import.meta.url), 'utf8');
const genericTable = await readFile(
	new URL('./components/GenericTable.svelte', import.meta.url),
	'utf8'
);

test('diagnosis tables own horizontal scrolling while their panels remain overflow-free', () => {
	assert.match(appCss, /\.table-scroll-container\s*{[^}]*overflow-x:\s*auto;/s);
	assert.match(
		tableBuilder,
		/\['generic_diagnosisHistologyTable', 'generic_diagnosisDiagnosticTable'\]\.includes\(tableID\)/
	);
	assert.ok(tableBuilder.includes('wrap(\'<div class="table-scroll-container"></div>\')'));
	assert.doesNotMatch(
		diagnosisPage,
		/\.histology-table,\s*\.diagnostic-table\s*{[^}]*overflow(?:-[xy])?\s*:/s
	);
});

test('narrow detail-table pagination uses compact controls', () => {
	assert.match(
		genericTable,
		/\.dataTables_paginate \.paginate_button\)[^{]*\{[^}]*min-width:\s*1\.5em;[^}]*margin-left:\s*1px;[^}]*padding:\s*0\.35em 0\.6em;/s
	);
});

test('last-column tooltips stay anchored to the table cell', () => {
	assert.match(appCss, /\.data-table td:last-child\s*\{[^}]*position:\s*relative;/s);
	assert.match(appCss, /\.data-table td:last-child \.tooltip\s*\{[^}]*position:\s*static;/s);
	assert.match(
		appCss,
		/\.data-table td:last-child \.tooltip \.tooltiptext\s*\{[^}]*right:\s*0;[^}]*left:\s*auto;/s
	);
});
