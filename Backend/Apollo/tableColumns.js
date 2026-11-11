// Only fields exposed as cells in the clinical tables can be enumerated or
// used as predicates here. In particular, never accept arbitrary Mongo paths.
const columns = Object.fromEntries(
	Object.entries({
		patient: `patID firstName lastName gender birthDate postalCode area countryCode vitalDate
		vitalState`,

		diagnosis: `patID tumorID diagnosisDate ICD.ICD10 ICDO_localizationCode ICDO_histologyCode
		ageAtDiagnosis reportID`,

		diagnostic: 'patID tumorID investigationMethod diagnosticOccurrenceDate',

		histology: `patID tumorID ICDO_histologyCode ICDO_histologyCodeText ICDO_grading ICDO_source
		ICDO_histologyDate ICDO_Nb ICDO_Nu ICDO_sNb ICDO_sNu ICDO_mixedTumor`,

		therapy: `therapyID patID tumorID generalType therapyOccurrenceDate therapyEndDate
		therapyDaysSinceDiagnosis intention surgeryContext complication terminationReason
		status internal organizationalUnit reportID ops resectionType metastasisResection
		localRState globalRState emergencySurgery surgeon subType protocol substance
		cyclesPlanned cyclesPerformed doseDeviation subTypeCode radioNuclid radioNuclidCode
		radiopharmaceutical radiopharmaceuticalCode`,

		radiation: `therapyID patID tumorID therapyOccurrenceDate therapyDaysSinceDiagnosis combination
		type brachyType duration performance stereo breath tech radioType radioNuclid
		singleDose singleDoseUnit totalDose totalDoseUnit boost subArea areaDetailed side
		radioTarget metastasis lymphNodes`,

		progress: `patID tumorID progressOccurrenceDate progressDaysSinceDiagnosis overallAssessment
		tumorState lymphNodeState metastasisState vitalState progressReason progressSource
		reportID`,

		tnm: `patID tumorID tnmOccurrenceDate version type a r y preT T multipleT preN N Nb Nu
		preM M total RClass L V Pn S UICC`,

		metastasis: 'patID tumorID metastasisDate metastasisLocation type spread',

		study: `studyID shortname status start firstPatInPlanned phase eudract organisationFull
		organisationShort studyPatients`,

		studyPatient: 'studyID shortname patID recruitmentDate',

		consultation:
			'patID tumorID consultationOccurrenceDate consultationDaysSinceDiagnosis type status',

		tumorBoard: `patID tumorID tumorBoardOccurrenceDate tumorBoardDaysSinceDiagnosis type
		presentationMode praepost tbInternal recommendation referrer
		humanGeneticConsultation pathologyReport therapyProposals
		rationaleTherapyRecommendation molecularAnalysis nctMaster
		targetabilityAndTargeting freeTextsAndRemarks molecularCounseling`,

		supplementary: 'patID tumorID supplementaryOccurrenceDate type status therapyID',

		bioMaterial: 'patID tumorID bioMaterialOccurrenceDate type status project reference amount',

		molecularMarker: `patID tumorID molecularMarkerOccurrenceDate type exon status miscellaneous method
		project`,

		status: 'patID tumorID statusOccurrenceDate statusDaysSinceDiagnosis type status'
	}).map(([collection, fields]) => [collection, new Set(fields.split(/\s+/))])
);

const hasTableColumn = (collection, field) =>
	Object.hasOwn(columns, collection) && columns[collection].has(field);

module.exports = { hasTableColumn };
