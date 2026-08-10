const normalizedText = (value) => String(value ?? '').trim();

const studyKeyFor = (study, index) => {
	const identity = [study?.studyID, study?.shortname, study?.organisationShort, study?.env]
		.map(normalizedText)
		.join('|');
	return `study:${index}:${identity}`;
};

/**
 * Split the importer-compatible nested study shape into two materialized
 * collections. Importers deliberately keep emitting `studyPatients`; the
 * database boundary owns the normalization.
 */
export function materializeStudyCollections(
	studies,
	{
		normalizeStudyDate = (value) => value,
		normalizeRecruitmentDate = (value) => value,
		normalizePhase = (value) => value
	} = {}
) {
	const studyDocuments = [];
	const studyPatientDocuments = [];

	for (let studyIndex = 0; studyIndex < (studies ?? []).length; studyIndex += 1) {
		const source = studies[studyIndex] ?? {};
		const studyKey = studyKeyFor(source, studyIndex);
		const { studyPatients = [], tumorID: _legacyTumorIDs, ...metadata } = source;
		const study = {
			...metadata,
			studyKey,
			start: normalizeStudyDate(metadata.start),
			firstPatInPlanned: normalizeStudyDate(metadata.firstPatInPlanned),
			phase: normalizePhase(metadata.phase)
		};
		studyDocuments.push(study);

		for (const participation of Array.isArray(studyPatients) ? studyPatients : []) {
			studyPatientDocuments.push({
				...participation,
				studyKey,
				studyID: metadata.studyID ?? null,
				shortname: metadata.shortname ?? null,
				recruitmentDate: normalizeRecruitmentDate(participation?.recruitmentDate)
			});
		}
	}

	return { studyDocuments, studyPatientDocuments };
}

export function shouldRebuildStudyCollections({
	hasStudyCollection,
	hasStudyPatientCollection,
	studyCount,
	studyPatientCount,
	expectedStudyCount,
	expectedStudyPatientCount,
	studySchemaCurrent,
	studyPatientSchemaCurrent
}) {
	// An empty import must never remove existing site data.
	if (expectedStudyCount === 0) return false;

	// With neither collection present, the normal initial write can proceed.
	if (!hasStudyCollection && !hasStudyPatientCollection) return false;

	return (
		!hasStudyCollection ||
		!hasStudyPatientCollection ||
		studyCount !== expectedStudyCount ||
		studyPatientCount !== expectedStudyPatientCount ||
		!studySchemaCurrent ||
		!studyPatientSchemaCurrent
	);
}

export const internal = { studyKeyFor };
