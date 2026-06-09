const LOG_PREFIX = '[preprocessor-config]';

const defaults = {
	deceasedKeywords: ['verstorben', 'dead', 'deceased', 'not alive', 'gestorben'],

	// Legacy defaults (still supported)
	rezidivPrefixes: ['Rezidiv'],
	rezidivCanonical: 'Rezidiv',
	rezidivLymphStates: ['Rezidiv', 'Neu'],
	progressLabels: ['Progression', 'Divergentes Geschehen', 'Rezidiv'],
	completeRemissionLabels: ['Vollremission / Tumorfrei (complete remission)'],
	rClassSuccess: ['R0'],
	localRStateSuccess: ['R0'],
	metastasisPrefixes: ['Rezidiv', 'Neu'],
	metastasisSpreadValues: ['Neu', 'Rezidiv', 'Tumornachweis'],
	metastasisStratification: {
		synchron: 'Synchrone Metastasierung',
		none: 'keine synchrone Metastasierung'
	},
	nullStudyPhases: ['NOPH', 'KA'],

	previousTherapyMap: {
		surgery: ['operation'],
		systemic: ['systemic'],
		radiation: ['radiation']
	},
	previousConsultationMap: {
		nutrition: ['nutrition'],
		social: ['social'],
		psycho: ['psycho'],
		genetic: ['genetic']
	},
	previousDiagnosticMap: {
		radiology: ['MRT', 'CT']
	},
	tumorboardPatterns: {
		prae: 'prae|prä|pre',
		post: 'post',
		mtb: 'mtb'
	},
	ecogPrefix: 'ECOG',
	distressType: 'distress',
	distressPositiveValues: ['Positiv'],

	// New rule defaults (explicit per field)
	rules: {
		rezidiv: {
			overallAssessment: { match: 'prefix', values: ['Rezidiv'] },
			tumorState: { match: 'prefix', values: ['Rezidiv'] },
			lymphNodeState: { match: 'equals', values: ['Rezidiv', 'Neu'] },
			biochemRecurrence: { match: 'equals', values: ['Ja'] }
		},
		metastasisFromProgress: { match: 'equals', values: ['Neu', 'Rezidiv'] },
		progress: { match: 'equals', values: ['Progression', 'Divergentes Geschehen', 'Rezidiv'] },
		completeRemission: {
			match: 'equals',
			values: ['Vollremission / Tumorfrei (complete remission)']
		}
	}
};

const trim = (value) => (value ?? '').toString().trim();
const normalizeLower = (value) => trim(value).toLowerCase();

const applyOptions = (list, { lowercase } = {}) => {
	let out = [...list];
	if (lowercase) out = out.map(normalizeLower);
	return out;
};

const splitWithEscapes = (value, delimiters) => {
	const chars = Array.from(value ?? '');
	const result = [];
	let buffer = '';
	let escaped = false;

	for (const ch of chars) {
		if (escaped) {
			buffer += ch;
			escaped = false;
			continue;
		}
		if (ch === '\\') {
			escaped = true;
			continue;
		}
		if (delimiters.has(ch)) {
			const entry = trim(buffer);
			if (entry && entry.toLowerCase() !== 'null') result.push(entry);
			buffer = '';
			continue;
		}
		buffer += ch;
	}

	if (buffer.length > 0 || value === '') {
		const entry = trim(buffer);
		if (entry && entry.toLowerCase() !== 'null') result.push(entry);
	}

	return result;
};

const readListEnv = (key, fallback = [], options = {}) => {
	const raw = process.env[key];
	if (!raw || !raw.trim()) return applyOptions(fallback, options);

	const rawTrimmed = raw.trim();
	if (rawTrimmed.startsWith('[') && rawTrimmed.endsWith(']')) {
		try {
			const parsed = JSON.parse(rawTrimmed);
			if (Array.isArray(parsed)) {
				const cleaned = parsed
					.map((entry) => trim(entry))
					.filter((entry) => entry && entry.toLowerCase() !== 'null');
				if (cleaned.length) return applyOptions(cleaned, options);
			}
		} catch (error) {
			console.warn(`${LOG_PREFIX} ${key} JSON list parse failed: ${error.message}`);
		}
	}

	const tokens = splitWithEscapes(raw, new Set([';', ',']));
	if (tokens.length === 0) {
		if (fallback.length) {
			console.warn(`${LOG_PREFIX} ${key} resolved to an empty list; falling back to defaults.`);
		}
		return applyOptions(fallback, options);
	}
	return applyOptions(tokens, options);
};

