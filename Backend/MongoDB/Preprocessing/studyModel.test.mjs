import assert from 'node:assert/strict';
import test from 'node:test';

import { materializeStudyCollections } from './studyModel.mjs';

test('materializes study participants without changing the importer input shape', () => {
	const input = [
		{
			studyID: 'S-1',
			shortname: 'LUNG',
			status: 'open',
			tumorID: ['legacy-derived-value'],
			studyPatients: [
				{ patID: 'P-1', recruitmentDate: '01.02.2020', primary: true },
				{ patID: 'P-2', recruitmentDate: null }
			]
		}
	];

	const materialized = materializeStudyCollections(input, {
		normalizeRecruitmentDate: (value) => (value ? `date:${value}` : null)
	});

	assert.equal(materialized.studyDocuments.length, 1);
	assert.equal(materialized.studyPatientDocuments.length, 2);
	assert.equal('studyPatients' in materialized.studyDocuments[0], false);
	assert.equal('tumorID' in materialized.studyDocuments[0], false);
	assert.equal(materialized.studyPatientDocuments[0].patID, 'P-1');
	assert.equal(materialized.studyPatientDocuments[0].primary, true);
	assert.equal(materialized.studyPatientDocuments[0].recruitmentDate, 'date:01.02.2020');
	assert.equal(
		materialized.studyPatientDocuments[0].studyKey,
		materialized.studyDocuments[0].studyKey
	);
	assert.deepEqual(input[0].studyPatients[0], {
		patID: 'P-1',
		recruitmentDate: '01.02.2020',
		primary: true
	});
});

test('keeps repeated patient ids as distinct participation rows', () => {
	const { studyPatientDocuments } = materializeStudyCollections([
		{
			studyID: 'S-1',
			studyPatients: [
				{ patID: 'P-1', recruitmentDate: 1 },
				{ patID: 'P-1', recruitmentDate: 2 }
			]
		}
	]);

	assert.equal(studyPatientDocuments.length, 2);
	assert.deepEqual(
		studyPatientDocuments.map(({ patID, recruitmentDate }) => ({ patID, recruitmentDate })),
		[
			{ patID: 'P-1', recruitmentDate: 1 },
			{ patID: 'P-1', recruitmentDate: 2 }
		]
	);
});
