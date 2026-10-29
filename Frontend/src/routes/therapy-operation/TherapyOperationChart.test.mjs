import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const component = fs.readFileSync(new URL('./TherapyOperationChart.svelte', import.meta.url), 'utf8');
const script = component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
const parsed = ts.createSourceFile('TherapyOperationChart.ts', script, ts.ScriptTarget.Latest, true);
const dropdown = parsed.statements
	.filter(ts.isVariableStatement)
	.flatMap((statement) => [...statement.declarationList.declarations])
	.find((declaration) => declaration.name.getText(parsed) === 'dropdownObject');
const config = fs.readFileSync(new URL('../../store/configStore.js', import.meta.url), 'utf8');
const configSource = ts.createSourceFile('configStore.js', config, ts.ScriptTarget.Latest, true);
let initialDropdown;
function visit(node) {
	if (ts.isPropertyAssignment(node) && node.name.getText(configSource) === 'TherapyOperationChartInitialDropdown') {
		initialDropdown = node.initializer.getText(configSource);
	}
	ts.forEachChild(node, visit);
}
visit(configSource);
assert.ok(dropdown && initialDropdown);

for (const isCCP of [true, false]) {
	test(`operation chart offers the correct fields and default when isCCP is ${isCCP}`, () => {
		// Given the actual component options and config expressions for this import mode.
		const context = vm.createContext({
			$variantStore: { isCCP },
			variantStore: { isCCP },
			get: (store) => store,
			$t: (key) => key
		});

		// When the chart and its initial selection are initialized.
		const options = vm.runInContext(dropdown.initializer.getText(parsed), context);
		const selected = vm.runInContext(initialDropdown, context);

		// Then CCP has only residual statuses, while other modes retain their original fields.
		assert.deepEqual(Array.from(options, (option) => option.value), isCCP
			? ['localRState', 'globalRState']
			: ['resectionType', 'localRState', 'emergencySurgery']);
		assert.equal(selected, isCCP ? 'localRState' : 'resectionType');
	});
}