const readStringEnv = (key, fallback) => {
	const raw = process.env[key];
	if (raw == null) return fallback;
	const value = trim(raw);
	if (!value) return fallback;
	return value;
};

const readEnumEnv = (key, fallback, allowed) => {
	const value = normalizeLower(readStringEnv(key, fallback));
	if (allowed.includes(value)) return value;
	console.warn(
		`${LOG_PREFIX} ${key}="${value}" is invalid; allowed: ${allowed.join(
			', '
		)}. Using "${fallback}".`
	);
	return normalizeLower(fallback);
};

const createRegex = (pattern, key) => {
	try {
		return new RegExp(pattern, 'i');
	} catch (error) {
		console.warn(`${LOG_PREFIX} failed to compile regex for ${key}: ${error.message}`);
		return null;
	}
};

const listToSet = (list) => new Set(list.map(normalizeLower).filter(Boolean));

const deceasedKeywords = readListEnv('OVIS_PREPROC_DECEASED_KEYWORDS', defaults.deceasedKeywords, {
	lowercase: true
});

// --- Legacy inputs (still parsed so older deployments keep working) ---
const rezidivCanonical = readStringEnv('OVIS_PREPROC_REZIDIV_CANONICAL', defaults.rezidivCanonical);
const rezidivPrefixesRaw = readListEnv('OVIS_PREPROC_REZIDIV_PREFIXES', defaults.rezidivPrefixes);
const rezidivPrefixes = [...new Set(rezidivPrefixesRaw.map(trim).filter(Boolean))];
const rezidivCanonicalLower = normalizeLower(rezidivCanonical);
if (!rezidivPrefixes.some((item) => normalizeLower(item) === rezidivCanonicalLower)) {
	rezidivPrefixes.push(rezidivCanonical);
}
const rezidivPrefixesNormalized = listToSet(rezidivPrefixes);

const rezidivLymphStates = readListEnv(
	'OVIS_PREPROC_REZIDIV_LYMPH_STATES',
	defaults.rezidivLymphStates
);

const progressLabelsLegacy = readListEnv('OVIS_PREPROC_PROGRESS_LABELS', defaults.progressLabels);
const completeRemissionLabelsLegacy = readListEnv(
	'OVIS_PREPROC_COMPLETE_REMISSION_LABELS',
	defaults.completeRemissionLabels
);

const rClassSuccess = readListEnv('OVIS_PREPROC_RCLASS_SUCCESS', defaults.rClassSuccess);
const localRStateSuccess = readListEnv(
	'OVIS_PREPROC_LOCAL_RSTATE_SUCCESS',
	defaults.localRStateSuccess
);

const metastasisPrefixesLegacy = readListEnv(
	'OVIS_PREPROC_METASTASIS_PREFIXES',
	defaults.metastasisPrefixes
);
const metastasisSpreadValues = readListEnv(
	'OVIS_PREPROC_METASTASIS_SPREAD_VALUES',
	defaults.metastasisSpreadValues
);

const metastasisStratSynchron = readStringEnv(
	'OVIS_PREPROC_METASTASIS_STRAT_SYNCHRON',
	defaults.metastasisStratification.synchron
);
const metastasisStratNone = readStringEnv(
	'OVIS_PREPROC_METASTASIS_STRAT_NONE',
	defaults.metastasisStratification.none
);

const nullStudyPhases = readListEnv('OVIS_PREPROC_NULL_STUDY_PHASES', defaults.nullStudyPhases);

const previousTherapyMap = {
	surgery: readListEnv('OVIS_PREPROC_PREV_THERAPY_SURGERY', defaults.previousTherapyMap.surgery),
	systemic: readListEnv('OVIS_PREPROC_PREV_THERAPY_SYSTEMIC', defaults.previousTherapyMap.systemic),
	radiation: readListEnv(
		'OVIS_PREPROC_PREV_THERAPY_RADIATION',
		defaults.previousTherapyMap.radiation
	)
};

const previousConsultationMap = {
	nutrition: readListEnv(
		'OVIS_PREPROC_PREV_CONSULTATION_NUTRITION',
		defaults.previousConsultationMap.nutrition
	),
	social: readListEnv(
		'OVIS_PREPROC_PREV_CONSULTATION_SOCIAL',
		defaults.previousConsultationMap.social
	),
	psycho: readListEnv(
		'OVIS_PREPROC_PREV_CONSULTATION_PSYCHO',
		defaults.previousConsultationMap.psycho
	),
	genetic: readListEnv(
		'OVIS_PREPROC_PREV_CONSULTATION_GENETIC',
		defaults.previousConsultationMap.genetic
	)
};

