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

test('createCollectionCatalogue preserves observed diagnosis values and collection isolation', () => {
	const diagnosisCatalogue = createCollectionCatalogue('diagnosis', [
		{ ICD: { ICD10: 'C50.9', ICD10_3: 'C50' } }
	]);
	const therapyCatalogue = createCollectionCatalogue('therapy', [{ generalType: 'operation' }]);
	const icd10Field = diagnosisCatalogue.childCategories.find((field) => field.key === 'ICD_ICD10');

	assert.deepEqual(
		icd10Field.criteria.map((criterion) => criterion.key),
		['C50.9', '-']
	);
	assert.equal(
		therapyCatalogue.childCategories.some((field) => field.key.startsWith('ICD_ICD10')),
		false
	);
});

test('createCollectionCatalogue adds future ICD-10 C/D values absent from diagnosis documents', () => {
	const catalogue = createCollectionCatalogue(
		'diagnosis',
		[{ ICD: { ICD10: 'C50.9', ICD10_3: 'C50' } }],
		{
			additionalFieldValuesPerCollection: {
				diagnosis: { ICD_ICD10_3: ['C00', 'D48'] }
			}
		}
	);
	const icd10Field = catalogue.childCategories.find((field) => field.key === 'ICD_ICD10_3');

	assert.deepEqual(
		icd10Field.criteria.map((criterion) => criterion.key),
		['C50', 'C00', 'D48', '-']
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
