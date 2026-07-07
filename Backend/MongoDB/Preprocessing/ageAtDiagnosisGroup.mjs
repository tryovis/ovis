export const AGE_AT_DIAGNOSIS_GROUPS = [
	{ min: 0, max: 17, label: '0-17' },
	{ min: 18, max: 19, label: '18-19' },
	{ min: 20, max: 29, label: '20-29' },
	{ min: 30, max: 39, label: '30-39' },
	{ min: 40, max: 49, label: '40-49' },
	{ min: 50, max: 59, label: '50-59' },
	{ min: 60, max: 69, label: '60-69' },
	{ min: 70, max: 79, label: '70-79' },
	{ min: 80, max: 89, label: '80-89' },
	{ min: 90, max: 99, label: '90-99' }
];

export function formatAgeAtDiagnosisGroup(ageAtDiagnosis) {
	if (ageAtDiagnosis === null || ageAtDiagnosis === undefined || ageAtDiagnosis === '') return null;

	const age = Number(ageAtDiagnosis);
	if (!Number.isFinite(age) || age < 0) return null;
	if (age >= 100) return '100+';

	const group = AGE_AT_DIAGNOSIS_GROUPS.find(({ min, max }) => age >= min && age <= max);
	return group?.label ?? null;
}
