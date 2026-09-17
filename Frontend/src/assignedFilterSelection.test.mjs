import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { getDiagnosisBarChartClickFilterTarget } from './routes/diagnosis/diagnosisBarChartFilterTarget.js';
import { getDiagnosisChartDateRange } from './routes/diagnosis/diagnosisDateRange.js';

const helperSource = fs.readFileSync(new URL('./tableFilterItems.ts', import.meta.url), 'utf8');
const helperCode = ts.transpileModule(helperSource, {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
}).outputText;
const { addChartQueryItem, appendQueryItemToFirstGroup, isQueryItemRedundantWithAssignedFilter } =
	await import(`data:text/javascript;base64,${Buffer.from(helperCode).toString('base64')}`);

const leaf = (key, value, system = 'diagnosis') => ({ key, system, type: 'EQUALS', value });
const item = (key, value, system = 'diagnosis') => ({
	id: '-',
	key,
	name: key,
	system,
	type: 'EQUALS',
	values: [{ name: value, value, queryBindId: '-' }]
});
const group = (operand, ...children) => ({ operand, children });
const assigned = group('OR', group('AND', group('OR', leaf('ICD_ICD10Group', 'C30-C39'))));
const selectedGroup = item('ICD_ICD10Group', 'C30-C39');
const selectedLung = item('ICD_ICD10_3', 'C34');

test('assigned C30-C39 stays out of editable selections while C34 can narrow it', () => {
	for (const filter of [assigned, JSON.stringify(assigned)]) {
		assert.equal(isQueryItemRedundantWithAssignedFilter(selectedGroup, filter), true);
		assert.equal(isQueryItemRedundantWithAssignedFilter(selectedLung, filter), false);
		const afterLung = appendQueryItemToFirstGroup([], selectedLung, filter);
		assert.deepEqual(appendQueryItemToFirstGroup(afterLung, selectedGroup, filter), [
			[selectedLung]
		]);
	}
});

test('an assigned OR of two groups still permits selecting just one of them', () => {
	const either = group('OR', leaf('ICD_ICD10Group', 'C30-C39'), leaf('ICD_ICD10Group', 'C50-C59'));
	assert.equal(isQueryItemRedundantWithAssignedFilter(selectedGroup, either), false);
	assert.deepEqual(appendQueryItemToFirstGroup([], selectedGroup, either), [[selectedGroup]]);
});

test('a selection is redundant only if every assigned alternative requires it', () => {
	const constrained = group(
		'OR',
		group('AND', leaf('ICD_ICD10Group', 'C30-C39'), leaf('gender', 'm', 'patient')),
		group('AND', leaf('ICD_ICD10Group', 'C30-C39'), leaf('gender', 'f', 'patient'))
	);
	assert.equal(isQueryItemRedundantWithAssignedFilter(selectedGroup, constrained), true);
	assert.equal(
		isQueryItemRedundantWithAssignedFilter(item('gender', 'm', 'patient'), constrained),
		false
	);
	assert.equal(
		isQueryItemRedundantWithAssignedFilter(
			item('ICD_ICD10Group', 'C30-C39', 'patient'),
			constrained
		),
		false
	);
});

test('unrestricted, malformed or unsupported assigned expressions never swallow selections', () => {
	for (const filter of [
		null,
		undefined,
		'',
		'invalid JSON',
		group('OR'),
		group('NOT', leaf('ICD_ICD10Group', 'C30-C39')),
		{ ...leaf('ICD_ICD10Group', 'C30-C39'), type: 'NEQUALS' }
	]) {
		assert.equal(isQueryItemRedundantWithAssignedFilter(selectedGroup, filter), false);
	}
	assert.equal(
		isQueryItemRedundantWithAssignedFilter({ ...selectedGroup, type: 'NEQUALS' }, assigned),
		false
	);
});

test('suppressing a redundant selection does not alter assignment or editable OR branches', () => {
	const editable = [[selectedLung], [item('ICD_ICD10_3', 'C32')]];
	const before = JSON.stringify({ assigned, editable });
	assert.deepEqual(appendQueryItemToFirstGroup(editable, selectedGroup, assigned), editable);
	assert.equal(JSON.stringify({ assigned, editable }), before);
});

