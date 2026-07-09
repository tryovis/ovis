import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const outfile = '/tmp/ovis-tableColumnVariants-test.mjs';

await build({
	entryPoints: ['Frontend/src/tableColumnVariants.ts'],
	outfile,
	bundle: true,
	format: 'esm',
	platform: 'node',
	logLevel: 'silent'
});

const { buildTableHeaders, filterColumnsForImportMode, normalizeImportMode } = await import(
	pathToFileURL(outfile).href
);

const columns = [
	{ data: 'patID', header: 'PID' },
	{ data: 'version', header: 'v', ovis: false },
	{ data: 'type', header: 'Type' },
	{ data: 'a', header: 'a', ccp: false },
	{ data: 'singleDoseUnit', header: 'SD Unit', ovis: false },
	{ data: 'boost', header: 'Boost', ovis: true },
	{ data: 'radioTarget', header: 'Tissue', ccp: false },
	{ data: 'lymphNodes', header: 'LN', ccp: false }
];

test('filterColumnsForImportMode keeps Onkostar/OVis columns aligned with current headers', () => {
	const filtered = filterColumnsForImportMode(columns, 'onkostar');

	assert.deepEqual(
		filtered.map((column) => column.data),
		['patID', 'type', 'a', 'boost', 'radioTarget', 'lymphNodes']
	);
	assert.deepEqual(buildTableHeaders(filtered), ['_id', 'PID', 'Type', 'a', 'Boost', 'Tissue', 'LN']);
});

test('filterColumnsForImportMode keeps CCP-specific columns without Onkostar-only fields', () => {
	const filtered = filterColumnsForImportMode(columns, 'ccp');

	assert.deepEqual(
		filtered.map((column) => column.data),
		['patID', 'version', 'type', 'singleDoseUnit']
	);
	assert.deepEqual(buildTableHeaders(filtered), ['_id', 'PID', 'v', 'Type', 'SD Unit']);
});

test('filterColumnsForImportMode keeps Credos as a non-CCP, non-Onkostar variant', () => {
	const filtered = filterColumnsForImportMode(columns, 'credos');

	assert.deepEqual(
		filtered.map((column) => column.data),
		['patID', 'version', 'type', 'a', 'singleDoseUnit', 'radioTarget', 'lymphNodes']
	);
	assert.deepEqual(buildTableHeaders(filtered), [
		'_id',
		'PID',
		'v',
		'Type',
		'a',
		'SD Unit',
		'Tissue',
		'LN'
	]);
});

test('normalizeImportMode keeps legacy empty/demo mode compatible with Onkostar/OVis tables', () => {
	assert.equal(normalizeImportMode(undefined), 'ovis');
	assert.equal(normalizeImportMode(''), 'ovis');
	assert.equal(normalizeImportMode('demo'), 'ovis');
	assert.equal(normalizeImportMode('ONKOSTAR'), 'onkostar');
});
