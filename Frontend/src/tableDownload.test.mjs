import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import test, { after } from 'node:test';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const outfile = '/tmp/ovis-tableDownload-test.mjs';
after(() => rm(outfile, { force: true }));

await build({
	entryPoints: ['Frontend/src/lib/table-download.ts'],
	outfile,
	bundle: true,
	format: 'esm',
	platform: 'node',
	logLevel: 'silent'
});

const tableDownload = await import(pathToFileURL(outfile).href);

test('serializeTableCsv preserves the existing semicolon export shape', () => {
	// Given
	const headers = ['A', 'B'];
	const rows = [{ A: 'one;two', B: null }];

	// When
	const csv = tableDownload.serializeTableCsv(headers, rows);

	// Then
	assert.equal(csv, 'A;B\n"one;two";');
});

test('serializeTableCsv follows the explicit column allowlist and neutralizes spreadsheet formulas', () => {
	// Given
	const headers = ['Visible', '=Header'];
	const fields = ['visible', 'formula'];
	const rows = [
		{
			visible: 'kept',
			formula: '  =HYPERLINK("https://example.invalid")',
			hiddenPatientName: 'must-not-leak'
		}
	];

	// When
	const csv = tableDownload.serializeTableCsv(headers, rows, fields);

	// Then
	assert.equal(csv, `Visible;'=Header\nkept;"'  =HYPERLINK(""https://example.invalid"")"`);
	assert.doesNotMatch(csv, /must-not-leak/);
	for (const formula of ['=1+1', '+1+1', '-1+1', '@SUM(A1:A2)', '\t=1+1', '\r+1+1']) {
		assert.match(
			tableDownload.serializeTableCsv(['value'], [{ value: formula }], ['value']),
			/\n"?'/
		);
	}
	assert.equal(
		tableDownload.serializeTableCsv(['value'], [{ value: -42 }], ['value']),
		'value\n-42'
	);
});

test('saveTableCsv requests a save location before loading and streams every dynamic row', async () => {
	// Given
	assert.equal(typeof tableDownload.saveTableCsv, 'function', 'saveTableCsv must be implemented');
	const rowCount = 70_123;
	const order = [];
	const writtenParts = [];
	const rows = Array.from({ length: rowCount }, (_, index) => ({
		id: index + 1,
		value:
			index === 35_000 ? 'Hash # bleibt; vollständig\nmit "Zitat" und Umlaut ä' : `value-${index}`
	}));
	const environment = {
		document: null,
		createObjectUrl: () => assert.fail('Blob fallback must not run when a file handle exists'),
		revokeObjectUrl: () => assert.fail('Blob fallback must not run when a file handle exists'),
		requestSaveFile: async () => {
			order.push('picker');
			return {
				createWritable: async () => ({
					write: async (part) => writtenParts.push(part),
					close: async () => order.push('closed')
				})
			};
		},
		scheduleCleanup: () => assert.fail('Blob fallback must not schedule cleanup'),
		yieldControl: async () => {}
	};

	// When
	const result = await tableDownload.saveTableCsv(
		{
			downloadName: 'patients',
			headers: ['id', 'value'],
			fields: ['id', 'value'],
			getRows: async () => {
				order.push('rows');
				return rows;
			},
			onProgress: () => {}
		},
		environment
	);

	// Then
	assert.deepEqual(order.slice(0, 2), ['picker', 'rows']);
	assert.equal(result, 'saved');
	const csv = writtenParts.join('');
	assert.equal(csv.split('\n').length, rowCount + 2);
	assert.match(csv, /Hash # bleibt/);
	assert.match(csv, /""Zitat""/);
});

test('saveTableCsv falls back to a Blob URL instead of a data URL', async () => {
	// Given
	assert.equal(typeof tableDownload.saveTableCsv, 'function', 'saveTableCsv must be implemented');
	let downloadedHref = '';
	let exportedBlob;
	let revokedUrl = '';
	const link = {
		href: '',
		download: '',
		style: { display: '' },
		click() {
			downloadedHref = this.href;
		}
	};
	const environment = {
		document: {
			createElement: () => link,
			body: { appendChild: () => {}, removeChild: () => {} }
		},
		createObjectUrl: (blob) => {
			exportedBlob = blob;
			return 'blob:ovis-complete-export';
		},
		revokeObjectUrl: (url) => {
			revokedUrl = url;
		},
		requestSaveFile: undefined,
		scheduleCleanup: (cleanup) => cleanup(),
		yieldControl: async () => {}
	};

	// When
	const result = await tableDownload.saveTableCsv(
		{
			downloadName: 'patients',
			headers: ['id', 'value'],
			fields: ['id', 'value'],
			getRows: async () => [{ id: 1, value: 'A#B;C' }],
			onProgress: () => {}
		},
		environment
	);

	// Then
	assert.equal(result, 'download-started');
	assert.equal(downloadedHref, 'blob:ovis-complete-export');
	assert.equal(revokedUrl, downloadedHref);
	const bytes = new Uint8Array(await exportedBlob.arrayBuffer());
	assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
	assert.equal(new TextDecoder().decode(bytes.slice(3)), 'id;value\n1;"A#B;C"');
});
