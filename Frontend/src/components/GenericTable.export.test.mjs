import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./GenericTable.svelte', import.meta.url), 'utf8');
const script = source.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
const parsed = ts.createSourceFile('GenericTable.ts', script, ts.ScriptTarget.Latest, true);
const names = ['getExportContext', 'getExportTableData', 'prepareTableRows', 'stringifyArray'];
const functions = parsed.statements.filter(
	(statement) => ts.isFunctionDeclaration(statement) && names.includes(statement.name?.text)
);
assert.equal(functions.length, names.length);
const executable = ts.transpileModule(
	functions.map((statement) => statement.getText(parsed)).join('\n'),
	{
		compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
	}
).outputText;
const plain = (value) => JSON.parse(JSON.stringify(value));

function createHarness() {
	const requests = [];
	const originalLoader = () => {};
	const context = vm.createContext({
		structuredClone,
		collection: 'therapy',
		countCollection: 'radiation',
		fixedFilter: 'fixed-initial',
		filterActive: true,
		headlineTitle: 'Radiation details',
		exportSnapshot: null,
		columns: [{ data: 'values', numOfObj: true }],
		tableData: [{ values: 'loaded-row' }],
		getTableData: originalLoader,
		activePageRequest: {
			offset: 20,
			limit: 10,
			sortField: 'therapyID',
			sortDirection: 'asc',
			columnFilters: [{ field: 'type', value: 'initial-search' }]
		},
		dataPasser: {
			getAstAPI: () => ({
				operand: 'OR',
				children: [{ system: 'diagnosis', key: 'tumorID', value: 'initial-scope' }]
			})
		},
		addUserFilter: async (ast) => ({ operand: 'AND', children: [ast, { key: 'assigned-scope' }] }),
		withFixedFilter: (filter, fixed) => JSON.stringify({ filter: JSON.parse(filter), fixed }),
		getTableCount: async (collection, filter, columnFilters) => {
			requests.push({ kind: 'count', collection, filter, columnFilters: plain(columnFilters) });
			return 1;
		},
		fetchAllTableRows: async (options) => options.fetchPage({ ...options.baseRequest, offset: 0 }),
		fetchTableRows: async (loader, request, filter) => {
			requests.push({
				kind: 'rows',
				originalLoader: loader === originalLoader,
				request: plain(request),
				filter
			});
			return [{ values: ['one', 'two'] }];
		}
	});
	vm.runInContext(executable, context);
	return { context, requests };
}

test('export context and lazy rows share the pre-confirmation filter, search, sort and loader snapshot', async () => {
	const { context, requests } = createHarness();
	let finishUserFilter;
	context.addUserFilter = (ast) =>
		new Promise((resolve) => {
			finishUserFilter = () =>
				resolve({ operand: 'AND', children: [ast, { key: 'assigned-scope' }] });
		});
	const pending = context.getExportContext();
	context.activePageRequest.columnFilters[0].value = 'changed-while-awaiting';
	context.fixedFilter = 'different-fixed';
	context.collection = 'different-collection';
	context.countCollection = 'different-count';
	context.dataPasser.getAstAPI = () => ({ key: 'different-global-scope' });
	finishUserFilter();
	const metadata = plain(await pending);
	assert.equal(metadata.selection.collection, 'therapy');
	assert.equal(metadata.selection.fixedFilter, 'fixed-initial');
	assert.deepEqual(metadata.selection.columnFilters, [{ field: 'type', value: 'initial-search' }]);
	assert.equal(metadata.selection.sortField, 'therapyID');
	assert.equal(metadata.selection.sortDirection, 'asc');
	assert.equal(metadata.filterActive, true);
	assert.equal(JSON.parse(metadata.filter).filter.children[0].children[0].value, 'initial-scope');
	assert.equal(JSON.parse(metadata.filter).fixed, 'fixed-initial');

	// Simulate controls and table data changing while the export confirmation is open.
	context.getTableData = () => {
		throw new Error('Changed loader must not be used');
	};
	context.activePageRequest = { sortField: 'different-sort', columnFilters: [] };
	context.columns = [{ data: 'values', numOfObj: false }];
	const rows = plain(await context.getExportTableData(() => {}));
	assert.deepEqual(rows, [{ values: 2 }]);
	assert.equal(requests[0].collection, 'radiation');
	assert.equal(requests[0].filter, metadata.filter);
	assert.deepEqual(requests[0].columnFilters, metadata.selection.columnFilters);
	assert.equal(requests[1].originalLoader, true);
	assert.equal(requests[1].filter, metadata.filter);
	assert.equal(requests[1].request.sortField, metadata.selection.sortField);
	assert.deepEqual(requests[1].request.columnFilters, metadata.selection.columnFilters);
});

test('an unpaged table exports its captured rows instead of a later UI update', async () => {
	const { context, requests } = createHarness();
	context.activePageRequest = null;
	context.tableData = [{ value: 'initial' }];
	await context.getExportContext();
	context.tableData[0].value = 'changed';
	assert.deepEqual(plain(await context.getExportTableData(() => {})), [{ value: 'initial' }]);
	assert.deepEqual(requests, []);
});
