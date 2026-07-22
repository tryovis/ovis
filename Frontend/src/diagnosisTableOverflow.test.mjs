import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const appCss = await readFile(new URL('./app.css', import.meta.url), 'utf8');
const diagnosisPage = await readFile(
	new URL('./routes/diagnosis/+page.svelte', import.meta.url),
	'utf8'
);
const tableBuilder = await readFile(new URL('./tableBuilder.ts', import.meta.url), 'utf8');

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