// Run the component's actual insertion function and chart-click callback. Rendering and
// catalogue metadata lookup is stubbed; no catalogue values are available.
const component = fs.readFileSync(
	new URL('./routes/diagnosis/DiagnosisBarChart.svelte', import.meta.url),
	'utf8'
);
const script = component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
const parsed = ts.createSourceFile('DiagnosisBarChart.ts', script, ts.ScriptTarget.Latest, true);
let insertion;
let clickHandler;
function visit(node) {
	if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'addItem') {
		insertion = `const ${node.getText(parsed)};`;
	}
	if (
		ts.isPropertyAssignment(node) &&
		node.name.getText(parsed) === 'onClick' &&
		node.initializer.getText(parsed).includes('getDiagnosisBarChartClickFilterTarget')
	) {
		clickHandler = node.initializer.getText(parsed);
	}
	ts.forEachChild(node, visit);
}
visit(parsed);
assert.ok(insertion && clickHandler, 'the real diagnosis chart click handler must be exercised');
const executable = ts.transpileModule(`${insertion}\nglobalThis.click = ${clickHandler};`, {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;

function runYearClick(assignedFilter, initialQuery = []) {
	let query = structuredClone(initialQuery);
	const dateCalls = [];
	const reloadedQueries = [];
	const context = vm.createContext({
		addChartQueryItem,
		getDiagnosisBarChartClickFilterTarget,
		getDiagnosisChartDateRange,
		get: (store) => store,
		userStore: { currentFilter: assignedFilter },
		dataPasser: {
			getQueryAPI: () => query,
			setQueryStoreAPI: (next) => {
				query = next;
			},
			addStratifierToQueryAPI: (selection) => {
				if (selection.catalogueGroupCode === 'diagnosisDate') {
					dateCalls.push(selection);
				} else {
					const metadata = item(
						selection.catalogueGroupCode,
						selection.label,
						selection.parentGroupCode
					);
					metadata.values = [];
					query = appendQueryItemToFirstGroup(query, metadata);
				}
			}
		},
		chartConfig: { data: { datasets: [{ label: 'C30-C39' }], labels: ['2026'] } },
		requestedSelectedFeature: { value: 'ICD_ICD10Group' },
		requestedSelectedGender: false,
		requestedSelectedAbscissa: { label: 'Jahr' },
		requestedAbscissaKey: 'diagnosisDate',
		reloadOnly: () => reloadedQueries.push(structuredClone(query)),
		console: { log() {}, error() {} }
	});
	vm.runInContext(executable, context);
	context.click(null, [{ index: 0, datasetIndex: 0 }]);
	return { query: JSON.parse(JSON.stringify(query)), dateCalls, reloadedQueries };
}

test('first year click adds its date without exposing the fixed C30-C39 assignment', () => {
	const result = runYearClick(JSON.stringify(assigned));
	assert.deepEqual(result.query[0].map(({ key }) => key), ['diagnosisDate']);
	assert.equal(result.query[0][0].type, 'BETWEEN');
	assert.deepEqual(result.query[0][0].values[0].value, {
		min: Date.parse('2026-01-01T00:00:00.000Z'), max: Date.parse('2026-12-31T00:00:00.000Z')
	});
	assert.equal(result.dateCalls.length, 0, 'typed ranges must not pass through label parsing');
	assert.equal(result.reloadedQueries.length, 1);
});

test('year click after C34 preserves that narrower selection and never re-adds C30-C39', () => {
	const result = runYearClick(JSON.stringify(assigned), [[selectedLung]]);
	assert.deepEqual(result.query[0].map(({ key }) => key), ['ICD_ICD10_3', 'diagnosisDate']);
	assert.deepEqual(result.query[0][0], selectedLung);
	assert.equal(result.dateCalls.length, 0);
	assert.equal(result.reloadedQueries.length, 1);
	assert.deepEqual(result.reloadedQueries[0][0][0], selectedLung);
});

test('unrestricted users still get the diagnosis group and date from a year bar', () => {
	const result = runYearClick(null);
	assert.equal(result.query[0][0].key, 'ICD_ICD10Group');
	assert.equal(result.query[0][0].values[0].value, 'C30-C39');
	assert.equal(result.query[0][1].key, 'diagnosisDate');
	assert.equal(result.query[0][1].type, 'BETWEEN');
	assert.equal(result.dateCalls.length, 0);
});
