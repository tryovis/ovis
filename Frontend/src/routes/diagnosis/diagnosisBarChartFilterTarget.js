export function getDiagnosisBarChartClickFilterTarget(featureValue) {
	if (featureValue === 'VitalState') {
		return { key: 'vitalState', system: 'patient' };
	}

	return { key: featureValue, system: 'diagnosis' };
}