const previousDiagnosticMap = {
	radiology: readListEnv(
		'OVIS_PREPROC_PREV_DIAGNOSTIC_RADIOLOGY',
		defaults.previousDiagnosticMap.radiology
	)
};

const tumorboardPatterns = {
	prae: createRegex(
		readStringEnv('OVIS_PREPROC_TUMORBOARD_PATTERN_PRAE', defaults.tumorboardPatterns.prae),
		'OVIS_PREPROC_TUMORBOARD_PATTERN_PRAE'
	),
	post: createRegex(
		readStringEnv('OVIS_PREPROC_TUMORBOARD_PATTERN_POST', defaults.tumorboardPatterns.post),
		'OVIS_PREPROC_TUMORBOARD_PATTERN_POST'
	),
	mtb: createRegex(
		readStringEnv('OVIS_PREPROC_TUMORBOARD_PATTERN_MTB', defaults.tumorboardPatterns.mtb),
		'OVIS_PREPROC_TUMORBOARD_PATTERN_MTB'
	)
};

const ecogPrefix = readStringEnv('OVIS_PREPROC_ECOG_PREFIX', defaults.ecogPrefix);
const distressType = readStringEnv('OVIS_PREPROC_DISTRESS_TYPE', defaults.distressType);
const distressPositiveValues = readListEnv(
	'OVIS_PREPROC_DISTRESS_POSITIVE_VALUES',
	defaults.distressPositiveValues
);

// --- New explicit rule inputs (preferred) ---
const MATCH_TYPES = ['equals', 'prefix', 'contains', 'regex'];

const readRule = ({ matchKey, valuesKey, defaultRule, legacyValues } = {}) => {
	const match = readEnumEnv(matchKey, defaultRule.match, MATCH_TYPES);
	const values = readListEnv(valuesKey, defaultRule.values ?? [], {});
	const resolvedValues = values.length ? values : legacyValues ?? defaultRule.values ?? [];
	return {
		match,
		values: resolvedValues,
		valuesNormalized: listToSet(resolvedValues),
		// regex support: values can be regex patterns (strings)
		regexes:
			match === 'regex'
				? resolvedValues.map((p, idx) => createRegex(p, `${valuesKey}[${idx}]`)).filter(Boolean)
				: []
	};
};

// Rules: Rezidiv
const ruleRezidivOverall = readRule({
	matchKey: 'OVIS_RULE_PP_OVERALLASSESSMENT_REZIDIV_MATCH',
	valuesKey: 'OVIS_RULE_PP_OVERALLASSESSMENT_REZIDIV_VALUES',
	defaultRule: defaults.rules.rezidiv.overallAssessment,
	legacyValues: rezidivPrefixes
});

const ruleRezidivTumorState = readRule({
	matchKey: 'OVIS_RULE_PP_TUMORSTATE_REZIDIV_MATCH',
	valuesKey: 'OVIS_RULE_PP_TUMORSTATE_REZIDIV_VALUES',
	defaultRule: defaults.rules.rezidiv.tumorState,
	legacyValues: rezidivPrefixes
});

const ruleRezidivLymph = readRule({
	matchKey: 'OVIS_RULE_PP_LYMPHNODESTATE_REZIDIV_MATCH',
	valuesKey: 'OVIS_RULE_PP_LYMPHNODESTATE_REZIDIV_VALUES',
	defaultRule: defaults.rules.rezidiv.lymphNodeState,
	legacyValues: rezidivLymphStates
});

const ruleRezidivBiochem = readRule({
	matchKey: 'OVIS_RULE_PP_BIOCHEMRECURRENCE_REZIDIV_MATCH',
	valuesKey: 'OVIS_RULE_PP_BIOCHEMRECURRENCE_REZIDIV_VALUES',
	defaultRule: defaults.rules.rezidiv.biochemRecurrence
});

// Rule: metastasis from progress
const ruleMetFromProgress = readRule({
	matchKey: 'OVIS_RULE_PP_METASTASISSTATE_MET_MATCH',
	valuesKey: 'OVIS_RULE_PP_METASTASISSTATE_MET_VALUES',
	defaultRule: defaults.rules.metastasisFromProgress,
	legacyValues: metastasisPrefixesLegacy
});

