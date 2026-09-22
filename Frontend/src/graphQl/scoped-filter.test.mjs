import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./scoped-filter.ts', import.meta.url), 'utf8');
const transpile = (text) =>
	ts.transpileModule(text, {
		compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
	}).outputText;
const { withFixedFilter } = await import(
	`data:text/javascript;base64,${Buffer.from(transpile(source)).toString('base64')}`
);

const scope = { key: 'generalType', type: 'EQUALS', system: 'therapy', value: 'other' };
const fixedFilter = JSON.stringify(scope);
const active = {
	operand: 'OR',
	children: [
		{ key: 'subType', type: 'EQUALS', system: 'therapy', value: 'TACE' },
		{ key: 'gender', type: 'EQUALS', system: 'patient', value: 'w' }
	]
};

test('fixed filter always intersects a cohort OR without losing a leaf or empty-filter scope', () => {
	assert.equal(withFixedFilter(JSON.stringify(active), null), JSON.stringify(active));
	assert.deepEqual(JSON.parse(withFixedFilter(JSON.stringify(active), fixedFilter)), {
		operand: 'AND',
		children: [scope, active]
	});
	const leaf = active.children[0];
	assert.deepEqual(JSON.parse(withFixedFilter(JSON.stringify(leaf), fixedFilter)), {
		operand: 'AND',
		children: [scope, leaf]
	});
	for (const empty of [null, 'null', '{"operand":"OR","children":[]}']) {
		assert.deepEqual(JSON.parse(withFixedFilter(empty, fixedFilter)), {
			operand: 'AND',
			children: [scope]
		});
	}
	assert.throws(() => withFixedFilter('invalid json', fixedFilter));
});

// Execute the real component paths for paging and export to verify that both
// row and count requests receive the same scope (including column filters).
const component = fs.readFileSync(
	new URL('../components/GenericTable.svelte', import.meta.url),
	'utf8'
);
const script = component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
const parsed = ts.createSourceFile('GenericTable.ts', script, ts.ScriptTarget.Latest, true);
const functions = parsed.statements
	.filter(
		(statement) =>
			ts.isFunctionDeclaration(statement) &&
			['getActiveFilter', 'fetchServerPage', 'getExportTableData'].includes(statement.name.text)
	)
	.map((statement) => statement.getText(parsed))
	.join('\n');

test('table page, counts and full export retain scope, paging and column filters', async () => {
	const calls = [];
	const request = {
		offset: 20,
		limit: 10,
		sortField: 'subType',
		sortDirection: 'asc',
		columnFilters: [{ field: 'status', value: 'Durchgeführt' }]
	};
	const context = vm.createContext({
		withFixedFilter,
		fixedFilter,
		filterActive: true,
		filter: '',
		dataPasser: { getAstAPI: () => active },
		addUserFilter: async (filter) => filter,
		latestPageRequest: 0,
		activePageRequest: null,
		loading: false,
		loadingActive: true,
		loadingComplete: true,
		collection: 'therapy',
		countCollection: undefined,
		totalCountCache: new Map(),
		filteredCountCache: new Map(),
		loadTablePageInParallel: async ({ loadRows, loadTotal, loadFiltered }) => ({
			rows: await loadRows(),
			total: await loadTotal(),
			filtered: await loadFiltered()
		}),
		fetchTableRows: async (_getRows, pageRequest, filter) => {
			calls.push({ type: 'rows', request: pageRequest, filter });
			return [{ therapyID: '1' }];
		},
		getTableCount: async (collection, filter, columnFilters) => {
			calls.push({ type: 'count', collection, filter, columnFilters });
			return 1;
		},
		getTableData: () => {},
		prepareTableRows: (rows) => rows,
		destroyed: false,
		tableData: [],
		fetchAllTableRows: async ({ baseRequest, pageSize, fetchPage }) =>
			fetchPage({ ...baseRequest, offset: 0, limit: pageSize })
	});
	vm.runInContext(
		transpile(functions + '\nglobalThis.harness = { fetchServerPage, getExportTableData };'),
		context
	);
	await context.harness.fetchServerPage(request);
	await context.harness.getExportTableData(() => {});
	assert.equal(calls.length, 5);
	for (const call of calls) {
		assert.deepEqual(JSON.parse(call.filter), { operand: 'AND', children: [scope, active] });
	}
	const rowCalls = calls.filter(({ type }) => type === 'rows');
	assert.equal(rowCalls[0].request, request);
	assert.equal(rowCalls[1].request.offset, 0);
	assert.equal(rowCalls[1].request.limit, 1000);
	assert.equal(rowCalls[1].request.columnFilters, request.columnFilters);
	assert.equal(rowCalls[1].request.sortField, request.sortField);
	assert.equal(
		calls.filter(({ type }) => type === 'count').at(-1).columnFilters,
		request.columnFilters
	);

	context.filterActive = false;
	calls.length = 0;
	await context.harness.fetchServerPage(request);
	for (const call of calls) {
		assert.deepEqual(JSON.parse(call.filter), { operand: 'AND', children: [scope] });
	}
});
