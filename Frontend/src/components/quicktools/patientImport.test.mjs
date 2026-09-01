import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const outfile = join(tmpdir(), 'ovis-patient-import-test.mjs');

await build({
	entryPoints: ['Frontend/src/components/quicktools/patientImport.ts'],
	outfile,
	bundle: true,
	format: 'esm',
	platform: 'node',
	logLevel: 'silent'
});

const { parseIdsFromPasteEvent, parseIdsFromText } = await import(pathToFileURL(outfile).href);

test('parseIdsFromText keeps one patient ID per CRLF row and ignores later tab-separated columns', () => {
	// Given
	const excelClipboardText = '12345678\tignored\r\n12345679\tignored';

	// When
	const parsed = parseIdsFromText(excelClipboardText);

	// Then
	assert.deepEqual(parsed, {
		idsRaw: ['12345678', '12345679'],
		attemptedRows: 2
	});
});

test('parseIdsFromText splits patient IDs when Excel collapses rows into one space-separated line', () => {
	// Given
	const collapsedExcelClipboardText = '12345678 12345679 12345680';

	// When
	const parsed = parseIdsFromText(collapsedExcelClipboardText);

	// Then
	assert.deepEqual(parsed, {
		idsRaw: ['12345678', '12345679', '12345680'],
		attemptedRows: 3
	});
});

test('parseIdsFromText ignores empty tokens in mixed whitespace and lone-CR input', () => {
	// Given
	const mixedExcelClipboardText = '12345678\r   12345679   12345680';

	// When
	const parsed = parseIdsFromText(mixedExcelClipboardText);

	// Then
	assert.deepEqual(parsed, {
		idsRaw: ['12345678', '12345679', '12345680'],
		attemptedRows: 3
	});
});

test('parseIdsFromText skips an Excel header and blank rows without merging patient IDs', () => {
	// Given
	const excelClipboardText = 'patient_id\r\n\r\n34 0011184161';

	// When
	const parsed = parseIdsFromText(excelClipboardText);

	// Then
	assert.deepEqual(parsed, {
		idsRaw: ['34', '0011184161'],
		attemptedRows: 3
	});
});

test('parseIdsFromPasteEvent parses the collapsed screenshot payload', () => {
	// Given
	let defaultPrevented = false;
	const pasteEvent = {
		clipboardData: {
			getData: () => '34 0011184161 0023272442 0022774023'
		},
		preventDefault: () => {
			defaultPrevented = true;
		}
	};

	// When
	const parsed = parseIdsFromPasteEvent(pasteEvent);

	// Then
	assert.deepEqual(parsed, {
		idsRaw: ['34', '0011184161', '0023272442', '0022774023'],
		attemptedRows: 4
	});
	assert.equal(
		defaultPrevented,
		true,
		'paste must be consumed before the browser inserts one raw line'
	);
});

test('parseIdsFromText preserves all 11 screenshot-like patient IDs and leading zeroes', () => {
	// Given
	const collapsedPatientIds =
		'34 0011184161 0023272442 0022774023 0000000105 0000000106 0000000107 0000000108 0000000109 0000000110 0000000111';

	// When
	const parsed = parseIdsFromText(collapsedPatientIds);

	// Then
	assert.deepEqual(parsed, {
		idsRaw: [
			'34',
			'0011184161',
			'0023272442',
			'0022774023',
			'0000000105',
			'0000000106',
			'0000000107',
			'0000000108',
			'0000000109',
			'0000000110',
			'0000000111'
		],
		attemptedRows: 11
	});
});
