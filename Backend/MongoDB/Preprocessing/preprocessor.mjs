import { oncdb } from '../monConnector.js';
import { argv } from 'node:process';

import { plz } from './plz2dist.mjs';
import { areaGrouped, areaDetailed } from './radiationAreaCodes.mjs';
import { ccode } from './countryCode2countryName.mjs';
import { plz2province } from './plz2state.mjs';
import { plz2county } from './plz2county.mjs';
import { ICD10 } from './ICD10.mjs';
import { createReadStream, readlink } from 'node:fs';
import readLine from 'node:readline';
import { rareCancers } from './rareCancers.mjs';
import { ozRules } from './onkozertRules.mjs';
import { config, normalizeLower } from './env-config.mjs';

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

const normalizeHistologyCode = (value) =>
  (value ?? '').toString().trim().toUpperCase();

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
      entries
        .map(entry => normalizeHistologyCode(entry.histologyCode))
        .filter(Boolean)
    );

    if (distinctCodes.size >= 2) {
      entries.forEach(entry => {
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
const previousConsultationSets = mapValuesToSet(config.previousConsultation);
const previousDiagnosticSets = mapValuesToSet(config.previousDiagnostic);
const tumorboardPatterns = config.tumorboard?.patterns ?? {};
const ecogPrefixLower = config.status?.ecogPrefixLower ?? '';
const distressTypeLower = config.status?.distressTypeLower ?? '';
const distressPositiveSet = config.status?.distressPositiveNormalized ?? new Set();

const regexMatches = (regex, value) => (regex instanceof RegExp ? regex.test(value ?? '') : false);

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
	const all = [...metastasisDates, ...progressDates].map(sanitizeDate).filter(Boolean);
	if (all.length === 0 || !diagnosisDate) return null;

	let hasSyn = false,
		hasMeta = false;
	for (const d of all) {
		if (within90Days(diagnosisDate, d)) hasSyn = true;
		else hasMeta = true;
		if (hasSyn && hasMeta) return 'both';
	}
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

let odb = null;
const stream = createReadStream('./Preprocessing/omock.json', { encoding: 'utf8' });
const reader = readLine.createInterface({ input: stream, crlfDelay: Infinity });
let inobj = 0;
let collection = '',
	entries = [],
	sobj = null;

reader.on('line', (line) => {
	let [key, value] = line.split(':', 2).map((it) => it.trim());
	if (collection !== '' && value) {
		sobj ??= '{';
		sobj += line;
	}
	if (/},?$/.test(key) && sobj) {
		sobj += '}';
		if (inobj < 2) {
			entries.push(JSON.parse(sobj));
			sobj = null;
		}
		if (inobj > 1 && key.length === 2) {
			sobj += ',';
		}
	}
	if (line.endsWith('{') && sobj) sobj += '{';
	if (line.endsWith('[')) {
		++inobj;
		if (inobj === 1) {
			collection = key.slice(1, -1);
			console.log(collection, 'read-col');
		}
	}
	if (key.endsWith('],')) {
		if (entries.length > 0) {
			console.log(entries.length, collection);
			data[collection] = entries;
		}
		inobj = 0;
		collection = '';
		sobj = null;
		entries = [];
	}
	if (key.endsWith(']')) {
		if (inobj > 1 && sobj) sobj += ']';
		--inobj;
		if (entries.length > 0) {
			process.stdout.write(`${entries.length} ${collection} \r`);
			data[collection] = entries;
		}
	}
});

const deleteCollections = async (cols2delete) => {
	if (cols2delete.length === 0) return;
	const delitions = cols2delete.map((it) => odb.collection(it).drop());
	const res = await Promise.all(delitions);
	console.dir(res, { depth: null });
};

function genPat(it) {
	if (isDeceased(it.vitalState)) it.deathDate = it.vitalDate;
	const postCodeInt = parseInt(it.postalCode);
	const dist = plz[it.postalCode];
	const country = ccode[it.countryCode];
	if (dist) it.district = dist;
	if (country) it.countryName = country;
	const province = plz2province.find(
		(pr) => postCodeInt >= pr.from && postCodeInt <= pr.to
	)?.province;
	const county = plz2county.find((pr) => postCodeInt >= pr.from && postCodeInt <= pr.to)?.county;
	if (province) it.state = province;
	if (county) it.county = county;
	it.tumorID = data.diagnosis.filter((dit) => dit.patID === it.patID).map((dit) => dit.tumorID);
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

	it.rareCancer = rareCancers.some(
		(rc) =>
			rc.diagnosis === it.ICD.ICD10 && it.ICDO.some((h) => h.histologyCode?.includes(rc.histology))
	);

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
	let { patID, diagnosisDate } = data.diagnosis.find((dia) => dia.tumorID === it.tumorID) || {};

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
	for (const [key, value] of Object.entries(it)) {
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
				isDiffLess3Month({ startDate: it.diagnosisDate, endDate: tit.tnmOccurrenceDate }) &&
				tit.tumorID === it.tumorID
		);
		if (trc.length > 0)
			fpr = (progressByTumorID.get(trc[0].tumorID) ?? []).toSorted((a, b) => {
				const da = sanitizeDate(a.progressOccurrenceDate);
				const db = sanitizeDate(b.progressOccurrenceDate);
				if (!da && !db) return 0;
				if (!da) return 1;
				if (!db) return -1;
				return da - db;
			});

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
			let pm = pprogress.some(
				(pit) =>
					(config?.rules?.metastasisFromProgress
						? matchesNormalizedRule(pit.metastasisState, config.rules.metastasisFromProgress)
						: matchesFirstToken(pit.metastasisState, config.metastasis.prefixesNormalized)) &&
					pit.progressOccurrenceDate < trs &&
					pit.tumorID === it.tumorID
			);
			let mm = mmetastasis.some((mit) => {
				matchesNormalizedSet(mit.spread, config.metastasis.spreadValuesNormalized) &&
					mit.metastasisDate < trs && //<= TODO <= MetastasisDate?  mit.occurrenceDate
					mit.tumorID === it.tumorID;
			});
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

		process.stdout.write(`in genKP ${++itrCount} \r`);
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
	it.tumorID = it.studyPatients.flatMap((sp) =>
		data.diagnosis.filter((dit) => dit.patID === sp.patID).map((dit) => dit.tumorID)
	);
	return it;
}

async function write2mon(genFun, ins, collection, nested) {
	const collectionExists = await odb.listCollections({ name: collection }).hasNext();
	console.log(`col ${collection} exists-> ${collectionExists}`);
	if (collectionExists) return;

	if (!ins?.length) {
		console.log(ins, 'write?');
		return;
	}

	for (let i = 0, len = ins.length; i < len; ++i) {
		let it = ins[i];
		if (genFun) it = genFun(it, nested);
		else if (nested) it = nested(it);
		it = deserializeDate(it);
		ins[i] = it;
		process.stdout.write(`-- ${i} of ${len} --\r`);
	}
	const answer = await odb.collection(collection).insertMany(ins);
	console.log(`${answer.insertedCount} documents were inserted`);
}

reader.on('close', async () => {
	console.log('end reached');
	odb = await oncdb();
	await deleteCollections(argv.slice(2));
	console.log(data.diagnosis.at(0), 'diag');

	await write2mon(genPat, data.patient, 'patient');

	// --- DIAGNOSIS: metastasis = "synchron" | "metachron" | "both" | null ---
	await write2mon(genDiag, data.diagnosis, 'diagnosis', (it) => {
		let obj = { ...it };
		const fpa = data.patient.find((pat) => pat.patID === it.patID);
		if (it.diagnosisDate && fpa?.birthDate) {
			const millis = Math.abs(sanitizeDate(it.diagnosisDate) - sanitizeDate(fpa.birthDate));
			let millisecondsInYear = 1000 * 60 * 60 * 24 * 365.2425;
			obj.ageAtDiagnosis = Math.round(millis / millisecondsInYear);
		}
		obj.vitalDate = fpa?.vitalDate;
		obj.vitalState = fpa?.vitalState;
		obj.gender = fpa?.gender;

		const fhi = data.histology.filter((his) => his.tumorID === it.tumorID);
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

		const therapies = data.therapy.filter((th) => th.tumorID === it.tumorID);
		const previousTherapy = {};
		for (const [flag, valueSet] of Object.entries(previousTherapySets)) {
			previousTherapy[flag] = therapies.some((th) =>
				matchesNormalizedSet(th?.generalType, valueSet)
			);
		}
		obj.previousTherapy = previousTherapy;

		const consultations = data.consultation.filter((cs) => cs.tumorID === it.tumorID);
		const previousConsultation = {};
		for (const [flag, valueSet] of Object.entries(previousConsultationSets)) {
			previousConsultation[flag] = consultations.some((cs) =>
				matchesNormalizedSet(cs?.type, valueSet)
			);
		}
		obj.previousConsultation = previousConsultation;

		const diagnostics = data.diagnostic.filter((di) => di.tumorID === it.tumorID);
		const previousDiagnostic = {};
		for (const [flag, valueSet] of Object.entries(previousDiagnosticSets)) {
			previousDiagnostic[flag] = diagnostics.some((di) => {
				const method = di?.investigationMethod;
				if (method == null) return false;

				const normalizedMethod = normalizeLower(method);
				return [...valueSet].some((value) => normalizedMethod.includes(value));
			});
		}
		obj.previousDiagnostic = previousDiagnostic;

		const boards = data.tumorBoard.filter((tb) => tb.tumorID === it.tumorID);

		obj.previousTumorboard = {
			any: boards.length > 0,
			prae: boards.some((tb) => regexMatches(tumorboardPatterns.prae, tb.type)),
			post: boards.some((tb) => regexMatches(tumorboardPatterns.post, tb.type)),
			mtb: boards.some((tb) => regexMatches(tumorboardPatterns.mtb, tb.type))
		};

		let fpr = data.progress.filter((ps) => ps.tumorID === it.tumorID);
		obj.recurrence = fpr.some((ps) =>
			matchesNormalizedPrefix(ps?.overallAssessment, config.rezidiv.prefixesNormalized)
		);

		// --- NEU: metastasis-Label direkt aus Rohdaten ableiten (inkl. "both") ---
		const mtsDates = data.metastasis
			.filter((m) => m.tumorID === it.tumorID)
			.map((m) => m.metastasisDate || m.occurrenceDate);

		const prgDates = data.progress
			.filter((p) => p.tumorID === it.tumorID)
			.map((p) => p.progressOccurrenceDate);

		obj.metastasis = classifyMetastasis(it.diagnosisDate, mtsDates, prgDates);

		obj.ECOG = data.status
			.filter(
				(fs) =>
					ecogPrefixLower &&
					normalizeLower(fs.type).startsWith(ecogPrefixLower) &&
					fs.tumorID === it.tumorID
			)
			.sort((a, b) => {
				const da = sanitizeDate(a.statusOccurrenceDate);
				const db = sanitizeDate(b.statusOccurrenceDate);
				if (!da && !db) return 0;
				if (!da) return 1;
				if (!db) return -1;
				return da - db;
			})
			.map((f) => f.status);
		obj.distress = data.status
			.filter(
				(fs) =>
					distressTypeLower &&
					normalizeLower(fs.type) === distressTypeLower &&
					fs.tumorID === it.tumorID
			)
			.some((f) => matchesNormalizedSet(f.status, distressPositiveSet));

		// === OnkoZert-Bewertung ===
		obj.oz = {};
		for (const rule of ozRules ?? []) {
			if (!rule?.entity) continue;
			obj.oz[rule.entity] = (obj.oz[rule.entity] ?? false) || matchesOnkozertRule(rule, obj, data);
		}

		return obj;
	});

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
		const rads = data.singleRadiation.filter((ray) => ray.therapyID === it.therapyID);

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
	await write2mon(
		null,
		genFollowUp(data.patient, data.progress, data.therapy, data.diagnosis),
		'followUp'
	);

	// genKaplanMeier: nutzt neue on-the-fly Logik (inkl. "both")
	await write2mon(
		null,
		genKaplanMeier(
			data.diagnosis,
			data.patient,
			data.progress,
			data.metastasis,
			data.tnm,
			data.therapy
		),
		'kaplanMeier'
	);

	await write2mon(genStdy, data.study, 'study');
	await write2mon(null, data.bioMaterial, 'bioMaterial');
	await odb.collection('metaData').insertOne({ executedAt: new Date() });
	process.exit(0);
});
