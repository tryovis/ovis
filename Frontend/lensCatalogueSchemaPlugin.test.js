import assert from 'node:assert/strict';
import test from 'node:test';

import {
	extendLensCatalogueOperatorSchema,
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
		plugin.transform(originalSchema, '/app/node_modules/@samply/lens/dist/lens.js').code,
		/"NEQUALS"/
	);
});

test('extendLensCatalogueOperatorSchema fails when the upstream schema changes', () => {
	assert.throws(
		() => extendLensCatalogueOperatorSchema('const schema = {};'),
		/Unable to locate the Lens catalogue operator enum/
	);
});
