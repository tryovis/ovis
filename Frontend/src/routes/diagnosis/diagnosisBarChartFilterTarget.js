const GRADING_AGGREGATION_FEATURES = new Set([
	'grading_first',
	'grading_last',
	'grading_lowest',
	'grading_highest'
]);

export function getDiagnosisBarChartClickFilterTarget(featureValue) {
	if (featureValue === 'VitalState') {
		return { key: 'vitalState', system: 'patient' };
	}

	if (GRADING_AGGREGATION_FEATURES.has(featureValue)) {
		return { key: 'ICDO_grading', system: 'diagnosis' };
	}

	return { key: featureValue, system: 'diagnosis' };
}
