import assert from 'node:assert/strict';
import { constants } from 'node:buffer';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { appendQueryResult, jsonArrayChunks } from './jsonExport.mjs';

async function fixture(t) {
	const directory = await mkdtemp(path.join(tmpdir(), 'ovis-json-export-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const files = {
		outTxtPath: path.join(directory, 'out.txt'),
		omockPath: path.join(directory, 'omock.json.tmp')
	};
	await writeFile(files.omockPath, '\n{\n');
	return files;
}

test('preserves JSON values, Unicode, escaping and empty collections', () => {
	const rows = [
		{
			therapyID: 7,
			label: 'Würzburg: "Therapie" \\ \n 💊',
			date: new Date('2026-09-24T10:00:00Z'),
			subTypeCode: null,
			unused: undefined,
			nested: { items: [true, false, null, 1.5] }
		},
		null,
		undefined
	];
	assert.deepEqual(
		JSON.parse([...jsonArrayChunks(rows)].join('')),
		JSON.parse(JSON.stringify(rows))
	);
	assert.equal([...jsonArrayChunks([])].join(''), '[]');
});

test('writes consecutive collections and retains the UTMS append format', async (t) => {
	const files = await fixture(t);
	const therapy = Array.from({ length: 3000 }, (_, therapyID) => ({
		therapyID,
		label: `Therapie ${therapyID} mit Umlauten äöü`,
		radioNuclid: null
	}));
	for (const [index, [key, rows]] of Object.entries({
		patient: [],
		therapy,
		status: []
	}).entries()) {
		await appendQueryResult({ ...files, key, rows, hasExistingEntries: index > 0 });
	}
	// UTMS appends its study entry to the open root object before it is finalized.
	await writeFile(files.omockPath, ',\n"study": [{"studyID":"test"}]\n}\n', { flag: 'a' });
	const omock = JSON.parse(await readFile(files.omockPath, 'utf8'));
	assert.deepEqual(omock, { patient: [], therapy, status: [], study: [{ studyID: 'test' }] });
	const out = await readFile(files.outTxtPath, 'utf8');
	assert.deepEqual(JSON.parse(`{${out.replace(/,\s*$/, '')}}`), {
		patient: [],
		therapy,
		status: []
	});
});

test('handles an individual row larger than the usual output chunk', () => {
	const rows = [{ text: '💊'.repeat(70000) }, { therapyID: 2 }];
	assert.deepEqual(JSON.parse([...jsonArrayChunks(rows)].join('')), rows);
});

test('propagates serialization failure and leaves the export incomplete', async (t) => {
	const files = await fixture(t);
	const circular = {};
	circular.self = circular;
	await assert.rejects(
		appendQueryResult({ ...files, key: 'therapy', rows: [circular], hasExistingEntries: false }),
		/circular/i
	);
	const incomplete = await readFile(files.omockPath, 'utf8');
	assert.throws(() => JSON.parse(incomplete));
});

test('propagates file errors instead of reporting a completed export', async (t) => {
	const files = await fixture(t);
	await assert.rejects(
		appendQueryResult({
			...files,
			omockPath: path.join(path.dirname(files.omockPath), 'missing', 'omock.json'),
			key: 'therapy',
			rows: [],
			hasExistingEntries: false
		}),
		{ code: 'ENOENT' }
	);
});

test('serializes a collection beyond the real V8 string limit in bounded chunks', () => {
	const row = { therapyID: 1, text: 'x'.repeat(8192), radioNuclid: null };
	const rowLength = JSON.stringify(row).length;
	const rowCount = Math.ceil(constants.MAX_STRING_LENGTH / (rowLength + 2)) + 1;
	function* rows() {
		for (let index = 0; index < rowCount; index += 1) yield row;
	}
	let length = 0;
	let largestChunk = 0;
	for (const chunk of jsonArrayChunks(rows())) {
		length += chunk.length;
		largestChunk = Math.max(largestChunk, chunk.length);
	}
	assert.equal(length, rowCount * rowLength + (rowCount - 1) * 2 + 2);
	assert.ok(length > constants.MAX_STRING_LENGTH);
	assert.ok(largestChunk <= 64 * 1024 + 1);
});