// Rule: progress (overallAssessment)
const ruleProgressOverall = readRule({
	matchKey: 'OVIS_RULE_PP_OVERALLASSESSMENT_PROGRESS_MATCH',
	valuesKey: 'OVIS_RULE_PP_OVERALLASSESSMENT_PROGRESS_VALUES',
	defaultRule: defaults.rules.progress,
	legacyValues: progressLabelsLegacy
});

// Rule: complete remission (overallAssessment)
const ruleCompleteRemissionOverall = readRule({
	matchKey: 'OVIS_RULE_PP_OVERALLASSESSMENT_COMPLETE_REMISSION_MATCH',
	valuesKey: 'OVIS_RULE_PP_OVERALLASSESSMENT_COMPLETE_REMISSION_VALUES',
	defaultRule: defaults.rules.completeRemission,
	legacyValues: completeRemissionLabelsLegacy
});

const debugRules = normalizeLower(readStringEnv('OVIS_PREPROC_DEBUG_RULES', 'false')) === 'true';
if (debugRules) {
	console.log(`${LOG_PREFIX} Loaded rules:`);
	console.log(
		JSON.stringify(
			{
				rezidiv: {
					overallAssessment: ruleRezidivOverall,
					tumorState: ruleRezidivTumorState,
					lymphNodeState: ruleRezidivLymph,
					biochemRecurrence: ruleRezidivBiochem
				},
				metastasisFromProgress: ruleMetFromProgress,
				progressOverallAssessment: ruleProgressOverall,
				completeRemissionOverallAssessment: ruleCompleteRemissionOverall
			},
			null,
			2
		)
	);
}

const config = {
	deceased: {
		keywords: deceasedKeywords
	},

	// Legacy groups kept (existing code depends on them)
	rezidiv: {
		canonical: rezidivCanonical,
		canonicalLower: rezidivCanonicalLower,
		prefixes: rezidivPrefixes,
		prefixesNormalized: rezidivPrefixesNormalized,
		lymphStates: rezidivLymphStates,
		lymphStatesNormalized: listToSet(rezidivLymphStates)
	},

	dfs: {
		// Keep legacy arrays, but prefer new explicit rules for normalized sets:
		progressLabels: ruleProgressOverall.values,
		progressLabelsNormalized: ruleProgressOverall.valuesNormalized,
		completeRemissionLabels: ruleCompleteRemissionOverall.values,
		completeRemissionNormalized: ruleCompleteRemissionOverall.valuesNormalized,
		rClassSuccess,
		rClassSuccessNormalized: listToSet(rClassSuccess),
		localRStateSuccess,
		localRStateSuccessNormalized: listToSet(localRStateSuccess)
	},

	metastasis: {
		// legacy
		prefixes: metastasisPrefixesLegacy,
		prefixesNormalized: listToSet(metastasisPrefixesLegacy),
		spreadValues: metastasisSpreadValues,
		spreadValuesNormalized: listToSet(metastasisSpreadValues),
		stratification: {
			synchron: metastasisStratSynchron,
			none: metastasisStratNone
		}
	},

	// New explicit rule bundle used by the preprocessor:
	rules: {
		rezidiv: {
			overallAssessment: ruleRezidivOverall,
			tumorState: ruleRezidivTumorState,
			lymphNodeState: ruleRezidivLymph,
			biochemRecurrence: ruleRezidivBiochem
		},
		metastasisFromProgress: ruleMetFromProgress,
		progressOverallAssessment: ruleProgressOverall,
		completeRemissionOverallAssessment: ruleCompleteRemissionOverall
	},

	study: {
		nullPhases: nullStudyPhases,
		nullPhasesNormalized: listToSet(nullStudyPhases)
	},
	previousTherapy: previousTherapyMap,
	previousConsultation: previousConsultationMap,
	previousDiagnostic: previousDiagnosticMap,
	tumorboard: {
		patterns: tumorboardPatterns
	},
	status: {
		ecogPrefix,
		ecogPrefixLower: normalizeLower(ecogPrefix),
		distressType,
		distressTypeLower: normalizeLower(distressType),
		distressPositiveValues,
		distressPositiveNormalized: listToSet(distressPositiveValues)
	}
};

export { config, normalizeLower, readListEnv, readStringEnv };
