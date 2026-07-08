import assert from 'node:assert/strict';
import test from 'node:test';

import { parseSurgeon } from './therapyFieldParsers.mjs';

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
