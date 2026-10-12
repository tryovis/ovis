import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function readFunction(file, name) {
	const source = ts.createSourceFile(
		file,
		readFileSync(new URL(file, import.meta.url), 'utf8'),
		ts.ScriptTarget.Latest,
		true
	);
	const declaration = source.statements.find(
		(node) => ts.isFunctionDeclaration(node) && node.name?.text === name
	);
	assert.ok(declaration, `${file}: ${name}`);
	return ts
		.transpileModule(declaration.getText(source), {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
		})
		.outputText.replace(/^export /gm, '');
}

const source = [
	readFunction('./tableBuilder.ts', 'truncateCellData'),
	readFunction('./lib/escape-html.ts', 'escapeHtml')
].join('\n');

function harness() {
	const frames = [];
	const writes = [];
	const settings = { aoColumns: [{ type: 'string' }], bDestroying: false };
	const cell = { isConnected: true };
	const context = vm.createContext({
		requestAnimationFrame: (callback) => frames.push(callback),
		jQuery: (node) => {
			assert.equal(node, cell);
			return {
				width: () => 70,
				html: (value) => writes.push({ html: value }),
				text: (value) => writes.push({ text: value }),
				closest: () => {
					throw new Error('A deferred cell update must not rediscover or initialize a table');
				}
			};
		}
	});
	vm.runInContext(source, context);
	return {
		cell,
		settings,
		writes,
		queue(value, column = 0) {
			context.truncateCellData(cell, value, column, { settings: () => [settings] });
		},
		flush() {
			for (const callback of frames.splice(0)) callback();
		}
	};
}

test('queued cell updates cannot resurrect a destroyed table, even while its DOM is attached', () => {
	const table = harness();
	table.queue('Old diagnosis description');
	table.settings.bDestroying = true;
	table.flush();
	assert.deepEqual(table.writes, []);
});

test('queued cell updates ignore removed rows', () => {
	const table = harness();
	table.queue('Old diagnosis description');
	table.cell.isConnected = false;
	table.flush();
	assert.deepEqual(table.writes, []);
});

test('queued cell updates tolerate removed columns', () => {
	const table = harness();
	table.queue('Description', 1);
	table.flush();
	assert.deepEqual(table.writes, []);
});

test('live cells still truncate and escape tooltip contents', () => {
	const table = harness();
	table.queue('<b>Long diagnosis description</b>');
	table.flush();
	assert.equal(table.writes.length, 1);
	assert.match(table.writes[0].html, /&lt;b&gt;Long diagnosis description&lt;\/b&gt;/);
	assert.match(table.writes[0].html, /&lt;b&gt;Long di…/);
	assert.doesNotMatch(table.writes[0].html, /<b>/);
});

test('live cells retain short text and join array values', () => {
	const table = harness();
	table.queue(['A', 'B']);
	table.flush();
	assert.deepEqual(table.writes, [{ text: 'A, B' }]);
});
