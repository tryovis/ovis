import assert from 'node:assert/strict';
import test from 'node:test';

import { getDiagnosisBarChartClickFilterTarget } from './diagnosisBarChartFilterTarget.js';

test('getDiagnosisBarChartClickFilterTarget maps grading aggregations to ICDO grading filter', () => {
	const gradingFeatures = ['grading_first', 'grading_last', 'grading_lowest', 'grading_highest'];

	for (const feature of gradingFeatures) {
		assert.deepEqual(getDiagnosisBarChartClickFilterTarget(feature), {
			key: 'ICDO_grading',
			system: 'diagnosis'
		});
	}
});

test('getDiagnosisBarChartClickFilterTarget keeps non-grading targets unchanged', () => {
	assert.deepEqual(getDiagnosisBarChartClickFilterTarget('ICD_ICD10Group'), {
		key: 'ICD_ICD10Group',
		system: 'diagnosis'
	});
	assert.deepEqual(getDiagnosisBarChartClickFilterTarget('VitalState'), {
		key: 'vitalState',
		system: 'patient'
	});
});
