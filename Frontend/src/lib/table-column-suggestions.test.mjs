import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';

const source = await readFile(new URL('./table-column-suggestions.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { collectColumnSuggestions } = await import(
	'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
);

test('only reads up to the result cap, while a new query reaches values beyond the cap', async () => {
	const signal = new AbortController().signal;
	let count = 0;
	const read = (row) => {
		count++;
		return 'Value ' + row;
	};
	const initial = await collectColumnSuggestions(3000, read, 0, '', [], signal);
	assert.equal(count, 30);
	assert.equal(initial.length, 30);
	assert.deepEqual(await collectColumnSuggestions(3000, read, 0, 'UE 2999', [], signal), [
		'Value 2999'
	]);
});

test('uses literal substrings, skips blanks and duplicates, and respects other column filters', async () => {
	const rows = [
		['', 'A'],
		['   ', 'A'],
		['(a.b)', 'AB'],
		['(a.b)', 'A'],
		['(axb)', 'A'],
		['(a.b)+', 'C']
	];
	const read = (row, column) => rows[row][column];
	const signal = new AbortController().signal;
	assert.deepEqual(await collectColumnSuggestions(rows.length, read, 0, '', [], signal), [
		'(a.b)',
		'(axb)',
		'(a.b)+'
	]);
	assert.deepEqual(
		await collectColumnSuggestions(
			rows.length,
			read,
			0,
			'(A.B)',
			[{ column: 1, value: 'a' }],
			signal
		),
		['(a.b)']
	);
});

test('stops a superseded sparse lookup after yielding to the next input', async () => {
	const controller = new AbortController();
	let reads = 0;
	const pending = collectColumnSuggestions(
		100000,
		() => {
			reads++;
			return '';
		},
		0,
		'x',
		[],
		controller.signal
	);
	controller.abort();
	assert.deepEqual(await pending, []);
	assert.ok(reads < 100000);
});
