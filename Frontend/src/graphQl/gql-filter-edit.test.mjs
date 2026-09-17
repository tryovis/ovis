import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const { normalizeAstKey } = require('../../../Backend/Apollo/astUtils.js');
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { outputFiles } = await build({
	stdin: {
		contents: `
			export { getValueOptions } from './src/graphQl/gql-filter-edit.ts';
			export { setTestFetch } from './src/graphQl/gql-url';
		`,
		resolveDir: frontendRoot,
		sourcefile: 'gql-filter-edit-test-entry.ts'
	},
	write: false,
	bundle: true,
	format: 'esm',
	platform: 'node',
	logLevel: 'silent',
	plugins: [
		{
			name: 'mock-graphql-transport',
			setup(build) {
				build.onResolve({ filter: /(?:^|\/)gql-url$/ }, () => ({
					path: 'gql-url',
					namespace: 'test-transport'
				}));
				build.onLoad({ filter: /.*/, namespace: 'test-transport' }, () => ({
					contents: `
					export const dataUrl = '/graphql';
					let fetcher;
					export const setTestFetch = (next) => { fetcher = next; };
					export const graphqlFetch = (...args) => fetcher(...args);
				`,
					loader: 'js'
				}));
			}
		}
	]
});
const { getValueOptions, setTestFetch } = await import(
	`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`
);
const success = (values) => ({
	ok: true,
	json: async () => ({ data: { getValueOptions: values } })
});

test('value-options requests use the same field paths as the backend AST translator', async () => {
	const cases = [
		['_id', '_id'],
		['patient_id', 'patient_id'],
		['ICDO_topography', 'ICDO_topography'],
		['ICDO_morphology', 'ICDO_morphology'],
		['grading_value', 'grading_value'],
		['ICD_ICD10_3', 'ICD.ICD10_3'],
		['ops_code', 'ops.code'],
		['radiation_location_subCode', 'radiation.location.subCode'],
		['already.nested.path', 'already.nested.path'],
		['gender', 'gender'],
		['!ops_code', 'ops.code']
	];
	const requests = [];
	setTestFetch(async (url, request) => {
		requests.push({ url, ...request, body: JSON.parse(request.body) });
		return success(['A', null, '', '0']);
	});
	for (const [catalogueKey, expected] of cases) {
		assert.deepEqual(await getValueOptions(catalogueKey, 'therapy'), ['A', '', '0']);
		const request = requests.at(-1);
		assert.equal(request.url, '/graphql');
		assert.equal(request.method, 'POST');
		assert.equal(request.headers['Content-Type'], 'application/json');
		assert.deepEqual(request.body.variables, { field: expected, collection: 'therapy' });
		assert.equal(expected, normalizeAstKey(catalogueKey.replace(/^!/, '')));
		assert.match(request.body.query, /getValueOptions\(field: \$field, collection: \$collection\)/);
	}
	assert.equal(requests.length, cases.length);
});

test('empty successful value options stay a successful empty result', async () => {
	setTestFetch(async () => success([]));
	assert.deepEqual(await getValueOptions('gender', 'patient'), []);
});

test('HTTP, GraphQL, malformed and network failures reject so the editor can retry', async () => {
	const failures = [
		async () => ({ ok: false, json: async () => ({}) }),
		async () => ({ ok: true, json: async () => ({ errors: [{ message: 'Temporary error' }] }) }),
		async () => ({ ok: true, json: async () => ({ data: { getValueOptions: null } }) }),
		async () => ({ ok: true, json: async () => ({ data: {} }) }),
		async () => {
			throw new Error('Network unavailable');
		},
		async () => ({
			ok: true,
			json: async () => {
				throw new Error('Invalid JSON');
			}
		})
	];
	for (const fetcher of failures) {
		setTestFetch(fetcher);
		await assert.rejects(getValueOptions('gender', 'patient'));
		setTestFetch(async () => success(['m', 'f']));
		assert.deepEqual(await getValueOptions('gender', 'patient'), ['m', 'f']);
	}
});
