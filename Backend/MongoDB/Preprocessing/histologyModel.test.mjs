import assert from 'node:assert/strict';
import test from 'node:test';

import {
	deriveGradingFeatures,
	getHistologyCodes,
	materializeHistologyDocuments
} from './histologyModel.mjs';

test('materializes diagnosis and pathology histologies as independent flat documents', () => {
	const diagnoses = [
		{
			tumorID: 't1',
			patID: 'p1',
			ICDO_histologyCode: '8140/3',
			ICDO_histologyCodeText: 'Adenokarzinom',
			ICDO_histologyDate: '2024-01-10',
			ICDO_localizationCode: 'C18.9'
		}
	];
	const histologies = [
		{
			tumorID: 't1',
			ICDO_histologyCode: '8500/3',
			ICDO_histologyDescription: 'Duktales Karzinom',
			ICDO_histologyDate: '2024-01-10',
			grading: '2'
		},
		{
			tumorID: 't1',
			ICDO_histologyCode: '8140/3',
			ICDO_histologyDate: '2024-02-10',
			grading: '3'
		}
	];

	const documents = materializeHistologyDocuments(diagnoses, histologies);

	assert.equal(documents.length, 3);
	assert.equal(documents[0].ICDO_source, 'diagnosis');
	assert.equal(documents[1].ICDO_source, 'other');
	assert.equal(documents[1].patID, 'p1');
	assert.equal(documents[1].ICDO_histologyCodeText, 'Duktales Karzinom');
	assert.equal(documents[1].ICDO_grading, '2');
	assert.equal(documents[0].ICDO_mixedTumor, true);
	assert.equal(documents[1].ICDO_mixedTumor, true);
	assert.equal(documents[2].ICDO_mixedTumor, false);
	assert.equal('ICDO' in diagnoses[0], false);
	assert.equal('patID' in histologies[0], false);
});

test('derives grading aggregates without keeping an ICDO array on diagnosis', () => {
	const features = deriveGradingFeatures([
		{ ICDO_histologyDate: '2024-03-01', grading: '2' },
		{ ICDO_histologyDate: '2024-01-01', grading: '1' },
		{ ICDO_histologyDate: '2024-02-01', grading: 'hochgradig maligne' }
	]);

	assert.deepEqual(features, {
		grading_first: '1',
		grading_last: '2',
		grading_lowest: '1',
		grading_highest: 'hochgradig maligne'
	});
});

test('collects diagnosis and pathology codes for rule evaluation', () => {
	assert.deepEqual(
		getHistologyCodes(
			{ ICDO_histologyCode: '8140/3' },
			[{ ICDO_histologyCode: '8500/3' }, { ICDO_histologyCode: null }]
		),
		['8140/3', '8500/3']
	);
});
