import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
	classifyEnetsDiagnosis,
	enetsCancerCategories,
	enetsCategoryGroups,
	enetsCategoryLabels,
	enetsCategoryOrder,
	enetsGepTopographies,
	enetsUnclearDefinition
} from './enets.mjs';

test('classifies a gastric GEP-NET and its aggregate group', () => {
	assert.deepEqual(
		classifyEnetsDiagnosis({
			ICDO_localizationCode: 'c16.2',
			ICDO_histologyCode: '8240/3'
		}),
		{
			enetsGepNen: true,
			gepNet: true,
			gepNec: false,
			minen: false,
			enetsUnclear: false
		}
	);
});

test('uses pathology histology and inherits the diagnosis topography', () => {
	const result = classifyEnetsDiagnosis({ ICDO_localizationCode: 'C25.1' }, [
		{ ICDO_histologyCode: '8041/3' }
	]);

	assert.equal(result.enetsGepNen, true);
	assert.equal(result.gepNec, true);
	assert.equal(result.enetsUnclear, false);
});

test('classifies pancreatic MiNEN', () => {
	const result = classifyEnetsDiagnosis({
		ICDO_localizationCode: 'C25.9',
		ICDO_histologyCode: '8154/3'
	});

	assert.equal(result.enetsGepNen, true);
	assert.equal(result.minen, true);
});

test('marks a potentially neuroendocrine non-GEP tumour for review', () => {
	const result = classifyEnetsDiagnosis({
		ICDO_localizationCode: 'C34.9',
		ICDO_histologyCode: '8240/3'
	});

	assert.equal(result.enetsGepNen, false);
	assert.equal(result.enetsUnclear, true);
});

test('does not mark unrelated morphology as ENETS or unclear', () => {
	const result = classifyEnetsDiagnosis({
		ICDO_localizationCode: 'C18.9',
		ICDO_histologyCode: '8140/3'
	});

	assert.deepEqual(Object.values(result), [false, false, false, false, false]);
});

test('a valid match takes precedence over an additional potential mismatch', () => {
	const result = classifyEnetsDiagnosis(
		{
			ICDO_localizationCode: 'C18.9',
			ICDO_histologyCode: '8240/3'
		},
		[{ ICDO_localizationCode: 'C34.9', ICDO_histologyCode: '8240/3' }]
	);

	assert.equal(result.gepNet, true);
	assert.equal(result.enetsUnclear, false);
});

test('published ENETS JSON mirrors the backend classification rules', async () => {
	const publishedRules = JSON.parse(
		await readFile(
			new URL('../../../Frontend/static/downloads/enetsRules.json', import.meta.url),
			'utf8'
		)
	);
	const expandedPublishedRules = publishedRules.rules.flatMap((rule) =>
		rule.topographyPrefixes.flatMap((topography) =>
			rule.morphologyCodes.map((morphology) => ({
				category: rule.category,
				topography,
				morphology
			}))
		)
	);
	const byCodePair = (left, right) =>
		`${left.category}|${left.topography}|${left.morphology}`.localeCompare(
			`${right.category}|${right.topography}|${right.morphology}`
		);

	assert.deepEqual(publishedRules.categoryLabels, enetsCategoryLabels);
	assert.deepEqual(publishedRules.categoryGroups, enetsCategoryGroups);
	assert.deepEqual(publishedRules.categoryOrder, enetsCategoryOrder);
	assert.deepEqual(publishedRules.gepTopographies, enetsGepTopographies);
	assert.deepEqual(publishedRules.unclearDefinition.potentialMorphologies, [
		...enetsUnclearDefinition.potentialMorphologies
	]);
	assert.deepEqual(
		publishedRules.unclearDefinition.excludeMatchedCategories,
		enetsUnclearDefinition.excludeMatchedCategories
	);
	assert.deepEqual(
		expandedPublishedRules.sort(byCodePair),
		[...enetsCancerCategories].sort(byCodePair)
	);
});
