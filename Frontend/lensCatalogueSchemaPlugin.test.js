import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import {
	extendLensCatalogueOperatorSchema,
	extendLensQueryIdentity,
	lensCatalogueSchemaCompatibility
} from './lensCatalogueSchemaPlugin.js';

const originalSchema = `const schema = {
  type: {
    enum: [
          "EQUALS",
          "BETWEEN"
        ]
  }
};`;

test('extendLensCatalogueOperatorSchema permits generated negative operators', () => {
	const patched = extendLensCatalogueOperatorSchema(originalSchema);

	assert.match(patched, /"EQUALS",\s*"BETWEEN",\s*"NEQUALS",\s*"NBETWEEN"/);
	assert.equal(extendLensCatalogueOperatorSchema(patched), patched);
});

test('lensCatalogueSchemaCompatibility only transforms the Lens module', () => {
	const plugin = lensCatalogueSchemaCompatibility();

	assert.equal(plugin.transform(originalSchema, '/app/src/example.js'), null);
	assert.match(
		plugin.transform(
			fs.readFileSync(new URL('./node_modules/@samply/lens/dist/lens.js', import.meta.url), 'utf8'),
			'/app/node_modules/@samply/lens/dist/lens.js?v=dev-hash'
		).code,
		/ovis-scoped-query-identity/
	);
	assert.match(
		plugin.transform(
			fs.readFileSync(new URL('./node_modules/@samply/lens/dist/lens.js', import.meta.url), 'utf8'),
			'/app/node_modules/@samply/lens/dist/lens.js'
		).code,
		/"NEQUALS"/
	);
});

test('query compatibility is idempotent and fails explicitly on an incompatible Lens update', () => {
	const source = fs.readFileSync(
		new URL('./node_modules/@samply/lens/dist/lens.js', import.meta.url),
		'utf8'
	);
	const patched = extendLensQueryIdentity(source);
	assert.equal(extendLensQueryIdentity(patched), patched);
	assert.throws(
		() => extendLensQueryIdentity('new upstream version'),
		/Review the Lens query identity adapter/
	);
});

test('extendLensCatalogueOperatorSchema fails when the upstream schema changes', () => {
	assert.throws(
		() => extendLensCatalogueOperatorSchema('const schema = {};'),
		/Unable to locate the Lens catalogue operator enum/
	);
});
