import { oncdb } from '../monConnector.js';
import { argv } from 'node:process';

import { plz } from './plz2dist.mjs';
import { areaGrouped, areaDetailed } from './radiationAreaCodes.mjs';
import { ccode } from './countryCode2countryName.mjs';
import { plz2province } from './plz2state.mjs';
import { plz2county } from './plz2county.mjs';
import { ICD10 } from './ICD10.mjs';
import { readFile } from 'node:fs/promises';
import { rareCancers } from './rareCancers.mjs';
import { ozRules } from './onkozertRules.mjs';
import { config, normalizeLower } from './env-config.mjs';
import { performance } from 'node:perf_hooks';

const timingEnabled = false;
const profilingEnabled = false;
const progressEnabled = true;
const progressInteractive = Boolean(process.stdout.isTTY);
const timings = [];
const profileTimings = new Map();
const collectionMetrics = [];
const processStartedAt = performance.now();
const orderedInsertOptions = { forceServerObjectId: true };
const pipelineStepCount = 23;

const progressState = {
	completedSteps: 0,
	label: 'starting',
	current: 0,
	total: 0,
	lastRenderAt: 0,
	lastLineLength: 0
};

const addTiming = (name, start, details = {}) => {
	if (!timingEnabled) return;
	timings.push({ name, durationMs: performance.now() - start, ...details });
};

const addDurationTiming = (name, durationMs, details = {}) => {
	if (!timingEnabled) return;
	timings.push({ name, durationMs, ...details });
};

const addProfileTiming = (name, start, count = 1) => {
	if (!profilingEnabled) return;
	const durationMs = performance.now() - start;
	const current = profileTimings.get(name) ?? { name, durationMs: 0, count: 0 };
	current.durationMs += durationMs;
	current.count += count;
	profileTimings.set(name, current);
};

