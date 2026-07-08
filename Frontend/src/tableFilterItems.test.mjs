import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const outfile = '/tmp/ovis-tableFilterItems-test.mjs';

await build({
	entryPoints: ['Frontend/src/tableFilterItems.ts'],
	outfile,
	bundle: true,
	format: 'esm',
	platform: 'node',
	logLevel: 'silent'
});

const { appendQueryItemToFirstGroup, createArrayFilterItems, getArrayFilterKey, getCellValues } =
	await import(pathToFileURL(outfile).href);

test('createArrayFilterItems builds one surgeon filter per array entry', () => {
	const items = createArrayFilterItems('surgeon', ['Budcke (OP1)', 'Fey (OP2)', 'Knaier (ASS1)']);

	assert.deepEqual(
		items.map((item) => ({
			key: item.key,
			name: item.name,
			system: item.system,
			value: item.values[0].value
		})),
		[
			{ key: 'surgeon', name: 'surgeon', system: 'therapy', value: 'Budcke (OP1)' },
			{ key: 'surgeon', name: 'surgeon', system: 'therapy', value: 'Fey (OP2)' },
			{ key: 'surgeon', name: 'surgeon', system: 'therapy', value: 'Knaier (ASS1)' }
		]
	);
});

test('getCellValues still splits legacy comma strings into individual values', () => {
	assert.deepEqual(getCellValues('Budcke (OP1), Fey (OP2), Knaier (ASS1)'), [
		'Budcke (OP1)',
		'Fey (OP2)',
		'Knaier (ASS1)'
	]);
});

test('getArrayFilterKey keeps OPS behavior compatible with existing OPS-code filters', () => {
	assert.equal(getArrayFilterKey('ops'), 'ops_code');
});

test('appendQueryItemToFirstGroup replaces empty Lens catalogue misses and merges values', () => {
	const lensMiss = {
		id: 'empty',
		key: 'surgeon',
		name: 'surgeon',
		type: 'EQUALS',
		system: 'therapy',
		values: []
	};
	const [firstItem, secondItem] = createArrayFilterItems('surgeon', ['Budcke (OP1)', 'Fey (OP2)']);

	const withFirst = appendQueryItemToFirstGroup([[lensMiss]], firstItem);
	const withSecond = appendQueryItemToFirstGroup(withFirst, secondItem);

	assert.deepEqual(withSecond[0], [
		{
			...firstItem,
			values: [
				{ name: 'Budcke (OP1)', value: 'Budcke (OP1)', queryBindId: '-' },
				{ name: 'Fey (OP2)', value: 'Fey (OP2)', queryBindId: '-' }
			]
		}
	]);
});
