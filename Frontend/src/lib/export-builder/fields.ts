import translations from '../../store/translations';
import type { Dataset, Field } from './model';

export type MongoExportField = { id: string; type: Field['type'] };

// Reuse the same labels as the clinical pages; unknown paths remain exact MongoDB names.
const sharedLabels: Record<string, string> = {
	_id: 'exportRecordID',
	patID: 'patientID',
	tumorID: 'tumorID',
	birthDate: 'birthDateLong',
	deathDate: 'deathLong',
	vitalDate: 'vitalDateLong',
	vitalState: 'vitalStatus',
	diagnosisDate: 'diagnosisDateLong',
	countryName: 'countryLong',
	postalCode: 'ZIPCode',
	'ICD.ICD10': 'ICD10',
	'ICD.ICD10_3': 'ICD10_3digit',
	'ICD.ICD10Group': 'ICD10_grouped',
	ICDO_histologyCode: 'histologyCodeLong',
	ICDO_histologyCodeText: 'histology',
	ICDO_histologyDate: 'histologyDate',
	ICDO_localizationCode: 'localizationCodeLong',
	ICDO_grading: 'grading',
	therapyOccurrenceDate: 'therapyOccurrenceDate',
	therapyEndDate: 'exportTherapyEndDate',
	shortname: 'studyShortname',
	recruitmentDate: 'studyRecruitmentDate'
};

const diagnosisLabels: Record<string, string> = {
	metastasis: 'metastases',
	recurrence: 'recurrence',
	distress: 'distressPresent',
	rareCancer: 'rareCancers',
	grading_first: 'gradingFirst',
	grading_last: 'gradingLast',
	grading_lowest: 'gradingLowest',
	grading_highest: 'gradingHighest',
	'previousTherapy.surgery': 'receivedSurgery',
	'previousTherapy.systemic': 'receivedSystemicTherapy',
	'previousTherapy.radiation': 'receivedRadiation',
	'previousDiagnostic.radiology': 'receivedRadiologicalDiagnostics',
	'previousConsultation.nutrition': 'nutrition',
	'previousConsultation.social': 'social',
	'previousConsultation.psycho': 'psychooncological',
	'previousConsultation.genetic': 'genetic',
	'previousTumorboard.any': 'tumorboardAny',
	'previousTumorboard.prae': 'tumorboardPrae',
	'previousTumorboard.post': 'tumorboardPost',
	'previousTumorboard.mtb': 'tumorboardMTB'
};

const isTranslated = (key: string): boolean =>
	Object.hasOwn(translations.de, key) && Object.hasOwn(translations.en, key);

/** Each page owns its catalogue; schema discovery must never mutate the shared defaults. */
export function mergeExportFields(
	base: readonly Dataset[],
	schema: Record<string, MongoExportField[]>
): Dataset[] {
	return base.map((dataset) => {
		const discovered = schema[dataset.id];
		if (!discovered?.length)
			return { ...dataset, fields: dataset.fields.map((field) => ({ ...field })) };
		const known = new Map(dataset.fields.map((field) => [field.id, field]));
		const order = new Map(dataset.fields.map((field, index) => [field.id, index]));
		const fields = [...new Map(discovered.map((field) => [field.id, field])).values()].map(
			({ id, type }): Field => {
				const existing = known.get(id);
				if (existing) return { ...existing, type };
				const label =
					(dataset.id === 'diagnosis' ? diagnosisLabels[id] : undefined) ?? sharedLabels[id] ?? id;
				return isTranslated(label)
					? { id, type, label }
					: { id, type, label: id, labelIsRaw: true };
			}
		);
		fields.sort((a, b) => {
			const position = (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity);
			return position || a.id.localeCompare(b.id, 'en');
		});
		return { ...dataset, fields };
	});
}

export function exportFieldLabel(field: Field, translate: (key: string) => string): string {
	return field.labelIsRaw ? field.label : translate(field.label);
}