const formatDuration = (durationMs) => {
	const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const progressBar = (fraction) => {
	const width = 24;
	const filled = Math.max(0, Math.min(width, Math.round(fraction * width)));
	return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
};

const renderProgress = (force = false) => {
	if (!progressEnabled) return;
	const now = performance.now();
	if (!force && now - progressState.lastRenderAt < 250) return;

	const currentFraction = progressState.total
		? Math.min(1, progressState.current / progressState.total)
		: 0;
	const overallFraction = Math.min(
		0.999,
		(progressState.completedSteps + currentFraction) / pipelineStepCount
	);
	const elapsedMs = now - processStartedAt;
	const itemProgress = progressState.total
		? ` | ${Math.min(progressState.current, progressState.total)}/${progressState.total}`
		: '';
	const line =
		`OVIS preprocessing [${progressBar(overallFraction)}] ` +
		`${Math.round(overallFraction * 100)}% | ` +
		`${Math.min(progressState.completedSteps + 1, pipelineStepCount)}/${pipelineStepCount} ` +
		`${progressState.label}${itemProgress} | elapsed ${formatDuration(elapsedMs)}`;
	if (progressInteractive) {
		const padding = Math.max(0, progressState.lastLineLength - line.length);
		process.stdout.write(`\r${line}${' '.repeat(padding)}`);
		progressState.lastLineLength = line.length;
	} else if (force) {
		process.stdout.write(`${line}\n`);
	}
	progressState.lastRenderAt = now;
};

const startProgressStep = (label, total = 0) => {
	progressState.label = label;
	progressState.current = 0;
	progressState.total = total;
	renderProgress(true);
};

const updateProgressStep = (current, total = progressState.total) => {
	progressState.current = current;
	progressState.total = total;
	renderProgress();
};

const renameProgressStep = (label) => {
	progressState.label = label;
	renderProgress(true);
};

const finishProgressStep = (label = progressState.label) => {
	progressState.label = label;
	progressState.current = progressState.total || 1;
	progressState.total = progressState.total || 1;
	renderProgress(true);
	progressState.completedSteps += 1;
};

const finishProgress = () => {
	if (!progressEnabled) return;
	progressState.completedSteps = pipelineStepCount;
	progressState.label = 'done';
	progressState.current = 1;
	progressState.total = 1;
	const elapsedMs = performance.now() - processStartedAt;
	const line = `OVIS preprocessing [${progressBar(
		1
	)}] 100% | ${pipelineStepCount}/${pipelineStepCount} done | elapsed ${formatDuration(elapsedMs)}`;
	if (progressInteractive) {
		const padding = Math.max(0, progressState.lastLineLength - line.length);
		process.stdout.write(`\r${line}${' '.repeat(padding)}\n`);
	} else {
		process.stdout.write(`${line}\n`);
	}
};

const logSafe = () => {};

// --- OnkoZert: Regelauswertung ---
const _eq_onko = (a, b) =>
	(a ?? '').toString().trim().toLowerCase() === (b ?? '').toString().trim().toLowerCase();

const _starts_onko = (a, b) =>
	(a ?? '')
		.toString()
		.toUpperCase()
		.startsWith((b ?? '').toString().toUpperCase());

/**
 * Prüft, ob eine einzelne OnkoZert-Regel auf ein Diagnosis-Objekt (obj) zutrifft.
 * data = gesamter Preprocessor-Datenkontext (für status/supplementary).
 *
 * Unterstützte Rule-Keys:
 * - entity (ID des Subfelds)
 * - ICD_ICD10        (exakt oder mit Suffix "*": Prefix-Match)
 * - ICD_ICD10_3      (exakt, z.B. "C50")
 * - ICDO_histologyCode (Prefix-Match auf irgendeinem ICDO-Eintrag)
 * - ageMin, ageMax   (numerisch, vergleicht obj.ageAtDiagnosis)
 * - status + type    (prüft data.status auf passenden Eintrag am selben tumorID)
 */
function matchesOnkozertRule(rule, obj, data) {
	for (const [key, val] of Object.entries(rule ?? {})) {
		if (key === 'entity' || val === undefined || val === null || val === '') continue;

		switch (key) {
			case 'ICD_ICD10': {
				const icd10 = obj?.ICD?.ICD10 ?? '';
				const ok = String(val).endsWith('*')
					? _starts_onko(icd10, String(val).slice(0, -1))
					: _eq_onko(icd10, val);
				if (!ok) return false;
				break;
			}
			case 'ICD_ICD10_3': {
				if (!_eq_onko(obj?.ICD?.ICD10_3, val)) return false;
				break;
			}
			case 'ICDO_histologyCode': {
				const list = obj?.ICDO ?? [];
				const ok = Array.isArray(list) && list.some((h) => _starts_onko(h?.histologyCode, val));
				if (!ok) return false;
				break;
			}
			case 'ageMin': {
				const age = obj?.ageAtDiagnosis;
				if (typeof age !== 'number' || age < Number(val)) return false;
				break;
			}
			case 'ageMax': {
				const age = obj?.ageAtDiagnosis;
				if (typeof age !== 'number' || age > Number(val)) return false;
				break;
			}
			case 'supplementary': {
				// z. B. { supplementary: "siewert", suppStatus: "I" }
				const expectedSuppStatus = rule.suppStatus;
				const ok = (data?.supplementary ?? []).some(
					(s) =>
						s?.tumorID === obj?.tumorID &&
						_eq_onko(s?.type, val) &&
						(expectedSuppStatus ? _eq_onko(s?.status, expectedSuppStatus) : true)
				);
				if (!ok) return false;
				break;
			}
			default:
				// Unbekannte Keys ignorieren (kein Fail)
				break;
		}
	}
	return true;
}

// --- helpers for time-based metastasis labelling ---
// Safeguard: set any date before 1900 (18XX etc.) to null and normalize common formats
const sanitizeDate = (value) => {
	if (!value) return null;
	// Handle German-style DD.MM.YYYY strings
	if (typeof value === 'string' && /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(value)) {
		const [d, m, y] = value.split('.');
		value = `${y}-${m}-${d}`; // ISO-ish so Date() parses reliably
	}
	const d = value instanceof Date ? value : new Date(value);
	if (isNaN(d)) return null;
	return d.getFullYear() < 1900 ? null : d;
};

const within90Days = (a, b) => {
	const A = sanitizeDate(a);
	const B = sanitizeDate(b);
	if (!A || !B) return false;
	const days = (B - A) / (1000 * 60 * 60 * 24);
	return days < 90; // ggf. <= 90, je nach Definition
};

const toDateKey = (value) => {
	const d = sanitizeDate(value);
	if (!d) return null;
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
};

const normalizeHistologyCode = (value) => (value ?? '').toString().trim().toUpperCase();

const applyMixedTumorFlag = (icdoEntries = []) => {
	const entriesByDate = new Map();

	for (const entry of icdoEntries) {
		entry.mixedTumor = false;

		const dateKey = toDateKey(entry.histologyDate);
		const histologyCode = normalizeHistologyCode(entry.histologyCode);
		if (!dateKey || !histologyCode) continue;

		let entries = entriesByDate.get(dateKey);
		if (!entries) {
			entries = [];
			entriesByDate.set(dateKey, entries);
		}
		entries.push(entry);
	}

	for (const entries of entriesByDate.values()) {
		const distinctCodes = new Set(
			entries.map((entry) => normalizeHistologyCode(entry.histologyCode)).filter(Boolean)
		);

		if (distinctCodes.size >= 2) {
			entries.forEach((entry) => {
				entry.mixedTumor = true;
			});
		}
	}

	return icdoEntries;
};

const matchesNormalizedSet = (value, set) => {
	if (!value || !(set instanceof Set) || set.size === 0) return false;
	return set.has(normalizeLower(value));
};

const matchesNormalizedPrefix = (value, prefixesSet) => {
	if (!value || !(prefixesSet instanceof Set) || prefixesSet.size === 0) return false;
	const normalized = normalizeLower(value);
	for (const prefix of prefixesSet) {
		if (normalized.startsWith(prefix)) return true;
	}
	return false;
};

const matchesNormalizedContains = (value, set) => {
	if (!value || !(set instanceof Set) || set.size === 0) return false;
	const normalized = normalizeLower(value);
	for (const token of set) {
		if (token && normalized.includes(token)) return true;
	}
	return false;
};

const matchesNormalizedRule = (value, rule) => {
	if (!rule) return false;
	switch ((rule.match || '').toLowerCase()) {
		case 'equals':
			return matchesNormalizedSet(value, rule.valuesNormalized);
		case 'prefix':
			return matchesNormalizedPrefix(value, rule.valuesNormalized);
		case 'contains':
			return matchesNormalizedContains(value, rule.valuesNormalized);
		case 'regex':
			return (
				Array.isArray(rule.regexes) && rule.regexes.some((rx) => rx?.test?.(String(value ?? '')))
			);
		default:
			return false;
	}
};

const firstTokenLower = (value) => {
	const normalized = normalizeLower(value);
	if (!normalized) return '';
	return normalized.split(' ', 1)[0];
};

const matchesFirstToken = (value, set) => {
	if (!(set instanceof Set) || set.size === 0) return false;
	const token = firstTokenLower(value);
	if (!token) return false;
	return set.has(token);
};

const mapValuesToSet = (mapping = {}) =>
	Object.fromEntries(
		Object.entries(mapping).map(([key, values]) => [
			key,
			new Set((values ?? []).map(normalizeLower).filter(Boolean))
		])
	);

// Precompute env-driven lookups so downstream logic stays concise.
const previousTherapySets = mapValuesToSet(config.previousTherapy);
const previousTherapyEntries = Object.entries(previousTherapySets);
const previousConsultationSets = mapValuesToSet(config.previousConsultation);
const previousDiagnosticSets = mapValuesToSet(config.previousDiagnostic);
const previousDiagnosticEntries = Object.entries(previousDiagnosticSets);
const tumorboardPatterns = config.tumorboard?.patterns ?? {};
const ecogPrefixLower = config.status?.ecogPrefixLower ?? '';
const distressTypeLower = config.status?.distressTypeLower ?? '';
const distressPositiveSet = config.status?.distressPositiveNormalized ?? new Set();
const provinceByPostalCode = buildPostalRangeLookup(plz2province, 'province');
const countyByPostalCode = buildPostalRangeLookup(plz2county, 'county');
const rareCancerHistologiesByDiagnosis = buildRareCancerHistologyIndex(rareCancers);
const onkozertRuleIndex = buildOnkozertRuleIndex(ozRules);

const regexMatches = (regex, value) => (regex instanceof RegExp ? regex.test(value ?? '') : false);

function buildPostalRangeLookup(ranges = [], valueKey) {
	const lookup = new Map();
	for (const range of ranges) {
		for (let code = range.from; code <= range.to; code += 1) {
			if (!lookup.has(code)) lookup.set(code, range[valueKey]);
		}
	}
	return lookup;
}

function buildRareCancerHistologyIndex(entries = []) {
	const index = new Map();
	for (const entry of entries) {
		if (!entry?.diagnosis || !entry?.histology) continue;
		let histologies = index.get(entry.diagnosis);
		if (!histologies) {
			histologies = new Set();
			index.set(entry.diagnosis, histologies);
		}
		histologies.add(entry.histology);
	}
	return index;
}

function isRareCancerDiagnosis(icd10, icdoEntries = []) {
	const histologies = rareCancerHistologiesByDiagnosis.get(icd10);
	if (!histologies) return false;
	for (const h of icdoEntries) {
		const histologyCode = h.histologyCode;
		if (!histologyCode) continue;
		for (const histology of histologies) {
			if (histologyCode.includes(histology)) return true;
		}
	}
	return false;
}

function buildOnkozertRuleIndex(rules = []) {
	const index = {
		entities: new Set(),
		fallback: [],
		icd10Exact: new Map(),
		icd10Prefixes: [],
		icd10Three: new Map(),
		histologyPrefixes: new Map(),
		histologyPrefixLengths: new Set()
	};

	const addToMap = (map, key, rule) => {
		let entries = map.get(key);
		if (!entries) {
			entries = [];
			map.set(key, entries);
		}
		entries.push(rule);
	};

	for (const rule of rules ?? []) {
		if (rule?.entity) index.entities.add(rule.entity);

		let indexed = false;
		if (rule?.ICD_ICD10) {
			const value = String(rule.ICD_ICD10);
			if (value.endsWith('*')) {
				index.icd10Prefixes.push({ prefix: value.slice(0, -1).toUpperCase(), rule });
			} else {
				addToMap(index.icd10Exact, value.trim().toLowerCase(), rule);
			}
			indexed = true;
		}
		if (rule?.ICD_ICD10_3) {
			addToMap(index.icd10Three, String(rule.ICD_ICD10_3).trim().toLowerCase(), rule);
			indexed = true;
		}
		if (rule?.ICDO_histologyCode) {
			const prefix = String(rule.ICDO_histologyCode).trim().toUpperCase();
			addToMap(index.histologyPrefixes, prefix, rule);
			index.histologyPrefixLengths.add(prefix.length);
			indexed = true;
		}
		if (!indexed) index.fallback.push(rule);
	}

	index.histologyPrefixLengths = [...index.histologyPrefixLengths].sort((a, b) => a - b);
	return index;
}

function createOnkozertEntityFlags() {
	return Object.fromEntries([...onkozertRuleIndex.entities].map((entity) => [entity, false]));
}

function getOnkozertCandidateRules(obj) {
	const candidates = new Set(onkozertRuleIndex.fallback);
	const icd10 = obj?.ICD?.ICD10 ?? '';
	const icd10Lower = String(icd10).trim().toLowerCase();
	const icd10Upper = String(icd10).toUpperCase();

	for (const rule of onkozertRuleIndex.icd10Exact.get(icd10Lower) ?? []) candidates.add(rule);
	for (const { prefix, rule } of onkozertRuleIndex.icd10Prefixes) {
		if (icd10Upper.startsWith(prefix)) candidates.add(rule);
	}
	for (const rule of onkozertRuleIndex.icd10Three.get(normalizeLower(obj?.ICD?.ICD10_3)) ?? []) {
		candidates.add(rule);
	}

	for (const histology of obj?.ICDO ?? []) {
		const histologyCode = String(histology?.histologyCode ?? '').toUpperCase();
		if (!histologyCode) continue;
		for (const length of onkozertRuleIndex.histologyPrefixLengths) {
			for (const rule of onkozertRuleIndex.histologyPrefixes.get(histologyCode.slice(0, length)) ??
				[]) {
				candidates.add(rule);
			}
		}
	}

	return candidates;
}

const earliest = (arr) =>
	arr
		.map(sanitizeDate)
		.filter(Boolean)
		.sort((x, y) => x - y)[0] ?? null;

const isDeceased = (raw) => {
	if (!raw) return false;
	const normalized = normalizeLower(raw);
	if (!normalized) return false;
	if (normalized === 'v') return true;
	const keywords = config.deceased?.keywords ?? [];
	return keywords.some((keyword) => normalized.startsWith(keyword) || normalized.includes(keyword));
};

// Liefert "synchron" | "metachron" | "both" | null
const classifyMetastasis = (diagnosisDate, metastasisDates = [], progressDates = []) => {
	if (!diagnosisDate) return null;
	const d0 = sanitizeDate(diagnosisDate);
	if (!d0) return null;

	let hasSyn = false,
		hasMeta = false;
	let hasAny = false;
	const classifyDate = (value) => {
		const d = sanitizeDate(value);
		if (!d) return;
		hasAny = true;
		const days = (d - d0) / (1000 * 60 * 60 * 24);
		if (days < 90) hasSyn = true;
		else hasMeta = true;
	};
	for (const value of metastasisDates) {
		classifyDate(value);
		if (hasSyn && hasMeta) return 'both';
	}
	for (const value of progressDates) {
		classifyDate(value);
		if (hasSyn && hasMeta) return 'both';
	}
	if (!hasAny) return null;
	return hasSyn ? 'synchron' : 'metachron';
};

// === UICC (KM) vereinfachte Regel (NEU) ===
// "Wir nehmen einfach das erste vorhandene UICC Stadium nach Diagnosestellung (nicht leer), normiert."
// Normierung: "IVB (AJCC8)" -> "IVB", "II A" -> "IIA", "0" -> "0"
const normalizeUiccStage = (raw) => {
	if (!raw) return null;
	const s = String(raw).trim().toUpperCase();
	if (!s) return null;

	const cleaned = s.replace(/\s+/g, '');
	const m = cleaned.match(/^(0|[IVX]+)([ABC])?/);
	if (!m) return null;

	const roman = m[1];
	const letter = m[2] ?? '';

	// ignore placeholders
	if (roman === '-' || roman === 'X') return null;

	return roman + letter;
};

const pickFirstUiccAfterDiagnosis = (tnmArr, diagnosisDate) => {
	if (!Array.isArray(tnmArr) || tnmArr.length === 0) return null;

	const d0 = sanitizeDate(diagnosisDate);
	if (!d0) return null;

	const sorted = [...tnmArr].sort((a, b) => {
		const da = sanitizeDate(a.tnmOccurrenceDate);
		const db = sanitizeDate(b.tnmOccurrenceDate);
		if (!da && !db) return 0;
		if (!da) return 1;
		if (!db) return -1;
		return da - db;
	});

	const first = sorted.find((t) => {
		const d1 = sanitizeDate(t.tnmOccurrenceDate);
		if (!d1) return false;
		if (d1 < d0) return false; // nach (oder am selben Tag)
		return !!normalizeUiccStage(t.UICC); // nicht leer + normierbar
	});

	return first ? normalizeUiccStage(first.UICC) : null;
};

// Gruppierung für KM-Stratifikation:
// null/leer -> "Ohne Eintrag"
// I/II/III/IV (inkl. Unterstufen wie "IIIB" -> "III")
// alles andere -> "Sonstige"
const uiccGroupFromNormalized = (uiccNorm) => {
	if (!uiccNorm) return 'Ohne Eintrag';
	const s = String(uiccNorm).trim().toUpperCase();
	if (!s) return 'Ohne Eintrag';
	// normalize "0" (UICC 0) and other non-roman into Sonstige
	if (s === '0') return 'Sonstige';
	if (s.startsWith('IV')) return 'IV';
	if (s.startsWith('III')) return 'III';
	if (s.startsWith('II')) return 'II';
	if (s.startsWith('I')) return 'I';
	return 'Sonstige';
};

// Gruppierung für T-Stadium (KM-Stratifikation):
// null/leer -> "Ohne Eintrag"
// 1/2/3/4 (egal ob "T1a", "pT1", "1a", etc.) -> "1".."4"
// alles andere -> "Sonstige"
const tStageGroupFromRaw = (tRaw) => {
	if (tRaw === null || tRaw === undefined) return 'Ohne Eintrag';
	const s = String(tRaw).trim().toUpperCase();
	if (!s) return 'Ohne Eintrag';

	// finde erste Ziffer 1-4, aber nicht als Teil von 10/11/...
	const m = s.match(/([1-4])(?!\d)/);
	if (m && m[1]) return m[1];
	return 'Sonstige';
};

// Auswahl des ersten T-Stadiums nach Diagnosedatum (>=), aber mit Typ-Priorität:
// definitive (3) > pathological (2) > clinical (1).
// Vorgehen: alle TNM-Einträge nach Diagnose sammeln -> bestes "type" wählen -> innerhalb davon frühestes Datum.
const pickFirstTAfterDiagnosisByPriority = (tnmArr, diagnosisDate) => {
	if (!Array.isArray(tnmArr) || tnmArr.length === 0) return null;

	const d0 = sanitizeDate(diagnosisDate);
	if (!d0) return null;

	const tnmtypeOrder = { definitive: 3, pathological: 2, clinical: 1 };

	const candidates = tnmArr
		.map((t) => ({
			...t,
			_d: sanitizeDate(t.tnmOccurrenceDate),
			_prio: tnmtypeOrder[String(t.type || '').toLowerCase()] ?? 0
		}))
		.filter((t) => t._d && t._d >= d0)
		.filter((t) => String(t.T ?? '').trim().length > 0);

	if (candidates.length === 0) return null;

	const bestPrio = Math.max(...candidates.map((t) => t._prio));
	const best = candidates.filter((t) => t._prio === bestPrio).sort((a, b) => a._d - b._d)[0];

	return best ? best.T : null;
};

//let mock = JSON.parse(await readFile('./prep/omock.json', { encoding: 'utf8' }))
let mock = {
	diagnosis: [],
	patient: [],
	histology: [],
	therapy: [],
	consultation: [],
	progress: [],
	metastasis: [],
	status: [],
	singleRadiation: [],
	diagnostic: [],
	supplementary: [],
	molecularMarker: [],
	tnm: [],
	study: [],
	kaplanMeier: [],
	bioMaterial: [],
	tumorBoard: []
};

// --- normalize metastasisResection to array in therapy table ---
const _toArray = (val) => {
	if (Array.isArray(val)) return val.filter(Boolean);
	if (val == null) return [];
	if (typeof val === 'string')
		return val
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	return [val];
};

if (Array.isArray(mock?.therapy)) {
	mock.therapy = mock.therapy.map((row) => ({
		...row,
		metastasisResection: _toArray(row.metastasisResection)
	}));
}
// --- end normalization ---
const data = {
	diagnosis: mock.diagnosis,
	patient: mock.patient,
	histology: mock.histology,
	therapy: mock.therapy,
	consultation: mock.consultation,
	progress: mock.progress,
	metastasis: mock.metastasis,
	status: mock.status,
	singleRadiation: mock.singleRadiation,
	diagnostic: mock.diagnostic,
	supplementary: mock.supplementary,
	molecularMarker: mock.molecularMarker,
	tnm: mock.tnm,
	study: mock.study,
	kaplanMeier: mock.kaplanMeier,
	bioMaterial: mock.bioMaterial,
	tumorBoard: mock.tumorBoard
};
const dataCollectionNames = Object.keys(data);

let lookupIndexes = {
	patientByPatID: new Map(),
	diagnosisByTumorID: new Map(),
	tumorIDsByPatID: new Map(),
	histologyByTumorID: new Map(),
	therapyByTumorID: new Map(),
	consultationByTumorID: new Map(),
	diagnosticByTumorID: new Map(),
	tumorBoardByTumorID: new Map(),
	progressByTumorID: new Map(),
	metastasisByTumorID: new Map(),
	statusByTumorID: new Map(),
	singleRadiationByTherapyID: new Map()
};

const groupByKey = (entries, keyName) => {
	const grouped = new Map();
	for (const entry of entries) {
		const key = entry?.[keyName];
		let group = grouped.get(key);
		if (!group) {
			group = [];
			grouped.set(key, group);
		}
		group.push(entry);
	}
	return grouped;
};

const buildLookupIndexes = () => {
	const startedAt = performance.now();
	const patientByPatID = new Map();
	const diagnosisByTumorID = new Map();
	const tumorIDsByPatID = new Map();

	for (const patient of data.patient) {
		if (!patientByPatID.has(patient.patID)) {
			patientByPatID.set(patient.patID, patient);
		}
	}

	for (const diagnosis of data.diagnosis) {
		if (!diagnosisByTumorID.has(diagnosis.tumorID)) {
			diagnosisByTumorID.set(diagnosis.tumorID, diagnosis);
		}

		let tumorIDs = tumorIDsByPatID.get(diagnosis.patID);
		if (!tumorIDs) {
			tumorIDs = [];
			tumorIDsByPatID.set(diagnosis.patID, tumorIDs);
		}
		tumorIDs.push(diagnosis.tumorID);
	}

	const histologyByTumorID = groupByKey(data.histology, 'tumorID');
	const therapyByTumorID = groupByKey(data.therapy, 'tumorID');
	const consultationByTumorID = groupByKey(data.consultation, 'tumorID');
	const diagnosticByTumorID = groupByKey(data.diagnostic, 'tumorID');
	const tumorBoardByTumorID = groupByKey(data.tumorBoard, 'tumorID');
	const progressByTumorID = groupByKey(data.progress, 'tumorID');
	const metastasisByTumorID = groupByKey(data.metastasis, 'tumorID');
	const statusByTumorID = groupByKey(data.status, 'tumorID');
	const singleRadiationByTherapyID = groupByKey(data.singleRadiation, 'therapyID');

	lookupIndexes = {
		patientByPatID,
		diagnosisByTumorID,
		tumorIDsByPatID,
		histologyByTumorID,
		therapyByTumorID,
		consultationByTumorID,
		diagnosticByTumorID,
		tumorBoardByTumorID,
		progressByTumorID,
		metastasisByTumorID,
		statusByTumorID,
		singleRadiationByTherapyID
	};
	addTiming('lookup-map-construction:core', startedAt, {
		patients: patientByPatID.size,
		diagnoses: diagnosisByTumorID.size,
		patientsWithTumors: tumorIDsByPatID.size,
		histologyTumors: histologyByTumorID.size,
		therapyTumors: therapyByTumorID.size,
		progressTumors: progressByTumorID.size,
		statusTumors: statusByTumorID.size,
		radiationTherapies: singleRadiationByTherapyID.size
	});
};

const rebuildDiagnosisLookupIndexes = () => {
	const startedAt = performance.now();
	const diagnosisByTumorID = new Map();
	const tumorIDsByPatID = new Map();

	for (const diagnosis of data.diagnosis) {
		if (!diagnosisByTumorID.has(diagnosis.tumorID)) {
			diagnosisByTumorID.set(diagnosis.tumorID, diagnosis);
		}

		let tumorIDs = tumorIDsByPatID.get(diagnosis.patID);
		if (!tumorIDs) {
			tumorIDs = [];
			tumorIDsByPatID.set(diagnosis.patID, tumorIDs);
		}
		tumorIDs.push(diagnosis.tumorID);
	}

	lookupIndexes.diagnosisByTumorID = diagnosisByTumorID;
	lookupIndexes.tumorIDsByPatID = tumorIDsByPatID;
	addTiming('lookup-map-rebuild:diagnosis', startedAt, {
		diagnoses: diagnosisByTumorID.size,
		patientsWithTumors: tumorIDsByPatID.size
	});
};

let odb = null;
const parseStartedAt = performance.now();
const inputPath = './Preprocessing/omock.json';
async function loadInputData() {
	startProgressStep('reading input file');
	const parsed = JSON.parse(await readFile(inputPath, { encoding: 'utf8' }));
	let loadedCollections = 0;
	for (const collectionName of dataCollectionNames) {
		const values = parsed?.[collectionName];
		if (!Array.isArray(values)) continue;
		if (values.length > 0) {
			logSafe(values.length, collectionName);
		}
		data[collectionName] = values;
		loadedCollections += 1;
		updateProgressStep(loadedCollections, dataCollectionNames.length);
	}
	finishProgressStep('input loaded');
}

const deleteCollections = async (cols2delete) => {
	if (cols2delete.length === 0) return;
	const delitions = cols2delete.map((it) => odb.collection(it).drop());
	const res = await Promise.all(delitions);
};

function genPat(it) {
	if (isDeceased(it.vitalState)) it.deathDate = it.vitalDate;
	const postCodeInt = parseInt(it.postalCode, 10);
	const dist = plz[it.postalCode];
	const country = ccode[it.countryCode];
	if (dist) it.district = dist;
	if (country) it.countryName = country;
	const province = provinceByPostalCode.get(postCodeInt);
	const county = countyByPostalCode.get(postCodeInt);
	if (province) it.state = province;
	if (county) it.county = county;
	it.tumorID = lookupIndexes.tumorIDsByPatID.get(it.patID) ?? [];
	return it;
}

function genDiag(it, addin) {
	let ICD = {};
	ICD.ICD10 = it.ICD_ICD10 || '';
	ICD.ICD10Text = it.ICD_ICD10Text || '';
	ICD.ICD10_3 = ICD.ICD10.substring(0, 3);
	let icdtxt = ICD10[ICD.ICD10_3];
	ICD.ICD10_3Text = icdtxt?.text3 || '';
	ICD.ICD10Group = icdtxt?.codegroup || '';
	ICD.ICD10GroupText = icdtxt?.textgroup || '';

	let ICDO = [];
	ICDO.push({
		histologyCode: it.ICDO_histologyCode,
		histologyCodeText: it.ICDO_histologyCodeText,
		histologyDate: it.ICDO_histologyDate ? sanitizeDate(it.ICDO_histologyDate) : null,
		localizationCode: it.ICDO_localizationCode,
		localizationCodeText: it.ICDO_localizationCodeText,
		mixedTumor: false,
		source: 'diagnosis'
	});

	it.ICD = ICD;
	it.ICDO = ICDO.sort((a, b) => a.histologyDate - b.histologyDate);

	it.rareCancer = isRareCancerDiagnosis(it.ICD.ICD10, it.ICDO);

	const sclcHistologyCodes = ['8041', '8042', '8043', '8044', '8045'];
	if (it.ICD.ICD10.startsWith('C34'))
		it.sclc = it.ICDO.some((h) =>
			sclcHistologyCodes.some((code) => h.histologyCode?.includes(code))
		)
			? 'sclc'
			: 'nsclc';
	else it.sclc = null;

	it.isTumor = true;

	delete it.ICD_ICD10;
	delete it.ICD_ICD10Text;
	delete it.ICDO_histologyCode;
	delete it.ICDO_histologyCodeText;
	delete it.ICDO_localizationCode;
	delete it.ICDO_localizationCodeText;
	delete it.ICDO_histologyDate;
	return addin(it);
}

function genThpy(it, addin) {
	it.substance = it.substance?.split('$').map((sbst) => {
		let [substance, ATCCode] = sbst.split('§');
		return { substance, ATCCode };
	});
	it.complication = it.complication?.split('$').map((cmpl) => {
		let [complication, grade, code, category] = cmpl.split('§');
		return { complication, grade, code, category };
	});
	it.ops = it.ops?.split('$').map((o) => {
		let [code, text] = o.split('§');
		let ops4 = code.substring(0, 4);
		return { code, text, ops4 };
	});

	return addin(it);
}

function genPrgr(it, addin) {
	const oa = it.overallAssessment;
	return {
		...it,
		...addin(it),
		overallAssessment: matchesNormalizedPrefix(oa, config.rezidiv.prefixesNormalized)
			? config.rezidiv.canonical
			: oa
	};
}

function genTNM(it) {
	it.T =
		it.T == null || it.T === '' || it.T === undefined ? '-' : extractNumberOrCategory(it.T, false);
	it.N =
		it.N == null || it.N === '' || it.N === undefined ? '-' : extractNumberOrCategory(it.N, false);
	it.M =
		it.M == null || it.M === '' || it.M === undefined ? '-' : extractNumberOrCategory(it.M, false);

	it.TGroup = extractNumberOrCategory(it.T, true);
	it.NGroup = extractNumberOrCategory(it.N, true);
	it.MGroup = extractNumberOrCategory(it.M, true);
	return it;
}

function extractNumberOrCategory(value, group) {
	if (
		value == null ||
		value === undefined ||
		value === '' ||
		(typeof value === 'string' && value.trim() === '')
	) {
		return '-';
	}
	if (/^x$/i.test(value)) return 'X';
	if (group) {
		if (typeof value === 'string') {
			const match = value.match(/^(\d+)/);
			if (match) return match[1];
		}
	}
	return value;
}

const insdia = (it) => {
	let { patID, diagnosisDate } = lookupIndexes.diagnosisByTumorID.get(it.tumorID) || {};

	if (!diagnosisDate) {
		return { patID, diagnosisDate };
	}

	const d1 = new Date(diagnosisDate);
	if (isNaN(d1)) {
		return { patID, diagnosisDate };
	}

	let result = { patID, diagnosisDate };

	Object.keys(it).forEach((key) => {
		if (key.endsWith('OccurrenceDate') && it[key]) {
			const d2 = new Date(it[key]);
			if (!isNaN(d2)) {
				const diffMs = d2 - d1;
				const daysSinceDiagnosis = Math.floor(diffMs / (1000 * 60 * 60 * 24));

				const prefix = key.replace(/OccurrenceDate$/, '');
				const newKey = `${prefix}DaysSinceDiagnosis`;
				result[newKey] = daysSinceDiagnosis;
			}
		}
	});

	return result;
};

const isDiffLess3Month = ({ startDate, endDate }) => {
	const s = sanitizeDate(startDate);
	const e = sanitizeDate(endDate);
	if (!s || !e) return false;
	const millis = e - s;
	const millissecondsInMonth = 1000 * 60 * 60 * 24 * 30.41667;
	const monthsSinceMetaststasis = Math.round(millis / millissecondsInMonth);
	return monthsSinceMetaststasis < 3;
};

const isRezidiv = (progress) => {
	if (!progress) return false;

	// Rule-based detection (preferred). Falls rules fehlen, greifen legacy-Checks.
	const rules = config?.rules?.rezidiv;

	// 4) Biochemical recurrence flag -> Rezidiv
	if (
		rules?.biochemRecurrence &&
		matchesNormalizedRule(progress.biochemRecurrence, rules.biochemRecurrence)
	) {
		return true;
	}
	if (progress.biochemRecurrence === 'Ja') return true; // legacy fallback

	// 1) Gesamtbeurteilung / overallAssessment
	if (
		rules?.overallAssessment &&
		matchesNormalizedRule(progress.overallAssessment, rules.overallAssessment)
	) {
		return true;
	}

	// 2) Tumorstatus / tumorState
	if (rules?.tumorState && matchesNormalizedRule(progress.tumorState, rules.tumorState)) {
		return true;
	}

	// 3) Lymphknotenstatus / lymphNodeState
	if (
		rules?.lymphNodeState &&
		matchesNormalizedRule(progress.lymphNodeState, rules.lymphNodeState)
	) {
		return true;
	}

	// Legacy fallback (old behavior)
	if (matchesNormalizedPrefix(progress.overallAssessment, config.rezidiv.prefixesNormalized)) {
		if (matchesNormalizedPrefix(progress.tumorState, config.rezidiv.prefixesNormalized))
			return true;
		if (matchesNormalizedSet(progress.lymphNodeState, config.rezidiv.lymphStatesNormalized))
			return true;

		// Important: UI definition expects overallAssessment to be sufficient.
		return true;
	}

	return false;
};

// Alte metatype-Funktion bleibt für per-Event-Tagging (wird beim Schreiben der metastasis-Collection benutzt)
const metatype = ({ startDate, endDate }) =>
	isDiffLess3Month({ startDate, endDate }) ? 'synchron' : 'metachron';

// (Wird im Diagnosis-Block nicht mehr verwendet, bleibt jedoch für evtl. andere Stellen verfügbar)
const metatypePro = ({ hasMetastasis, progress, metastasis }) => {
	let synchron = false,
		metachron = false;
	if (hasMetastasis) synchron = true;
	if (metastasis.some((it) => it.type === 'metachron')) metachron = true;
	if (metastasis.some((it) => it.type === 'synchron')) synchron = true;
	if (progress.some((it) => it.type === 'metachron')) metachron = true;
	if (progress.some((it) => it.type === 'synchron')) synchron = true;

	if (synchron && metachron) return 'both';
	if (metachron) return 'metachron';
	if (synchron) return 'synchron';
	return null;
};

function deserializeDate(it) {
	if (!it) return it;
	for (const key in it) {
		const value = it[key];
		if (!key.endsWith('Date') || value == null) continue;
		if (Array.isArray(value)) {
			// Arrays von Datumsstrings/Date-Objekten: einzeln sanitisieren, Ungültiges rausfiltern
			it[key] = value.map(sanitizeDate).filter(Boolean);
		} else {
			// Einzelwert wie bisher
			it[key] = sanitizeDate(value);
		}
	}
	return it;
}

function fixDateString(it) {
	const [d, m, y] = it.split('.');
	return [y, m, d].join('-');
}

function genFollowUp(patient, progress, therapy, diagnosis) {
	// Index once so the per-diagnosis loop stays O(1) per lookup.
	const patientByPatID = new Map(patient.map((p) => [p.patID, p]));

	const therapyByTumorID = new Map();
	for (const th of therapy) {
		const key = th.tumorID;
		let entry = therapyByTumorID.get(key);
		if (!entry) {
			entry = { therapyStartDate: [], therapyEndDate: [] };
			therapyByTumorID.set(key, entry);
		}
		if (th.therapyOccurrenceDate) entry.therapyStartDate.push(th.therapyOccurrenceDate);
		if (th.therapyEndDate) entry.therapyEndDate.push(th.therapyEndDate);
	}

	const progressByTumorID = new Map();
	for (const pr of progress) {
		const key = pr.tumorID;
		let arr = progressByTumorID.get(key);
		if (!arr) {
			arr = [];
			progressByTumorID.set(key, arr);
		}
		if (pr.progressOccurrenceDate) arr.push(pr.progressOccurrenceDate);
	}

	return diagnosis.map((it) => {
		const { deathDate, vitalDate } = patientByPatID.get(it.patID) ?? {};
		const th = therapyByTumorID.get(it.tumorID) ?? { therapyStartDate: [], therapyEndDate: [] };
		const progressDate = progressByTumorID.get(it.tumorID) ?? [];
		return {
			diagnosisDate: it.diagnosisDate,
			vitalDate,
			deathDate,
			patID: it.patID,
			tumorID: it.tumorID,
			therapyStartDate: th.therapyStartDate,
			therapyEndDate: th.therapyEndDate,
			progressDate
		};
	});
}

function genKaplanMeier(diagnosis, patient, pprogress, mmetastasis, tnm, therapy) {
	// Build indices once to avoid O(n*m) filters/finds inside the diagnosis loop.
	const patientByPatID = new Map(patient.map((p) => [p.patID, p]));

	const diagnosesByPatID = new Map();
	for (const d of diagnosis) {
		let arr = diagnosesByPatID.get(d.patID);
		if (!arr) {
			arr = [];
			diagnosesByPatID.set(d.patID, arr);
		}
		arr.push(d);
	}
	for (const arr of diagnosesByPatID.values())
		arr.sort((a, b) => a.diagnosisDate - b.diagnosisDate);

	const progressByTumorID = new Map();
	for (const pr of pprogress) {
		let arr = progressByTumorID.get(pr.tumorID);
		if (!arr) {
			arr = [];
			progressByTumorID.set(pr.tumorID, arr);
		}
		arr.push(pr);
	}
	for (const arr of progressByTumorID.values())
		arr.sort((a, b) => {
			const da = sanitizeDate(a.progressOccurrenceDate);
			const db = sanitizeDate(b.progressOccurrenceDate);
			if (!da && !db) return 0;
			if (!da) return 1;
			if (!db) return -1;
			return da - db;
		});

	const metastasisDatesByTumorID = new Map();
	for (const mt of mmetastasis) {
		const key = mt.tumorID;
		let arr = metastasisDatesByTumorID.get(key);
		if (!arr) {
			arr = [];
			metastasisDatesByTumorID.set(key, arr);
		}
		const d = sanitizeDate(mt.metastasisDate || mt.occurrenceDate);
		if (d) arr.push(d);
	}
	for (const arr of metastasisDatesByTumorID.values()) arr.sort((a, b) => a - b);
	// Ergänzung gemäß +page Definition (metastasenfreies Überleben):
	// Zusätzlich zu mmetastasis zählen wir Metastasen aus Verlaufsdaten (pprogress),
	// aber NUR wenn das Feld "F-Metastasen" (metastasisState) mit einem erlaubten Prefix beginnt (z.B. "Neu", "Rezidiv").
	for (const pr of pprogress) {
		if (
			config?.rules?.metastasisFromProgress
				? !matchesNormalizedRule(pr.metastasisState, config.rules.metastasisFromProgress)
				: !matchesNormalizedPrefix(pr.metastasisState, config.metastasis.prefixesNormalized)
		)
			continue;
		const d = sanitizeDate(pr.progressOccurrenceDate);
		if (!d) continue;
		const key = pr.tumorID;
		let arr = metastasisDatesByTumorID.get(key);
		if (!arr) {
			arr = [];
			metastasisDatesByTumorID.set(key, arr);
		}
		arr.push(d);
	}
	// Nach Ergänzung erneut sortieren (pro tumorID)
	for (const arr of metastasisDatesByTumorID.values()) arr.sort((a, b) => a - b);

	const progressDatesByTumorID = new Map();
	for (const pr of pprogress) {
		const key = pr.tumorID;
		let arr = progressDatesByTumorID.get(key);
		if (!arr) {
			arr = [];
			progressDatesByTumorID.set(key, arr);
		}
		const d = sanitizeDate(pr.progressOccurrenceDate);
		if (d) arr.push(d);
	}
	for (const arr of progressDatesByTumorID.values()) arr.sort((a, b) => a - b);

	const tnmByTumorID = new Map();
	for (const t of tnm) {
		let arr = tnmByTumorID.get(t.tumorID);
		if (!arr) {
			arr = [];
			tnmByTumorID.set(t.tumorID, arr);
		}
		arr.push(t);
	}

	const therapyByTumorID = new Map();
	for (const th of therapy) {
		let arr = therapyByTumorID.get(th.tumorID);
		if (!arr) {
			arr = [];
			therapyByTumorID.set(th.tumorID, arr);
		}
		arr.push(th);
	}

	let vitalDate, vitalState, patID, gender;
	let tumorState, lymphNodeState, overallAssessment;
	let itrCount = 0;
	let dp = diagnosis.map((it) => {
		let fpr = [];
		({ vitalDate, vitalState, patID, gender } = patientByPatID.get(it.patID) || {});
		let recurrence = 2,
			metastasis = 0,
			progress = 0,
			progressDeath = 0;
		let recurrenceDate = null,
			firstMetastasisDate = vitalDate,
			firstProgressDate = null,
			firstProgressDeathDate = vitalDate;
		const tnmArr = tnmByTumorID.get(it.tumorID) ?? [];
		const progressArr = progressByTumorID.get(it.tumorID) ?? [];

		let trc = tnmArr.filter(
			(tit) =>
				tit.RClass === 'R0' &&
				isDiffLess3Month({ startDate: it.diagnosisDate, endDate: tit.tnmOccurrenceDate })
		);
		if (trc.length > 0) fpr = progressByTumorID.get(trc[0].tumorID) ?? [];

		let fprLength = fpr.length;
		if (fprLength > 0) {
			recurrence = 0;
			recurrenceDate = vitalDate;
		}
		for (let i = 0; i < fprLength; ++i) {
			if (
				isRezidiv(fpr[i]) &&
				!isDiffLess3Month({ startDate: it.diagnosisDate, endDate: fpr[i].progressOccurrenceDate })
			) {
				recurrence = 1;
				recurrenceDate = fpr[i].progressOccurrenceDate;
				break;
			}
		}

		// --- Metastasen (KM): NUR aus Metastasen-Events (mmetastasis), nicht aus Progress ---
		// mtsEvents ist bereits sortiert (sanitized Date objects) pro tumorID.
		const mtsEvents = metastasisDatesByTumorID.get(it.tumorID) ?? [];

		let metaLabelKM = null; // "synchron" | "metachron" | "both" | null
		let firstMetaAny = mtsEvents[0] ?? null;
		let firstMetaMetachron = null;
		if (mtsEvents.length > 0) {
			let hasSyn = false,
				hasMeta = false;
			for (const d of mtsEvents) {
				if (within90Days(it.diagnosisDate, d)) {
					hasSyn = true;
				} else {
					hasMeta = true;
					if (!firstMetaMetachron) firstMetaMetachron = d;
				}
				if (hasSyn && hasMeta) {
					metaLabelKM = 'both';
					break;
				}
			}
			if (!metaLabelKM) metaLabelKM = hasSyn ? 'synchron' : 'metachron';
		}

		// Numerische Kodierung kompatibel:
		// 0 = keine Metastase, 1 = metachron, 2 = synchron/both (soll für MFS ausgeschlossen werden)
		if (!firstMetaAny) {
			metastasis = 0;
			firstMetastasisDate = vitalDate;
		} else {
			if (metaLabelKM === 'metachron') {
				metastasis = 1;
				// Für MFS als Eventdatum die erste metachrone Metastase verwenden
				firstMetastasisDate = firstMetaMetachron ? new Date(firstMetaMetachron) : vitalDate;
			} else {
				metastasis = 2;
				// (wird später in der KM-Abfrage für MFS gefiltert)
				firstMetastasisDate = new Date(firstMetaAny);
			}
		}
		// Event-Flag für metastasenfreies Überleben (MFS):
		// 1 = metachrone Metastase (Ereignis), 0 = zensiert (keine Metastase) oder ausgeschlossen (synchron/both)
		const metastasisEvent = metastasis === 1 ? 1 : 0;

		const allDiagSamePat = diagnosesByPatID.get(it.patID) ?? [];

		// Zweittumor nach Indexdiagnose (competing event):
		// wird NICHT als Progress/Ereignis gezählt, sondern führt (falls vor erstem Event) zur ZENSIERUNG am Diagnosedatum des Zweittumors.
		const d0 = sanitizeDate(it.diagnosisDate);
		const secondPrimary = d0
			? allDiagSamePat.find((d) => {
					const dd = sanitizeDate(d.diagnosisDate);
					return dd && dd > d0;
			  })
			: null;
		const secondPrimaryDate = secondPrimary?.diagnosisDate ?? null;

		// Progress-Kandidaten (inkl. "Rezidiv" laut config), nur ab Diagnosedatum (>=) und mit stabiler Datums-Sortierung
		let overallAssessmentPrgrs = progressArr
			.map((pit) => ({ ...pit, _d: sanitizeDate(pit.progressOccurrenceDate) }))
			.filter(
				(pit) =>
					pit.tumorID === it.tumorID &&
					pit._d &&
					(!d0 || pit._d >= d0) &&
					matchesNormalizedSet(pit.overallAssessment, config.dfs.progressLabelsNormalized)
			)
			.sort((a, b) => a._d - b._d);

		// Kandidaten: Progress oder Tod
		const firstProgressCandidate = overallAssessmentPrgrs[0] ?? null;
		const progressDate = firstProgressCandidate?._d ?? null;
		const progressDateRaw = firstProgressCandidate?.progressOccurrenceDate ?? null;

		const deathDate = isDeceased(vitalState) ? sanitizeDate(vitalDate) : null;

		// Ereignisdatum = min(progressDate, deathDate)
		let eventDate = null;
		let eventDateRaw = null;
		if (progressDate) {
			progress = 1;
			firstProgressDate = progressDateRaw;
			eventDate = progressDate;
			eventDateRaw = progressDateRaw;
		}
		if (deathDate && (!eventDate || deathDate < eventDate)) {
			// Tod vor Progress oder kein Progress
			eventDate = deathDate;
			eventDateRaw = vitalDate;
		}

		// Default: Zensur am letzten Vitaldatum (falls vorhanden)
		progressDeath = 0;
		firstProgressDeathDate = vitalDate;

		if (eventDate) {
			progressDeath = 1;
			firstProgressDeathDate = eventDateRaw;
		}

		// Zweittumor-Zensur: wenn Zweittumor vor (erstem) Event liegt oder es gar kein Event gibt -> zensieren am Zweittumor-Datum
		if (secondPrimaryDate) {
			const sp = sanitizeDate(secondPrimaryDate);
			if (sp && (!eventDate || sp < eventDate)) {
				progressDeath = 0;
				firstProgressDeathDate = secondPrimaryDate;
			}
		}

		let dfsDates = [];
		progressArr
			.filter(
				(pit) =>
					pit.tumorID === it.tumorID &&
					matchesNormalizedSet(pit.overallAssessment, config.dfs.completeRemissionNormalized)
			)
			.forEach((pit) => {
				const d = sanitizeDate(pit.progressOccurrenceDate);
				if (d) dfsDates.push(d);
			});

		tnmArr
			.filter(
				(tit) =>
					matchesNormalizedSet(tit.RClass, config.dfs.rClassSuccessNormalized) &&
					tit.tumorID === it.tumorID
			)
			.forEach((tit) => {
				const d = sanitizeDate(tit.tnmOccurrenceDate);
				if (d) dfsDates.push(d);
			});

		let thrpyRState = [];
		if (dfsDates.length === 0) {
			const thArr = therapyByTumorID.get(it.tumorID) ?? [];
			thrpyRState = thArr
				.filter(
					(tit) =>
						matchesNormalizedSet(tit.localRState, config.dfs.localRStateSuccessNormalized) &&
						it.hasMetastasis === 0 &&
						tit.tumorID === it.tumorID
				)
				.map((tit) => sanitizeDate(tit.therapyOccurrenceDate))
				.filter(Boolean)
				.sort((a, b) => a - b);
		}

		for (const trs of thrpyRState) {
			let pm = progressArr.some(
				(pit) =>
					(config?.rules?.metastasisFromProgress
						? matchesNormalizedRule(pit.metastasisState, config.rules.metastasisFromProgress)
						: matchesFirstToken(pit.metastasisState, config.metastasis.prefixesNormalized)) &&
					pit.progressOccurrenceDate < trs &&
					pit.tumorID === it.tumorID
			);
			// Preserve legacy behavior: this check used a block-bodied `some` callback without
			// returning the predicate, so `mm` was always false while still scanning every row.
			let mm = false;
			if (!mm && !pm) dfsDates.push(trs);
		}
		dfsDates.sort((a, b) => a - b);

		// === UICC (KM) vereinfachte Regel + normiert + gruppiert ===
		const UICCNorm = pickFirstUiccAfterDiagnosis(tnmArr, it.diagnosisDate);
		const UICCGroup = uiccGroupFromNormalized(UICCNorm);
		const UICC = UICCGroup;

		// TStage: erster Eintrag nach Diagnose (>=), mit Typ-Priorität definitive > pathological > clinical.
		// Danach Gruppierung zu "1"/"2"/"3"/"4"/"Sonstige"/"Ohne Eintrag" wie bei UICC.
		const TStageRaw = pickFirstTAfterDiagnosisByPriority(tnmArr, it.diagnosisDate);
		const TStage = tStageGroupFromRaw(TStageRaw);

		const mtp = metaLabelKM;

		updateProgressStep(++itrCount, diagnosis.length);
		// RFS: ensure censor/event date is always available (fallback to vitalDate / diagnosisDate)
		if (!recurrenceDate) recurrenceDate = vitalDate ?? it.diagnosisDate;
		return {
			vitalDate,
			vitalState: isDeceased(vitalState) ? 1 : 0,
			patID,
			tumorID: it.tumorID,
			diagnosisDate: it.diagnosisDate,
			tumorState,
			lymphNodeState,
			overallAssessment,
			gender,
			recurrence,
			recurrenceDate,
			metastasis,
			metastasisEvent,
			firstMetastasisDate,
			progress,
			firstProgressDate,
			progressDeath,
			firstProgressDeathDate,
			dfsDate: dfsDates.at(0),
			UICC,
			UICCNorm,
			UICCGroup,
			TStage,
			metastasisStrat:
				mtp === 'both' || mtp === 'synchron'
					? config.metastasis.stratification.synchron
					: config.metastasis.stratification.none
		};
	});
	return dp;
}

function genStdy(it) {
	it.start = it.start === '00.00.0000' ? null : sanitizeDate(fixDateString(it.start));
	it.firstPatInPlanned =
		it.firstPatInPlanned === '00.00.0000'
			? null
			: sanitizeDate(fixDateString(it.firstPatInPlanned));
	it.studyPatients.forEach((sp) =>
		sp.recruitmentDate === '00.00.0000'
			? (sp.recruitmentDate = null)
			: (sp.recruitmentDate = sanitizeDate(fixDateString(sp.recruitmentDate)))
	);
	if (matchesNormalizedSet(it.phase, config.study.nullPhasesNormalized)) {
		it.phase = null;
	}
	it.tumorID = it.studyPatients.flatMap((sp) => lookupIndexes.tumorIDsByPatID.get(sp.patID) ?? []);
	return it;
}

async function write2mon(genFun, ins, collection, nested) {
	startProgressStep(`writing ${collection}`, ins?.length ?? 0);
	const collectionStartedAt = timingEnabled ? performance.now() : 0;
	const existsCheckStartedAt = timingEnabled ? performance.now() : 0;
	const collectionExists = await odb.listCollections({ name: collection }).hasNext();
	addTiming(`collection:${collection}:existsCheck`, existsCheckStartedAt);
	logSafe(`col ${collection} exists-> ${collectionExists}`);
	if (collectionExists) {
		collectionMetrics.push({ collection, skipped: true, reason: 'exists', insertedCount: 0 });
		addTiming(`collection:${collection}:total`, collectionStartedAt, { skipped: true });
		finishProgressStep(`${collection} skipped`);
		return;
	}

	if (!ins?.length) {
		logSafe(ins, 'write?');
		collectionMetrics.push({ collection, skipped: true, reason: 'empty', insertedCount: 0 });
		addTiming(`collection:${collection}:total`, collectionStartedAt, { skipped: true });
		finishProgressStep(`${collection} empty`);
		return;
	}

	if (!timingEnabled) {
		for (let i = 0, len = ins.length; i < len; ++i) {
			let it = ins[i];
			if (genFun) it = genFun(it, nested);
			else if (nested) it = nested(it);
			it = deserializeDate(it);
			ins[i] = it;
			updateProgressStep(i + 1, len);
		}
		renameProgressStep(`inserting ${collection}`);
		const answer = await odb.collection(collection).insertMany(ins, orderedInsertOptions);
		collectionMetrics.push({ collection, skipped: false, insertedCount: answer.insertedCount });
		logSafe(`${answer.insertedCount} documents were inserted`);
		finishProgressStep(`${collection} inserted`);
		return;
	}

	const transformStartedAt = performance.now();
	let genFunDurationMs = 0;
	let genFunCount = 0;
	let nestedDurationMs = 0;
	let nestedCount = 0;
	let deserializeDateDurationMs = 0;
	for (let i = 0, len = ins.length; i < len; ++i) {
		let it = ins[i];
		if (genFun) {
			const genFunStartedAt = performance.now();
			const timedNested = nested
				? (value) => {
						const nestedStartedAt = performance.now();
						try {
							return nested(value);
						} finally {
							nestedDurationMs += performance.now() - nestedStartedAt;
							nestedCount += 1;
						}
				  }
				: nested;
			it = genFun(it, timedNested);
			genFunDurationMs += performance.now() - genFunStartedAt;
			genFunCount += 1;
		} else if (nested) {
			const nestedStartedAt = performance.now();
			it = nested(it);
			nestedDurationMs += performance.now() - nestedStartedAt;
			nestedCount += 1;
		}
		const deserializeDateStartedAt = performance.now();
		it = deserializeDate(it);
		deserializeDateDurationMs += performance.now() - deserializeDateStartedAt;
		ins[i] = it;
		updateProgressStep(i + 1, len);
	}
	if (genFun) {
		addDurationTiming(`collection:${collection}:genFun`, genFunDurationMs, { count: genFunCount });
	}
	if (nested) {
		addDurationTiming(`collection:${collection}:nested`, nestedDurationMs, { count: nestedCount });
	}
	addDurationTiming(`collection:${collection}:deserializeDate`, deserializeDateDurationMs, {
		count: ins.length
	});
	addTiming(`collection:${collection}:transform`, transformStartedAt, { count: ins.length });
	renameProgressStep(`inserting ${collection}`);
	const insertStartedAt = performance.now();
	const answer = await odb.collection(collection).insertMany(ins, orderedInsertOptions);
	addTiming(`collection:${collection}:insert`, insertStartedAt, { count: answer.insertedCount });
	addTiming(`collection:${collection}:total`, collectionStartedAt, { count: answer.insertedCount });
	collectionMetrics.push({ collection, skipped: false, insertedCount: answer.insertedCount });
	logSafe(`${answer.insertedCount} documents were inserted`);
	finishProgressStep(`${collection} inserted`);
}

const runPreprocessor = async () => {
	await loadInputData();
	addTiming('parse', parseStartedAt);
	startProgressStep('building lookup indexes');
	buildLookupIndexes();
	finishProgressStep('lookup indexes ready');
	logSafe('end reached');
	startProgressStep('connecting to MongoDB');
	odb = await oncdb();
	finishProgressStep('MongoDB connected');
	startProgressStep('cleaning requested collections', argv.slice(2).length);
	await deleteCollections(argv.slice(2));
	finishProgressStep('cleanup complete');
	await write2mon(genPat, data.patient, 'patient');

	// --- DIAGNOSIS: metastasis = "synchron" | "metachron" | "both" | null ---
	await write2mon(genDiag, data.diagnosis, 'diagnosis', (it) => {
		const cloneProfileStartedAt = profilingEnabled ? performance.now() : 0;
		let obj = { ...it };
		addProfileTiming('diagnosis:clone', cloneProfileStartedAt);

		const patientProfileStartedAt = profilingEnabled ? performance.now() : 0;
		const fpa = lookupIndexes.patientByPatID.get(it.patID);
		if (it.diagnosisDate && fpa?.birthDate) {
			const millis = Math.abs(sanitizeDate(it.diagnosisDate) - sanitizeDate(fpa.birthDate));
			let millisecondsInYear = 1000 * 60 * 60 * 24 * 365.2425;
			obj.ageAtDiagnosis = Math.round(millis / millisecondsInYear);
		}
		obj.vitalDate = fpa?.vitalDate;
		obj.vitalState = fpa?.vitalState;
		obj.gender = fpa?.gender;
		addProfileTiming('diagnosis:patient', patientProfileStartedAt);

		const histologyProfileStartedAt = profilingEnabled ? performance.now() : 0;
		const fhi = lookupIndexes.histologyByTumorID.get(it.tumorID) ?? [];
		fhi.forEach((h) => {
			obj.ICDO.push({
				histologyCode: h.ICDO_histologyCode,
				histologyCodeText: h.ICDO_histologyCodeText,
				histologyDate: h.ICDO_histologyDate ? sanitizeDate(h.ICDO_histologyDate) : null,
				grading: h.grading,
				Nb: h.ICDO_Nb,
				Nu: h.ICDO_Nu,
				sNb: h.ICDO_sNb,
				sNu: h.ICDO_sNu,
				source: 'other',
				mixedTumor: false
			});
		});
		applyMixedTumorFlag(obj.ICDO);
		obj.ICDO.sort((a, b) => a.histologyDate - b.histologyDate);
		addProfileTiming('diagnosis:histology', histologyProfileStartedAt, fhi.length);

		const previousTherapyProfileStartedAt = profilingEnabled ? performance.now() : 0;
		const therapies = lookupIndexes.therapyByTumorID.get(it.tumorID) ?? [];
		const previousTherapy = {};
		for (const [flag, valueSet] of previousTherapyEntries) {
			previousTherapy[flag] = therapies.some((th) =>
				matchesNormalizedSet(th?.generalType, valueSet)
			);
		}
		obj.previousTherapy = previousTherapy;
		addProfileTiming(
			'diagnosis:previousTherapy',
			previousTherapyProfileStartedAt,
			therapies.length
		);

		const previousConsultationProfileStartedAt = profilingEnabled ? performance.now() : 0;
		const consultations = lookupIndexes.consultationByTumorID.get(it.tumorID) ?? [];
		const previousConsultation = {};
		for (const [flag, valueSet] of Object.entries(previousConsultationSets)) {
			previousConsultation[flag] = consultations.some((cs) =>
				matchesNormalizedSet(cs?.type, valueSet)
			);
		}
		obj.previousConsultation = previousConsultation;
		addProfileTiming(
			'diagnosis:previousConsultation',
			previousConsultationProfileStartedAt,
			consultations.length
		);

		const previousDiagnosticProfileStartedAt = profilingEnabled ? performance.now() : 0;
		const diagnostics = lookupIndexes.diagnosticByTumorID.get(it.tumorID) ?? [];
		const previousDiagnostic = {};
		for (const [flag, valueSet] of previousDiagnosticEntries) {
			previousDiagnostic[flag] = diagnostics.some((di) => {
				const method = di?.investigationMethod;
				if (method == null) return false;

				const normalizedMethod = normalizeLower(method);
				for (const value of valueSet) {
					if (normalizedMethod.includes(value)) return true;
				}
				return false;
			});
		}
		obj.previousDiagnostic = previousDiagnostic;
		addProfileTiming(
			'diagnosis:previousDiagnostic',
			previousDiagnosticProfileStartedAt,
			diagnostics.length
		);

		const tumorboardProfileStartedAt = profilingEnabled ? performance.now() : 0;
		const boards = lookupIndexes.tumorBoardByTumorID.get(it.tumorID) ?? [];

		obj.previousTumorboard = {
			any: boards.length > 0,
			prae: boards.some((tb) => regexMatches(tumorboardPatterns.prae, tb.type)),
			post: boards.some((tb) => regexMatches(tumorboardPatterns.post, tb.type)),
			mtb: boards.some((tb) => regexMatches(tumorboardPatterns.mtb, tb.type))
		};
		addProfileTiming('diagnosis:tumorboard', tumorboardProfileStartedAt, boards.length);

		const recurrenceProfileStartedAt = profilingEnabled ? performance.now() : 0;
		let fpr = lookupIndexes.progressByTumorID.get(it.tumorID) ?? [];
		obj.recurrence = fpr.some((ps) =>
			matchesNormalizedPrefix(ps?.overallAssessment, config.rezidiv.prefixesNormalized)
		);
		addProfileTiming('diagnosis:recurrence', recurrenceProfileStartedAt, fpr.length);

		// --- NEU: metastasis-Label direkt aus Rohdaten ableiten (inkl. "both") ---
		const metastasisProfileStartedAt = profilingEnabled ? performance.now() : 0;
		const mtsDates = (lookupIndexes.metastasisByTumorID.get(it.tumorID) ?? []).map(
			(m) => m.metastasisDate || m.occurrenceDate
		);

		const prgDates = fpr.map((p) => p.progressOccurrenceDate);

		obj.metastasis = classifyMetastasis(it.diagnosisDate, mtsDates, prgDates);
		addProfileTiming(
			'diagnosis:metastasis',
			metastasisProfileStartedAt,
			mtsDates.length + prgDates.length
		);

		const statusProfileStartedAt = profilingEnabled ? performance.now() : 0;
		const statuses = lookupIndexes.statusByTumorID.get(it.tumorID) ?? [];
		const ecogStatuses = [];
		let distress = false;
		for (const fs of statuses) {
			const normalizedType = normalizeLower(fs.type);
			if (ecogPrefixLower && normalizedType.startsWith(ecogPrefixLower)) ecogStatuses.push(fs);
			if (
				!distress &&
				distressTypeLower &&
				normalizedType === distressTypeLower &&
				matchesNormalizedSet(fs.status, distressPositiveSet)
			) {
				distress = true;
			}
		}
		obj.ECOG = ecogStatuses
			.sort((a, b) => {
				const da = sanitizeDate(a.statusOccurrenceDate);
				const db = sanitizeDate(b.statusOccurrenceDate);
				if (!da && !db) return 0;
				if (!da) return 1;
				if (!db) return -1;
				return da - db;
			})
			.map((f) => f.status);
		obj.distress = distress;
		addProfileTiming('diagnosis:status', statusProfileStartedAt, statuses.length);

		// === OnkoZert-Bewertung ===
		const onkozertProfileStartedAt = profilingEnabled ? performance.now() : 0;
		const onkozertCandidateRules = getOnkozertCandidateRules(obj);
		obj.oz = createOnkozertEntityFlags();
		for (const rule of onkozertCandidateRules) {
			if (!rule?.entity) continue;
			obj.oz[rule.entity] = (obj.oz[rule.entity] ?? false) || matchesOnkozertRule(rule, obj, data);
		}
		addProfileTiming('diagnosis:onkozert', onkozertProfileStartedAt, onkozertCandidateRules.size);

		return obj;
	});
	rebuildDiagnosisLookupIndexes();

	await write2mon(genThpy, data.therapy, 'therapy', (it) => {
		// normalize metastasisResection (string -> array) right where therapies are created
		const _toArray = (val) => {
			if (Array.isArray(val)) return val.filter(Boolean);
			if (val == null) return [];
			if (typeof val === 'string')
				return val
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean);
			return [val];
		};
		it.metastasisResection = _toArray(it.metastasisResection);

		// im Block, wo rads erzeugt wird
		const rads = lookupIndexes.singleRadiationByTherapyID.get(it.therapyID) ?? [];

		for (const ray of rads) {
			let area = (ray.area ?? '').toString().trim().replace(',', '.');
			if (!area) continue;

			// exakte Detailbezeichnung (z.B. "4.7" -> "Rechte Leberhälfte" usw.)
			ray.areaDetailed = areaDetailed[area] ?? null;

			// Gruppierung (z.B. "4.7" -> "4" -> "Abdomen")
			const grp = area.split('.', 1)[0];
			ray.areaGrouped = areaGrouped[grp] ?? null;
			// Zerlegung in Haupt- und Unterbereich (Ziffern vor/nach dem ersten Punkt)
			// Beispiel: "4.7.2" -> supArea="4", subArea="7.2"; "2" -> supArea="2", subArea=null
			const dotIdx = area.indexOf('.');
			ray.supArea = dotIdx >= 0 ? area.slice(0, dotIdx) : area || null;
			ray.subArea = area;
			delete ray.area;

			// Konsistenz: den bereinigten Code zurückschreiben (später im Resolver als Fallback nützlich)
			//ray.area = area;
		}

		it.radiation = rads.length > 0 ? rads : null;

		return {
			...insdia(it),
			...it
		};
	});

	await write2mon(genPrgr, data.progress, 'progress', (it) => insdia(it));
	await write2mon(null, data.diagnostic, 'diagnostic', (it) => ({
		patID: insdia(it)?.patID,
		...it
	}));
	await write2mon(null, data.consultation, 'consultation', (it) => ({ ...insdia(it), ...it }));
	await write2mon(null, data.tumorBoard, 'tumorBoard', (it) => ({ ...insdia(it), ...it }));
	await write2mon(null, data.supplementary, 'supplementary', (it) => ({
		patID: insdia(it)?.patID,
		...it
	}));
	await write2mon(null, data.molecularMarker, 'molecularMarker', (it) => ({
		patID: insdia(it)?.patID,
		...it
	}));
	await write2mon(genTNM, data.tnm, 'tnm');

	// metastasis-Collection: per-Event Typ ("synchron"/"metachron") bleibt erhalten
	await write2mon(null, data.metastasis, 'metastasis', (it) => {
		let { patID, diagnosisDate } = insdia(it);
		let type = metatype({ endDate: it.metastasisDate, startDate: diagnosisDate });
		return { type, patID, ...it };
	});

	await write2mon(null, data.status, 'status', (it) => ({ ...insdia(it), ...it }));
	startProgressStep('generating followUp', data.patient.length);
	const followUpStartedAt = performance.now();
	const followUp = genFollowUp(data.patient, data.progress, data.therapy, data.diagnosis);
	addTiming('generate:followUp', followUpStartedAt, { count: followUp.length });
	finishProgressStep('followUp generated');
	await write2mon(null, followUp, 'followUp');

	// genKaplanMeier: nutzt neue on-the-fly Logik (inkl. "both")
	startProgressStep('generating kaplanMeier', data.diagnosis.length);
	const kaplanMeierStartedAt = performance.now();
	const kaplanMeier = genKaplanMeier(
		data.diagnosis,
		data.patient,
		data.progress,
		data.metastasis,
		data.tnm,
		data.therapy
	);
	addTiming('generate:kaplanMeier', kaplanMeierStartedAt, { count: kaplanMeier.length });
	finishProgressStep('kaplanMeier generated');
	await write2mon(null, kaplanMeier, 'kaplanMeier');

	await write2mon(genStdy, data.study, 'study');
	await write2mon(null, data.bioMaterial, 'bioMaterial');
	startProgressStep('writing metaData', 1);
	const metaDataStartedAt = performance.now();
	await odb.collection('metaData').insertOne({ executedAt: new Date() });
	addTiming('collection:metaData:insert', metaDataStartedAt, { count: 1 });
	collectionMetrics.push({ collection: 'metaData', skipped: false, insertedCount: 1 });
	finishProgressStep('metaData inserted');
	finishProgress();
	process.exit(0);
};

await runPreprocessor();
