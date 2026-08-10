import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outfile = path.join(frontendRoot, '.svelte-kit', 'ovis-table-page-parallel-test.mjs');

await build({
	stdin: {
		contents: `export { loadTablePageInParallel } from './src/graphQl/table-page.ts';`,
		resolveDir: frontendRoot,
		sourcefile: 'table-page-parallel-test-entry.ts'
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

const { loadTablePageInParallel } = await import(pathToFileURL(outfile).href);

test('starts row, total and filtered requests before waiting for any result', async () => {
	const started = [];
	const resolvers = {};
	const deferred = (name, value) => () => {
		started.push(name);
		return new Promise((resolve) => {
			resolvers[name] = () => resolve(value);
		});
	};

	const pagePromise = loadTablePageInParallel({
		loadRows: deferred('rows', [{ id: 1 }]),
		loadTotal: deferred('total', 10),
		loadFiltered: deferred('filtered', 2)
	});

	assert.deepEqual(started.sort(), ['filtered', 'rows', 'total']);
	resolvers.rows();
	resolvers.total();
	resolvers.filtered();
	assert.deepEqual(await pagePromise, { rows: [{ id: 1 }], total: 10, filtered: 2 });
});

test('reuses the total result when no column filter count is needed', async () => {
	let totalCalls = 0;
	const page = await loadTablePageInParallel({
		loadRows: async () => [],
		loadTotal: async () => {
			totalCalls += 1;
			return 7;
		}
	});

	assert.equal(totalCalls, 1);
	assert.deepEqual(page, { rows: [], total: 7, filtered: 7 });
});
