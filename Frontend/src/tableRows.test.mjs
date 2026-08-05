import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const outfile = '/tmp/ovis-tableRows-test.mjs';

await build({
	entryPoints: ['Frontend/src/tableRows.ts'],
	outfile,
	bundle: true,
	format: 'esm',
	platform: 'node',
	logLevel: 'silent'
});

const { calculateTableShownRows } = await import(pathToFileURL(outfile).href);

test('calculateTableShownRows uses the current table panel height instead of another table panel', () => {
	const firstPanelRows = calculateTableShownRows({
		panelHeight: 430,
		hasNavbar: false,
		fallbackRows: 10
	});
	const currentPanelRows = calculateTableShownRows({
		panelHeight: 330,
		hasNavbar: false,
		fallbackRows: 10
	});

	assert.equal(firstPanelRows, 8);
	assert.equal(currentPanelRows, 5);
});

test('calculateTableShownRows uses fallback only when panel height is missing', () => {
	assert.equal(
		calculateTableShownRows({
			panelHeight: undefined,
			hasNavbar: false,
			fallbackRows: 10
		}),
		10
	);

	assert.equal(
		calculateTableShownRows({
			panelHeight: 120,
			hasNavbar: false,
			fallbackRows: 10
		}),
		1
	);
});

test('calculateTableShownRows uses the rendered row height when provided', () => {
	assert.equal(
		calculateTableShownRows({
			panelHeight: 430,
			hasNavbar: false,
			fallbackRows: 10,
			rowHeight: 26
		}),
		10
	);
});
