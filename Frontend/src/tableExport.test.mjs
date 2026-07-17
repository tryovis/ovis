import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import test, { after } from 'node:test';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const outfile = '/tmp/ovis-tableExport-test.mjs';
after(() => rm(outfile, { force: true }));

await build({
	entryPoints: ['Frontend/src/graphQl/table-page.ts'],
	outfile,
	bundle: true,
	format: 'esm',
	platform: 'node',
	logLevel: 'silent',
	plugins: [
		{
			name: 'stub-gql-url',
			setup(buildContext) {
				buildContext.onResolve({ filter: /^\.\/gql-url$/ }, () => ({
					path: 'gql-url',
					namespace: 'test'
				}));
				buildContext.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
					contents: `
						export const dataUrl = '';
						export const graphqlFetch = () => { throw new Error('not used'); };
						export const setActiveTableRequest = () => {};
					`
				}));
			}
		}
	]
});

const { fetchAllTableRows } = await import(pathToFileURL(outfile).href);

test('fetchAllTableRows exports every filtered row independently of the visible page', async () => {
	// Given
	const rows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
	const requests = [];
	const baseRequest = {
		offset: 2,
		limit: 2,
		sortField: 'id',
		sortDirection: 'asc',
		columnFilters: [{ field: 'status', value: 'active' }]
	};

	// When
	const exportedRows = await fetchAllTableRows({
		baseRequest,
		totalRows: rows.length,
		pageSize: 2,
		fetchPage: async (request) => {
			requests.push(request);
			return rows.slice(request.offset, request.offset + request.limit);
		}
	});

	// Then
	assert.deepEqual(
		exportedRows.map((row) => row.id),
		[1, 2, 3, 4, 5]
	);
	assert.deepEqual(
		requests.map((request) => request.offset),
		[0, 2, 4, 5]
	);
	assert.ok(requests.every((request) => request.sortField === 'id'));
	assert.ok(requests.every((request) => request.sortDirection === 'asc'));
	assert.ok(
		requests.every(
			(request) =>
				request.columnFilters[0]?.field === 'status' && request.columnFilters[0].value === 'active'
		)
	);
});

test('fetchAllTableRows continues to the actual dynamic end when pages are shorter than requested', async () => {
	// Given
	const rows = Array.from({ length: 7 }, (_, index) => ({ id: index + 1 }));
	const requests = [];
	const progress = [];
	const baseRequest = {
		offset: 20,
		limit: 3,
		sortField: 'id',
		sortDirection: 'asc',
		columnFilters: []
	};

	// When
	const exportedRows = await fetchAllTableRows({
		baseRequest,
		totalRows: 5,
		pageSize: 3,
		fetchPage: async (request) => {
			requests.push(request);
			const backendPageCap = 2;
			return rows.slice(request.offset, request.offset + backendPageCap);
		},
		onProgress: (loadedRows, expectedRows) => progress.push([loadedRows, expectedRows])
	});

	// Then
	assert.deepEqual(
		exportedRows.map((row) => row.id),
		[1, 2, 3, 4, 5, 6, 7]
	);
	assert.deepEqual(
		requests.map((request) => request.offset),
		[0, 2, 4, 6, 7]
	);
	assert.deepEqual(progress.at(-1), [7, 7]);
});
