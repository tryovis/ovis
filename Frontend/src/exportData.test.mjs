import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

after(() => {
	delete globalThis.exportDataFetch;
});
const bundle = await build({
	entryPoints: [fileURLToPath(new URL('./lib/export-builder/data.ts', import.meta.url))],
	write: false,
	bundle: true,
	format: 'esm',
	platform: 'node',
	logLevel: 'silent',
	plugins: [
		{
			name: 'export-request-stub',
			setup(context) {
				context.onResolve({ filter: /graphQl\/gql-url$/ }, () => ({
					path: 'gql-url',
					namespace: 'test'
				}));
				context.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
					contents:
						"export const dataUrl = '/graphql'; export const graphqlFetch = (url, init) => globalThis.exportDataFetch(url, init);"
				}));
			}
		}
	]
});
const { loadExportData, loadExportFields } = await import(
	`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
const datasetIds = [
	'patient',
	'diagnosis',
	'therapy',
	'radiation',
	'histology',
	'tnm',
	'progress',
	'metastasis',
	'tumorBoard',
	'consultation',
	'status',
	'molecularMarker',
	'bioMaterial',
	'studyPatient',
	'supplementary',
	'diagnostic',
	'study',
	'kaplanMeier',
	'followUp'
];
const response = (endpoint, values) => ({
	ok: true,
	status: 200,
	json: async () => ({ data: { [endpoint]: values } })
});
const rowResponse = (rows) =>
	response(
		'getExportRows',
		rows.map((row) => JSON.stringify(row))
	);

test('all logical clinical datasets use the dedicated schema enum and export endpoints', async () => {
	const schema = await readFile(
		new URL('../../Backend/Apollo/schema/clinicalExport.graphql', import.meta.url),
		'utf8'
	);
	const allowed = schema
		.match(/enum ExportCollection\s*{([^}]+)}/)[1]
		.trim()
		.split(/\s+/);
	assert.deepEqual([...allowed].sort(), [...datasetIds].sort());
	assert.match(
		schema,
		/getExportFields\(collection: ExportCollection!, filter: String\): \[ExportField!\]!/
	);
	assert.match(schema, /getExportRows\(collection: ExportCollection!.*\): \[String!\]!/);
	const calls = [];
	globalThis.exportDataFetch = async (_url, init) => {
		const body = JSON.parse(init.body);
		calls.push(body);
		return response(
			body.query.includes('getExportFields') ? 'getExportFields' : 'getExportRows',
			[]
		);
	};
	assert.deepEqual(
		await loadExportFields(datasetIds),
		Object.fromEntries(datasetIds.map((id) => [id, []]))
	);
	assert.deepEqual(
		await loadExportData(datasetIds, null),
		Object.fromEntries(datasetIds.map((id) => [id, []]))
	);
	assert.equal(calls.length, datasetIds.length * 2);
	assert.ok(calls.every(({ query }) => !query.includes('continueFromID')));
});

test('discovery uses the full permitted scope and retains unknown, nested and array field paths', async () => {
	const calls = [];
	globalThis.exportDataFetch = async (url, init) => {
		const body = JSON.parse(init.body);
		calls.push({ url, ...body });
		return response('getExportFields', [
			{ id: 'hasMetastasis', type: 'NUMBER' },
			{ id: 'ICD.ICD10', type: 'TEXT' },
			{ id: 'custom.date', type: 'DATE' },
			{ id: 'events', type: 'TEXT' },
			{ id: 'events.unexpected-name', type: 'TEXT' }
		]);
	};
	const result = await loadExportFields(['diagnosis', 'diagnosis']);
	assert.deepEqual(result.diagnosis, [
		{ id: 'hasMetastasis', type: 'number' },
		{ id: 'ICD.ICD10', type: 'text' },
		{ id: 'custom.date', type: 'date' },
		{ id: 'events', type: 'text' },
		{ id: 'events.unexpected-name', type: 'text' }
	]);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, '/graphql');
	assert.deepEqual(calls[0].variables, { collection: 'diagnosis', filter: null });
	assert.ok(
		!calls[0].query.includes('events.unexpected-name'),
		'Mongo field names never enter GraphQL source'
	);
});

test('paging continues after short pages and preserves snapshot filters and duplicate radiation rows', async () => {
	const calls = [],
		progress = [];
	const filter = JSON.stringify({
		operand: 'AND',
		children: [{ system: 'diagnosis', key: 'tumorID', type: 'EQUALS', value: '42' }]
	});
	const rows = [
		{ _id: 'same-parent', therapyID: '133', areaDetailed: 'A' },
		{ _id: 'same-parent', therapyID: '133', areaDetailed: 'B' },
		{ _id: 'next-parent', therapyID: '134', areaDetailed: 'C' }
	];
	globalThis.exportDataFetch = async (url, init) => {
		const body = JSON.parse(init.body);
		calls.push({ url, ...body });
		return rowResponse(rows.slice(body.variables.offset, body.variables.offset + 2));
	};
	const result = await loadExportData(['radiation', 'radiation'], filter, {
		pageSize: 1000,
		onProgress: (value) => progress.push(value)
	});
	assert.deepEqual(
		calls.map((call) => call.variables.offset),
		[0, 2, 3]
	);
	assert.ok(
		calls.every(
			(call) =>
				call.url === '/graphql' &&
				call.variables.filter === filter &&
				call.variables.limit === 1000 &&
				call.variables.collection === 'radiation'
		)
	);
	assert.deepEqual(result.radiation, rows);
	assert.deepEqual(progress.at(-1), {
		dataset: 'radiation',
		loadedRows: 3,
		completedTables: 1,
		totalTables: 1
	});
});

test('flat JSON rows preserve all Mongo fields, raw dates, nulls and lossless array strings', async () => {
	const row = {
		_id: 'diagnosis-1',
		'ICD.ICD10': 'C50.9',
		diagnosisDate: Date.UTC(2025, 0, 14),
		hasMetastasis: 1,
		recurrence: 'false',
		'previousTherapy.surgery': 'true',
		reportDate: null,
		ECOG: JSON.stringify(['0', null, '1', '0']),
		'custom.events': JSON.stringify([{ date: null, value: 'a,b' }, { value: 'quoted"text' }]),
		'custom.events.value': JSON.stringify(['a,b', 'quoted"text']),
		futureField: 'not part of a curated catalogue'
	};
	globalThis.exportDataFetch = async (_url, init) =>
		rowResponse(JSON.parse(init.body).variables.offset ? [] : [row]);
	const result = await loadExportData(['diagnosis'], null);
	assert.deepEqual(result.diagnosis, [row]);
	assert.deepEqual(JSON.parse(result.diagnosis[0].ECOG), ['0', null, '1', '0']);
	assert.equal(result.diagnosis[0].missingField, undefined);
});

test('HTTP, GraphQL and missing endpoint errors fail visibly for discovery and rows', async () => {
	for (const load of [
		() => loadExportFields(['patient']),
		() => loadExportData(['patient'], null)
	]) {
		globalThis.exportDataFetch = async () => ({ ok: false, status: 503 });
		await assert.rejects(load(), {
			name: 'ExportError',
			key: 'exportErrorHttp',
			vars: { status: 503 }
		});
		globalThis.exportDataFetch = async () => ({
			ok: true,
			json: async () => ({ errors: [{ message: 'Access denied' }] })
		});
		await assert.rejects(load(), {
			key: 'exportErrorGraphqlDetails',
			vars: { details: 'Access denied' }
		});
		globalThis.exportDataFetch = async () => ({ ok: true, json: async () => ({ errors: [{}] }) });
		await assert.rejects(load(), { key: 'exportErrorGraphql', vars: {} });
		globalThis.exportDataFetch = async () => ({ ok: true, json: async () => ({ data: {} }) });
		await assert.rejects(load(), { key: 'exportErrorMissingTable', vars: { table: 'patient' } });
	}
});

test('invalid or duplicate schema fields are rejected instead of retaining a partial catalogue', async () => {
	for (const fields of [
		[null],
		[{ id: '', type: 'TEXT' }],
		[{ id: 'x', type: 'JSON' }],
		[
			{ id: 'x', type: 'TEXT' },
			{ id: 'x', type: 'DATE' }
		]
	]) {
		globalThis.exportDataFetch = async () => response('getExportFields', fields);
		await assert.rejects(loadExportFields(['diagnosis']), { key: 'exportErrorInvalidField' });
	}
});

test('invalid JSON rows and unflattened values remain translatable errors', async () => {
	for (const serialized of [null, {}, 'broken JSON', 'null', '[]', '42']) {
		globalThis.exportDataFetch = async () => response('getExportRows', [serialized]);
		await assert.rejects(loadExportData(['patient'], null), { key: 'exportErrorInvalidRow' });
	}
	for (const value of [[], {}, true]) {
		globalThis.exportDataFetch = async () => rowResponse([{ nested: value }]);
		await assert.rejects(loadExportData(['patient'], null), {
			key: 'exportErrorUnexpectedValue',
			vars: { field: 'nested' }
		});
	}
});

test('cancellation stops discovery and row paging and propagates the signal', async () => {
	for (const load of [
		(signal) => loadExportFields(['patient', 'therapy'], { signal }),
		(signal) => loadExportData(['patient', 'therapy'], null, { signal })
	]) {
		const controller = new AbortController();
		let calls = 0;
		globalThis.exportDataFetch = async (_url, init) => {
			calls++;
			assert.equal(init.signal, controller.signal);
			controller.abort();
			return rowResponse([{ _id: 'one' }]);
		};
		await assert.rejects(load(controller.signal), { name: 'AbortError' });
		await assert.rejects(load(controller.signal), { name: 'AbortError' });
		assert.equal(calls, 1);
	}
});

test('unknown administrative tables and invalid page sizes fail before any request', async () => {
	globalThis.exportDataFetch = async () => {
		throw new Error('Unexpected request');
	};
	for (const collection of ['user', 'exportAudit', 'privateCollection']) {
		await assert.rejects(loadExportFields(['patient', collection]), {
			key: 'exportErrorUnknownTable',
			vars: { table: collection }
		});
		await assert.rejects(loadExportData(['patient', collection], null), {
			key: 'exportErrorUnknownTable',
			vars: { table: collection }
		});
	}
	await assert.rejects(loadExportData(['patient'], null, { pageSize: 0 }), {
		key: 'exportErrorInvalidPageSize'
	});
	assert.deepEqual(await loadExportData([], null), {});
	assert.deepEqual(await loadExportFields([]), {});
});
