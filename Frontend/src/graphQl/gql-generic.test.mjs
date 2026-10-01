import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(new URL('./gql-generic.ts', import.meta.url));
const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
	compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText;

function categoryClient(response) {
	let request;
	const exports = {};
	vm.runInNewContext(
		source,
		{
			exports,
			require: (name) => {
				assert.equal(name, './gql-url');
				return {
					dataUrl: '/graphql',
					graphqlFetch: async (_url, init) => {
						request = JSON.parse(init.body);
						return response;
					}
				};
			}
		},
		{ filename: path.basename(filename) }
	);
	return { ...exports, request: () => request };
}

test('a successful empty category response remains an empty result', async () => {
	const chart = { label: [], count: [] };
	const client = categoryClient({
		ok: true,
		json: async () => ({ data: { getCategoryChart: chart } })
	});
	assert.equal(
		await client.getCategoryChart('phase', 'study', '{"operand":"OR","children":[]}'),
		chart
	);
	assert.match(client.request().query, /selectedType: phase/);
});

test('HTTP and GraphQL failures reject instead of masquerading as missing data', async () => {
	const responses = [
		{ ok: false, status: 503 },
		{ ok: true, json: async () => ({ data: null, errors: [{ message: 'failed' }] }) },
		{
			ok: true,
			json: async () => ({ data: { getCategoryChart: null }, errors: [{ message: 'failed' }] })
		},
		{
			ok: true,
			json: async () => ({
				data: { getCategoryChart: { label: ['I'], count: [2] } },
				errors: [{ message: 'partial' }]
			})
		}
	];
	for (const response of responses) {
		await assert.rejects(categoryClient(response).getCategoryChart('phase', 'study', '{}'));
	}
});

test('malformed category results reject while valid missing-value categories are retained', async () => {
	for (const chart of [null, {}, { label: ['I'], count: [] }]) {
		const client = categoryClient({
			ok: true,
			json: async () => ({ data: { getCategoryChart: chart } })
		});
		await assert.rejects(
			client.getCategoryChart('phase', 'study', '{}'),
			/Invalid category chart response/
		);
	}
	const chart = { label: [null, 'I'], count: [3, 2] };
	const client = categoryClient({
		ok: true,
		json: async () => ({ data: { getCategoryChart: chart } })
	});
	assert.equal(await client.getCategoryChart('phase', 'study', '{}'), chart);
});

test('last data update returns the stored timestamp or an explicitly absent import', async () => {
	for (const metadata of [null, { executedAt: '2026-10-01T02:15:00.000Z' }]) {
		const client = categoryClient({
			ok: true,
			json: async () => ({ data: { getLastMetaData: metadata } })
		});
		assert.equal(await client.getLastMetaData(), metadata);
		assert.match(client.request().query, /getLastMetaData\s*\{\s*executedAt/);
	}
});

test('last data update rejects authentication, GraphQL and malformed responses', async () => {
	for (const response of [
		{ ok: false, status: 401 },
		{ ok: false, status: 503 },
		{ ok: true, json: async () => ({ data: { getLastMetaData: null }, errors: [{ message: 'denied' }] }) },
		{ ok: true, json: async () => ({ data: {} }) }
	]) {
		await assert.rejects(categoryClient(response).getLastMetaData(), /Last data update|Invalid last data update/);
	}
});
