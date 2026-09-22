import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createLensHarness } from '../../testhelpers/lensHarness.mjs';

const require = createRequire(import.meta.url);
const {
	internal: { localQuery }
} = require('../../../../Backend/Apollo/astTranslator.js');
const bundle = await build({
	entryPoints: [fileURLToPath(new URL('./fixedFilterSelection.ts', import.meta.url))],
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'node',
	logLevel: 'silent'
});
const { applyFixedFilterSelection } = await import(
	`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
const queryHelpers = ts.transpileModule(
	fs.readFileSync(new URL('../../tableFilterItems.ts', import.meta.url), 'utf8'),
	{
		compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
	}
).outputText;
const { addChartQueryItem } = await import(
	`data:text/javascript;base64,${Buffer.from(queryHelpers).toString('base64')}`
);
const field = (key, values) => ({
	key,
	name: key,
	system: 'therapy',
	type: 'EQUALS',
	fieldType: 'single-select',
	criteria: values.map((value) => ({ key: value, name: value }))
});
const catalogue = [
	{
		key: 'therapy',
		childCategories: [
			field('generalType', ['nuclear', 'other', 'systemic']),
			field('status', ['Durchgeführt'])
		]
	}
];
const scope = JSON.stringify({
	key: 'generalType',
	system: 'therapy',
	type: 'EQUALS',
	value: 'nuclear'
});
const row = (values, suffix = '') => ({
	id: 'type' + suffix,
	key: 'generalType',
	system: 'therapy',
	name: 'generalType',
	type: 'EQUALS',
	values: values.map((value) => ({ name: value, value, queryBindId: value + suffix }))
});

test('scope selection narrows existing multi-value therapy type filters and remains idempotent', () => {
	const lens = createLensHarness(catalogue, [[row(['nuclear', 'other'])]]);
	applyFixedFilterSelection(lens.dataPasser, scope);
	applyFixedFilterSelection(lens.dataPasser, scope);
	assert.equal(lens.query()[0].length, 1);
	assert.deepEqual(
		lens.query()[0][0].values.map(({ value }) => value),
		['nuclear']
	);
	assert.match(JSON.stringify(localQuery(lens.ast(), 'therapy')), /nuclear/);
	assert.doesNotMatch(JSON.stringify(localQuery(lens.ast(), 'therapy')), /other/);
});

test('scope removes contradictory OR branches and survives the next real Lens insertion', () => {
	const lens = createLensHarness(catalogue, [
		[row(['other'], 'a')],
		[row(['nuclear', 'systemic'], 'b')],
		[]
	]);
	assert.equal(applyFixedFilterSelection(lens.dataPasser, scope), true);
	addChartQueryItem(lens.dataPasser, {
		id: '-',
		key: 'status',
		name: 'status',
		type: 'EQUALS',
		system: 'therapy',
		values: [{ name: 'Durchgeführt', value: 'Durchgeführt', queryBindId: '-' }]
	});
	const groups = lens.query();
	assert.equal(groups.length, 2);
	assert.deepEqual(
		groups[0].map((item) => item.values.map(({ value }) => value)),
		[['nuclear'], ['Durchgeführt']]
	);
	assert.deepEqual(
		groups[1].map((item) => item.values.map(({ value }) => value)),
		[['nuclear']]
	);
	assert.equal(new Set(groups.flat().map(({ id }) => id)).size, groups.flat().length);
	const ast = lens.ast();
	assert.equal(ast.operand, 'OR');
	assert.equal(ast.children.length, 2);
	for (const group of ast.children) assert.match(JSON.stringify(group), /nuclear/);
	assert.doesNotMatch(JSON.stringify(ast), /systemic|other/);
});

test('an incompatible scope aborts selection without mutating any editable group', () => {
	const lens = createLensHarness(catalogue, [[row(['other'])], [row(['systemic'], 'b')]]);
	const before = lens.query();
	assert.equal(applyFixedFilterSelection(lens.dataPasser, scope), false);
	assert.deepEqual(lens.query(), before);
});

test('no scope and an already assigned scope leave the editable query unchanged', () => {
	const lens = createLensHarness(catalogue);
	applyFixedFilterSelection(lens.dataPasser, null);
	applyFixedFilterSelection(lens.dataPasser, scope, scope);
	assert.deepEqual(lens.query(), [[]]);
});

const tableSource = fs.readFileSync(new URL('../../tableBuilder.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('tableBuilder.ts', tableSource, ts.ScriptTarget.Latest, true);
const handler = parsed.statements.find(
	(statement) =>
		ts.isFunctionDeclaration(statement) && statement.name.text === 'bindCellClickHandler'
);
const executable = ts.transpileModule(handler.getText(parsed), {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;

test('detail and category table cells carry scope before selecting their value', () => {
	for (const key of ['status', 'subTypeDetail']) {
		const lens = createLensHarness(catalogue, [[row(['other', 'nuclear'])]]);
		const added = [];
		const cell = { onclick: null, closest: () => null };
		const context = vm.createContext({
			moment: () => ({ isValid: () => false }),
			addItem: (item) => added.push(item),
			reloadOnly: () => {},
			console: { log: () => {} }
		});
		vm.runInContext(executable, context);
		context.bindCellClickHandler(
			() => ({ settings: () => [{ aoColumns: [{ data: key }] }] }),
			cell,
			'Durchgeführt',
			0,
			'therapy',
			true,
			() => applyFixedFilterSelection(lens.dataPasser, scope)
		);
		cell.onclick();
		assert.deepEqual(
			lens.query()[0][0].values.map(({ value }) => value),
			['nuclear']
		);
		assert.equal(added[0].key, key);
		assert.equal(added[0].system, 'therapy');
	}
});

test('opening date and number pickers defers scope until confirmation', () => {
	for (const key of ['therapyOccurrenceDate', 'tumorID']) {
		let pending;
		let applied = 0;
		const cell = { onclick: null };
		const context = vm.createContext({
			moment: () => ({ isValid: () => key === 'therapyOccurrenceDate' }),
			dateStore: {
				set: (value) => {
					pending = value;
				}
			},
			numberStore: {
				set: (value) => {
					pending = value;
				}
			},
			console: { log: () => {} }
		});
		vm.runInContext(executable, context);
		context.bindCellClickHandler(
			() => ({ settings: () => [{ aoColumns: [{ data: key }] }] }),
			cell,
			key === 'tumorID' ? '1' : '01.01.2024',
			0,
			'therapy',
			true,
			() => {
				applied += 1;
				return true;
			}
		);
		cell.onclick();
		assert.equal(applied, 0);
		assert.equal(typeof pending.onConfirm, 'function');
		pending.onConfirm();
		assert.equal(applied, 1);
	}
});

test('picker cancellation discards the pending scope, and invalid confirmation never applies it', () => {
	for (const picker of ['date', 'number']) {
		let state;
		const exports = {};
		const writable = (initial) => {
			state = initial;
			return {
				update: (update) => {
					state = update(state);
				},
				set: (value) => {
					state = value;
				}
			};
		};
		const storeSource = ts.transpileModule(
			fs.readFileSync(new URL(`../../store/${picker}PickerStore.js`, import.meta.url), 'utf8'),
			{
				compilerOptions: { module: ts.ModuleKind.CommonJS, allowJs: true }
			}
		).outputText;
		vm.runInNewContext(storeSource, { exports, require: () => ({ writable }) });
		const capitalized = picker[0].toUpperCase() + picker.slice(1);
		let applied = 0;
		exports[`${picker}PickerStore`].set({
			...state,
			show: true,
			onConfirm: () => {
				applied += 1;
				return true;
			}
		});
		exports[`toggle${capitalized}Picker`](false);
		assert.equal(state.onConfirm, undefined);
		assert.equal(applied, 0);

		const fullSource = fs.readFileSync(
			new URL(`../${capitalized}Picker.svelte`, import.meta.url),
			'utf8'
		);
		const script = fullSource.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
		const ast = ts.createSourceFile('picker.ts', script, ts.ScriptTarget.Latest, true);
		const add = ast.statements.find(
			(statement) =>
				ts.isFunctionDeclaration(statement) && statement.name.text === `add${capitalized}`
		);
		const context = vm.createContext({
			isConfirmDisabled: true,
			collection: 'therapy',
			fieldName: 'tumorID',
			typeOfDate: 'therapyOccurrenceDate',
			lowerValue: 1,
			upperValue: 2,
			selectedOption: 'datum',
			selectedUpperMonth: '01',
			selectedUpperDay: '01',
			selectedUpperYear: '2024',
			lowerMonth: '01',
			lowerDay: '01',
			lowerYear: '2024',
			[`$${picker}PickerStore`]: {
				onConfirm: () => {
					applied += 1;
					return true;
				}
			},
			dataPasser: { addStratifierToQueryAPI: () => {} },
			addChartQueryItem: () => {},
			get: (value) => value,
			userStore: {},
			reloadOnly: () => {},
			[`toggle${capitalized}Picker`]: () => {},
			console: { log: () => {} }
		});
		vm.runInContext(
			ts.transpileModule(add.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
				.outputText,
			context
		);
		context[`add${capitalized}`]();
		assert.equal(applied, 0);
		context.isConfirmDisabled = false;
		context[`add${capitalized}`]();
		assert.equal(applied, 1);
	}
});
