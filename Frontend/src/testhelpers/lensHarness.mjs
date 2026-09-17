import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { extendLensQueryIdentity } from '../../lensCatalogueSchemaPlugin.js';

// Execute the query insertion, removal and AST conversion functions shipped by Lens.
// Only its writable stores and UUID source are supplied by the harness. In particular,
// grouping by display name and deletion by row/binding ID must not be mocked away.
// These symbols belong to the locked 0.4.4-ovis-preview bundle. A dependency update
// that renames them deliberately fails here, requiring review of the adapter.
const lensSource = extendLensQueryIdentity(
	fs.readFileSync(new URL('../../node_modules/@samply/lens/dist/lens.js', import.meta.url), 'utf8')
);
const lensAst = ts.createSourceFile('lens.js', lensSource, ts.ScriptTarget.Latest, true);
const requiredSymbols = ['Vn', 'Lf', 'gu', 'mu', 'zf', 'Bi', 'Hn'];
const declarations = new Map();
for (const statement of lensAst.statements) {
	if (ts.isFunctionDeclaration(statement) && requiredSymbols.includes(statement.name?.text)) {
		declarations.set(statement.name.text, statement.getText(lensAst));
	}
	if (ts.isVariableStatement(statement)) {
		for (const declaration of statement.declarationList.declarations) {
			if (ts.isIdentifier(declaration.name) && requiredSymbols.includes(declaration.name.text)) {
				declarations.set(declaration.name.text, `const ${declaration.getText(lensAst)};`);
			}
		}
	}
}
for (const symbol of requiredSymbols) {
	assert.ok(declarations.has(symbol), `review the installed Lens adapter: missing ${symbol}`);
}
const lensExecutable = new vm.Script(
	[
		...requiredSymbols.map((symbol) => declarations.get(symbol)),
		'globalThis.lens = { add: zf, removeValue: gu, removeRow: mu, toAst: Hn };'
	].join('\n')
);

const copy = (value) => JSON.parse(JSON.stringify(value));
export function createLensHarness(catalogue, initialQuery = [[]]) {
	let query = structuredClone(initialQuery);
	let fields = structuredClone(catalogue);
	let nativeCalls = 0;
	const context = vm.createContext({
		Dt: randomUUID,
		as: { set() {} },
		le: {
			update(update) {
				query = update(query);
			}
		}
	});
	lensExecutable.runInContext(context);
	const { lens } = context;
	const dataPasser = {
		getQueryAPI: () => query,
		setQueryStoreAPI: (next) => {
			query = next;
		},
		addStratifierToQueryAPI: (selection) => {
			nativeCalls += 1;
			lens.add({ ...selection, catalogue: fields });
		}
	};
	return {
		dataPasser,
		query: () => copy(query),
		ast: () => copy(lens.toAst(query)),
		nativeCalls: () => nativeCalls,
		setCatalogue: (next) => {
			fields = structuredClone(next);
		},
		removeRow(key, groupIndex = 0) {
			const row = query[groupIndex].find((candidate) => candidate.key === key);
			assert.ok(row, `missing row ${key}`);
			lens.removeRow(row, groupIndex);
		},
		removeValue(key, value, groupIndex = 0) {
			const row = query[groupIndex].find((candidate) => candidate.key === key);
			assert.ok(row, `missing row ${key}`);
			const selected = row.values.find((candidate) => candidate.value === value);
			assert.ok(selected, `missing ${key} value ${value}`);
			lens.removeValue({ ...row, values: [selected] }, groupIndex);
		}
	};
}
