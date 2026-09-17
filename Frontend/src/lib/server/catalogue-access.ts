import type { BackendSession } from './backend-auth';

const CLINICAL_COLLECTIONS = new Set([
	'patient', 'diagnosis', 'histology', 'therapy', 'progress', 'followUp', 'tnm',
	'metastasis', 'consultation', 'tumorBoard', 'diagnostic', 'kaplanMeier',
	'study', 'studyPatient', 'supplementary', 'molecularMarker', 'bioMaterial',
	'status', 'ops', 'operation', 'systemic', 'radiation'
]);
const normalize = (key: unknown) => typeof key === 'string' ? key.replace(/^!/, '') : '';

/** A policy change must invalidate the browser's catalogue even without a new import. */
export function catalogueRevision(timestamp: number, session: BackendSession): string {
	return `${timestamp}:v1:${Number(session.cohortRestricted)}:${Number(session.pseudonymization)}`;
}

/** Apply to stored catalogues too, so older generated files cannot bypass access policy. */
export function protectCatalogue(data: unknown, session: BackendSession): unknown[] {
	if (!Array.isArray(data)) throw new Error('Unsupported catalogue format');
	return data.filter((category) => CLINICAL_COLLECTIONS.has(normalize(category?.key))).map((category) => ({
		...category,
		childCategories: (Array.isArray(category.childCategories) ? category.childCategories : [])
			.filter((field: any) => !session.pseudonymization || !['firstName', 'lastName'].includes(normalize(field?.key)))
			.map((field: any) => session.cohortRestricted && field.system !== 'ops'
				? { ...field, criteria: [] }
				: field)
	}));
}
