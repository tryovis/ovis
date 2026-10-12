import { env } from '$env/dynamic/public';

// Compose maps the existing importer flag wuerzburgTBExtension to this runtime value.
// Match the importer's parsing so SQL selection and UI visibility stay in sync.
export const wuerzburgTBExtension =
	env.PUBLIC_WUERZBURG_TB_EXTENSION?.trim().toLowerCase() === 'true';

export const wuerzburgTumorboardFields = [
	'referrer',
	'humanGeneticConsultation',
	'pathologyReport',
	'therapyProposals',
	'rationaleTherapyRecommendation',
	'molecularAnalysis',
	'nctMaster',
	'targetabilityAndTargeting',
	'freeTextsAndRemarks',
	'molecularCounseling'
] as const;
