import assert from 'node:assert/strict';
import test from 'node:test';

import { opsGroupText, parseSurgeon } from './therapyFieldParsers.mjs';

test('parseSurgeon returns one array entry for a single imported surgeon', () => {
	assert.deepEqual(parseSurgeon('America (OP1)'), ['America (OP1)']);
});

test('parseSurgeon splits imported surgeon strings into all documented operators', () => {
	assert.deepEqual(parseSurgeon('America (OP1), Falcon (OP2), Widow (ASS1)'), [
		'America (OP1)',
		'Falcon (OP2)',
		'Widow (ASS1)'
	]);
});

test('parseSurgeon preserves existing array-shaped surgeon values', () => {
	assert.deepEqual(parseSurgeon(['America (OP1)', 'Falcon (OP2)']), [
		'America (OP1)',
		'Falcon (OP2)'
	]);
});

test('opsGroupText names the OPS group of a full code and leaves unknown groups empty', () => {
	assert.equal(opsGroupText('5-894.y'), 'Operationen an Haut und Unterhaut');
	assert.equal(opsGroupText('5-604.42'), 'Operationen an Prostata und Vesiculae seminales');
	assert.equal(opsGroupText('X-00.0'), null);
	assert.equal(opsGroupText(null), null);
});
