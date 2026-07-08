import assert from 'node:assert/strict';
import test from 'node:test';

import { createCollectionCatalogue } from './catalogueFieldCollector.mjs';

test('createCollectionCatalogue includes primitive array values as selectable criteria', () => {
	const catalogue = createCollectionCatalogue('therapy', [
		{
			generalType: 'operation',
			surgeon: ['Budcke (OP1)', 'Fey (OP2)', 'Knaier (ASS1)']
		}
	]);
	const surgeonField = catalogue.childCategories.find((field) => field.key === 'surgeon');

	assert.deepEqual(
		surgeonField.criteria.map((criterion) => criterion.key),
		['Budcke (OP1)', 'Fey (OP2)', 'Knaier (ASS1)', '-']
	);
});
