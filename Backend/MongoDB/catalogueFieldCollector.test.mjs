import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

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

test('checked-in catalogue criteria satisfy the Lens text schema', async () => {
	const catalogue = JSON.parse(
		await readFile(new URL('./ovis-catalogue.json', import.meta.url), 'utf8')
	);
	const invalidCriteria = [];

	for (const [categoryIndex, category] of catalogue.entries()) {
		for (const [childIndex, child] of (category.childCategories || []).entries()) {
			for (const [criterionIndex, criterion] of (child.criteria || []).entries()) {
				if (
					typeof criterion.key !== 'string' ||
					!/^.+$/.test(criterion.key) ||
					typeof criterion.name !== 'string' ||
					!/^.+$/.test(criterion.name)
				) {
					invalidCriteria.push({ categoryIndex, childIndex, criterionIndex });
				}
			}
		}
	}

	assert.deepEqual(invalidCriteria, []);
});
