/* global globalThis */
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import ts from 'typescript';
import { compile, preprocess } from 'svelte/compiler';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const transpile = (source) =>
	ts.transpileModule(source, {
		compilerOptions: {
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.ESNext,
			verbatimModuleSyntax: true
		}
	}).outputText;
const bundle = await build({
	stdin: {
		contents: `
			export { getSpecializedTherapyTable, therapyTypeFilter } from './src/graphQl/gql-therapy-specialized.ts';
			export { getTherapyOperationTable } from './src/graphQl/gql-therapy-operation.ts';
			export { getTherapySystemicTable } from './src/graphQl/gql-therapy-systemic.ts';
			export { fetchTableRows, fetchAllTableRows, getTableCount, loadTablePageInParallel } from './src/graphQl/table-page.ts';
			export { withFixedFilter } from './src/graphQl/scoped-filter.ts';
			export { default as OperationTable } from './src/routes/therapy-operation/TherapyOperationTable.svelte';
			export { default as SystemicTable } from './src/routes/therapy-systemic/TherapySystemicTable.svelte';
			export { readCapturedTableProps } from './src/components/GenericTable.svelte';
		`,
		resolveDir: frontendRoot,
		sourcefile: 'specialized-therapy-test.ts'
	},
	write: false,
	bundle: true,
	format: 'esm',
	platform: 'node',
	logLevel: 'silent',
	plugins: [
		{
			name: 'sveltekit-aliases',
			setup(build) {
				build.onLoad({ filter: /GenericTable\.svelte$/ }, () => ({
					contents: `
						import { create_ssr_component } from 'svelte/internal';
						let captured;
						export const readCapturedTableProps = () => captured;
						export default create_ssr_component((_result, props) => {
							captured = props;
							return '';
						});
					`,
					loader: 'js'
				}));
				build.onLoad({ filter: /\.svelte$/ }, async (args) => {
					const source = await preprocess(fs.readFileSync(args.path, 'utf8'), {
						script: ({ content }) => ({ code: transpile(content) })
					});
					return {
						contents: compile(source.code, { filename: args.path, generate: 'ssr' }).js.code,
						loader: 'js'
					};
				});
				build.onResolve({ filter: /^\$lib\// }, (args) => ({
					path: path.resolve(frontendRoot, 'src/lib', `${args.path.slice('$lib/'.length)}.ts`)
				}));
				build.onResolve({ filter: /^\$app\/paths$/ }, () => ({
					path: '$app/paths',
					namespace: 'stub'
				}));
				build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
					contents: "export const base = '';",
					loader: 'js'
				}));
			}
		}
	]
});
const {
	getSpecializedTherapyTable,
	therapyTypeFilter,
	getTherapyOperationTable,
	getTherapySystemicTable,
	fetchTableRows,
	fetchAllTableRows,
	getTableCount,
	loadTablePageInParallel,
	withFixedFilter,
	OperationTable,
	SystemicTable,
	readCapturedTableProps
} = await import(
	`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

test('specialized therapy rows use server paging, sorting and search with their fixed scope', async () => {
	const requests = [];
	const originalFetch = globalThis.fetch;
	const source = {
		therapyID: 'NUK-1',
		therapyOccurrenceDate: 0,
		therapyEndDate: null,
		therapyDaysSinceDiagnosis: 0,
		subType: 'PSMA-Therapie',
		subTypeCode: 'PSMA',
		radioNuclid: 'Lutetium-177',
		radioNuclidCode: 'Lu177'
	};
	globalThis.fetch = async (_url, init) => {
		requests.push(JSON.parse(init.body));
		return { ok: true, json: async () => ({ data: { getAllTherapies: [source] } }) };
	};
	try {
		for (const generalType of ['nuclear', 'other']) {
			const filter = withFixedFilter(
				'{"operand":"OR","children":[]}',
				therapyTypeFilter(generalType)
			);
			const rows = await fetchTableRows(
				getSpecializedTherapyTable,
				{
					offset: 30,
					limit: 10,
					sortField: 'subType',
					sortDirection: 'asc',
					columnFilters: [{ field: 'subType', value: 'PSMA' }]
				},
				filter
			);
			const request = requests.at(-1);
			assert.match(request.query, /offset: \$offset, sortField: \$sortField/);
			for (const field of [
				'therapyDaysSinceDiagnosis',
				'subTypeCode',
				'radioNuclid',
				'radioNuclidCode',
				'radiopharmaceutical',
				'radiopharmaceuticalCode'
			]) {
				assert.ok(request.query.includes(field));
			}
			assert.deepEqual(request.variables, {
				continueFromID: null,
				limit: 10,
				filter,
				offset: 30,
				sortField: 'subType',
				sortDirection: 'asc',
				columnFilters: [{ field: 'subType', value: 'PSMA' }]
			});
			assert.equal(JSON.parse(request.variables.filter).children[0].value, generalType);
			assert.equal(rows[0].therapyOccurrenceDate, '01.01.1970');
			assert.equal(rows[0].therapyEndDate, null);
			assert.equal(rows[0].therapyDaysSinceDiagnosis, 0);
			assert.equal(rows[0].radioNuclidCode, 'Lu177');
			assert.equal(source.therapyOccurrenceDate, 0, 'formatting does not mutate transport data');
		}
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test('failed and malformed therapy responses reject instead of becoming empty cohorts', async () => {
	const originalFetch = globalThis.fetch;
	try {
		for (const response of [
			{ ok: false, status: 503 },
			{ ok: true, json: async () => ({ errors: [{ message: 'failed' }] }) },
			{ ok: true, json: async () => ({ data: { getAllTherapies: null } }) }
		]) {
			globalThis.fetch = async () => response;
			await assert.rejects(getSpecializedTherapyTable(null, 10, null));
		}
	} finally {
		globalThis.fetch = originalFetch;
	}
});

const patientLeaf = { key: 'patID', type: 'EQUALS', system: 'patient', value: 'P1' };
const patientOr = {
	operand: 'OR',
	children: [patientLeaf, { ...patientLeaf, value: 'P2' }]
};
const cohortCases = [patientLeaf, patientOr];
const candidates = ['operation', 'systemic', 'other'].flatMap((generalType) =>
	['P1', 'P2', 'P3'].map((patID) => ({ generalType, patID, therapyID: `${generalType}-${patID}` }))
);
function matchesCohort(node, row) {
	if (node.operand === 'AND') return node.children.every((child) => matchesCohort(child, row));
	if (node.operand === 'OR') return node.children.some((child) => matchesCohort(child, row));
	assert.equal(node.type, 'EQUALS');
	return row[node.key] === node.value;
}
function assertScopedCohort(filter, type, cohort) {
	assert.deepEqual(
		candidates.filter((row) => matchesCohort(JSON.parse(filter), row)),
		candidates.filter((row) => row.generalType === type && matchesCohort(cohort, row)),
		'Therapy scope intersects every cohort branch and retains single patient conditions'
	);
}

// Run the real table loading/export methods with props supplied by the compiled
// route. This catches a missing fixedFilter on the route, which affects counts
// even when the row query independently adds the correct therapy type.
const genericTableSource = fs.readFileSync(
	path.join(frontendRoot, 'src/components/GenericTable.svelte'),
	'utf8'
);
const genericTableScript = ts.createSourceFile(
	'GenericTable.ts',
	genericTableSource.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1],
	ts.ScriptTarget.Latest,
	true
);
const genericTableMethods = genericTableScript.statements
	.filter(
		(statement) =>
			ts.isFunctionDeclaration(statement) &&
			[
				'getActiveFilter',
				'fetchServerPage',
				'getExportTableData',
				'prepareTableRows',
				'stringifyArray'
			].includes(statement.name.text)
	)
	.map((statement) => statement.getText(genericTableScript))
	.join('\n');

for (const [type, getRows, Table, field, search] of [
	['operation', getTherapyOperationTable, OperationTable, 'ops', '5-5'],
	['systemic', getTherapySystemicTable, SystemicTable, 'substance', 'platin']
]) {
	test(`${type} transport retains patient leaves and OR cohorts while forwarding array column searches`, async () => {
		const originalFetch = globalThis.fetch;
		const requests = [];
		globalThis.fetch = async (_url, init) => {
			requests.push(JSON.parse(init.body));
			return { ok: true, json: async () => ({ data: { getAllTherapies: [] } }) };
		};
		try {
			for (const cohort of cohortCases) {
				const page = {
					offset: 20,
					limit: 10,
					sortField: field,
					sortDirection: 'asc',
					columnFilters: [{ field, value: search }]
				};
				await fetchTableRows(getRows, page, JSON.stringify(cohort));
				const request = requests.at(-1);
				assert.match(request.query, /columnFilters: \$columnFilters/);
				const { filter, continueFromID, ...paging } = request.variables;
				assert.equal(continueFromID, null);
				assert.deepEqual(paging, page);
				assertScopedCohort(filter, type, cohort);
			}
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test(`${type} route keeps rows, both counts and full export in the same patient and therapy scope`, async () => {
		Table.render();
		const props = readCapturedTableProps();
		assert.equal(props.getTableData, getRows);
		const originalFetch = globalThis.fetch;
		try {
			for (const cohort of cohortCases) {
				const requests = [];
				globalThis.fetch = async (_url, init) => {
					const request = JSON.parse(init.body);
					requests.push(request);
					const { filter, offset = 0, limit } = request.variables;
					const rows = candidates.filter((row) => matchesCohort(JSON.parse(filter), row));
					return {
						ok: true,
						json: async () => ({
							data: request.query.includes('query getTableCount(')
								? { getTableCount: rows.length }
								: { getAllTherapies: rows.slice(offset, offset + limit).map((row) => ({ ...row })) }
						})
					};
				};
				const context = vm.createContext({
					...props,
					withFixedFilter,
					fetchTableRows,
					fetchAllTableRows,
					getTableCount,
					loadTablePageInParallel,
					filterActive: true,
					filter: '',
					dataPasser: { getAstAPI: () => cohort },
					addUserFilter: async (filter) => filter,
					latestPageRequest: 0,
					activePageRequest: null,
					countCollection: undefined,
					loading: false,
					loadingComplete: true,
					totalCountCache: new Map(),
					filteredCountCache: new Map(),
					destroyed: false,
					tableData: []
				});
				vm.runInContext(
					transpile(
						genericTableMethods + '\nglobalThis.harness = { fetchServerPage, getExportTableData };'
					),
					context
				);
				const columnFilters = [{ field, value: search }];
				const page = await context.harness.fetchServerPage({
					offset: 0,
					limit: 1,
					sortField: 'therapyOccurrenceDate',
					sortDirection: 'desc',
					columnFilters
				});
				const exported = await context.harness.getExportTableData(() => {});
				const expected = candidates.filter(
					(row) => row.generalType === type && matchesCohort(cohort, row)
				);
				assert.equal(page.total, expected.length);
				assert.equal(page.filtered, expected.length);
				assert.deepEqual(
					exported.map((row) => row.therapyID),
					expected.map((row) => row.therapyID)
				);
				const counts = requests.filter((request) => request.query.includes('query getTableCount('));
				assert.equal(
					counts.length,
					3,
					'Page total, page filtered count and export count are requested'
				);
				for (const request of requests) {
					assertScopedCohort(request.variables.filter, type, cohort);
					assert.deepEqual(
						request.variables.columnFilters,
						request === counts[0] ? [] : columnFilters
					);
				}
			}
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
}
