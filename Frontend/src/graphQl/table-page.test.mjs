/* global globalThis */
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const outfile = '/tmp/ovis-table-page-test.mjs';
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

await build({
	stdin: {
		contents: `
			export { fetchTableRows } from './src/graphQl/table-page.ts';
			export { graphqlFetch } from './src/graphQl/gql-url.ts';
		`,
		resolveDir: frontendRoot,
		sourcefile: 'table-page-test-entry.ts'
	},
	outfile,
	bundle: true,
	format: 'esm',
	platform: 'node',
	logLevel: 'silent',
	plugins: [
		{
			name: 'sveltekit-aliases',
			setup(build) {
				build.onResolve({ filter: /^\$lib\// }, (args) => ({
					path: path.resolve(frontendRoot, 'src/lib', `${args.path.slice('$lib/'.length)}.ts`)
				}));
				build.onResolve({ filter: /^\$app\/paths$/ }, () => ({
					path: '$app/paths',
					namespace: 'sveltekit-stub'
				}));
				build.onLoad({ filter: /.*/, namespace: 'sveltekit-stub' }, () => ({
					contents: "export const base = '';",
					loader: 'js'
				}));
			}
		}
	]
});

const { fetchTableRows, graphqlFetch } = await import(pathToFileURL(outfile).href);

const patientQuery = `
	query getPatientCohortOverviewTable ($continueFromID: String, $limit: Int, $filter: String) {
		getAllPatient(continueFromID: $continueFromID, limit: $limit, filter: $filter) {
			_id
			patID
		}
	}
`;

test('table paging does not rewrite a concurrent patient-index request', async () => {
	const requests = [];
	let finishTableRequest;
	const tableResponse = new Promise((resolve) => {
		finishTableRequest = resolve;
	});
	const originalFetch = globalThis.fetch;

	globalThis.fetch = async (_url, init) => {
		requests.push(JSON.parse(init.body));
		if (requests.length === 1) return tableResponse;
		return {};
	};

	try {
		const tableRequest = fetchTableRows(
			() =>
				graphqlFetch('/graphql', {
					method: 'POST',
					body: JSON.stringify({
						query: patientQuery,
						variables: { continueFromID: null, limit: 1, filter: null }
					})
				}).then(() => []),
			{
				offset: 40,
				limit: 10,
				sortField: 'birthDate',
				sortDirection: 'asc',
				columnFilters: [{ field: 'gender', value: 'w' }]
			},
			null
		);

		await graphqlFetch('/graphql', {
			method: 'POST',
			body: JSON.stringify({
				query: patientQuery,
				variables: { continueFromID: 'patient-index-cursor', limit: 2000, filter: null }
			})
		});

		finishTableRequest({});
		await tableRequest;

		assert.equal(requests.length, 2);
		assert.deepEqual(requests[0].variables, {
			continueFromID: null,
			limit: 10,
			filter: null,
			offset: 40,
			sortField: 'birthDate',
			sortDirection: 'asc',
			columnFilters: [{ field: 'gender', value: 'w' }]
		});
		assert.deepEqual(requests[1].variables, {
			continueFromID: 'patient-index-cursor',
			limit: 2000,
			filter: null
		});
		assert.doesNotMatch(requests[1].query, /\$offset/);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
