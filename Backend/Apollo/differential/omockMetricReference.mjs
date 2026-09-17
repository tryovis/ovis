/**
 * Independent metric oracle over the original, unmodified OMock object.
 *
 * No importer, Mongo, resolver, AST translator or production date/age helper is
 * imported. Selection must also come from a raw-data oracle, never query results.
 *
 * Units deliberately differ: gender/vital state count patient rows; ICD/time/age
 * count diagnosis rows; therapies and progress count event rows. A patient with
 * two selected tumors contributes once to gender and twice to the age chart.
 * Chart buckets retain '' and ' ' and '-'; only missing and null share a bucket.
 * This differs from the broader '-' *filter* convention, intentionally.
 *
 * Age follows OVIS's stated numerical convention (rounded elapsed years of
 * 365.2425 days, absolute difference), not completed birthdays. Invalid/missing
 * dates must never become epoch-based ages. The date oracle rejects impossible
 * calendar dates rather than accepting JavaScript Date rollover.
 */

const DAY_MS = 86_400_000;
const YEAR_MS = DAY_MS * 365.2425;

export const RAW_EVENT_COLLECTIONS = Object.freeze([
	'therapy',
	'progress',
	'histology',
	'diagnostic',
	'tnm',
	'metastasis',
	'consultation',
	'tumorBoard',
	'supplementary',
	'molecularMarker',
	'status',
	'bioMaterial'
]);

/**
 * Supported source formats are YYYY-MM-DD, ISO instants and DD.MM.YYYY.
 * Legacy unpadded yyyy-m-d is intentionally importer-only compatibility;
 * clinicalDates.test.mjs checks that accepted form separately across timezones.
 */
export function rawOmockDate(value) {
	if (value == null || value === '' || value === '-' || value === ' ') return null;
	if (value instanceof Date) {
		return Number.isFinite(value.getTime()) && value.getUTCFullYear() >= 1900
			? new Date(value.getTime())
			: null;
	}
	if (typeof value !== 'string') return null;
	const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
	const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.+)?$/.exec(value);
	if (!german && !iso) return null;
	const [year, month, day] = german
		? [Number(german[3]), Number(german[2]), Number(german[1])]
		: [Number(iso[1]), Number(iso[2]), Number(iso[3])];
	if (year < 1900 || month < 1 || month > 12 || day < 1) return null;
	const calendarDate = new Date(Date.UTC(year, month - 1, day));
	if (
		calendarDate.getUTCFullYear() !== year ||
		calendarDate.getUTCMonth() !== month - 1 ||
		calendarDate.getUTCDate() !== day
	)
		return null;
	const result = german || value.length === 10 ? calendarDate : new Date(value);
	return Number.isFinite(result.getTime()) && result.getUTCFullYear() >= 1900 ? result : null;
}

export function rawAgeAtDiagnosis(diagnosisDate, birthDate) {
	const diagnosis = rawOmockDate(diagnosisDate);
	const birth = rawOmockDate(birthDate);
	if (!diagnosis || !birth) return null;
	return Math.round(Math.abs(diagnosis.getTime() - birth.getTime()) / YEAR_MS);
}

const bucketValue = (value) => (value == null ? null : value);
const compare = (a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en');

/** Stable tuples avoid JSON object-key coercion of null, '', numbers and booleans. */
export function metricHistogram(values) {
	const counts = new Map();
	for (const rawValue of values) {
		const value = bucketValue(rawValue);
		const signature = JSON.stringify(value);
		const entry = counts.get(signature) ?? { value, count: 0 };
		entry.count++;
		counts.set(signature, entry);
	}
	return [...counts.values()].sort((a, b) => compare(a.value, b.value));
}

function ageSummary(ages, total) {
	const sorted = ages.filter((age) => age != null).sort((a, b) => a - b);
	const midpoint = Math.floor(sorted.length / 2);
	return {
		known: sorted.length,
		missing: total - sorted.length,
		minimum: sorted.at(0) ?? null,
		maximum: sorted.at(-1) ?? null,
		mean: sorted.length ? sorted.reduce((sum, age) => sum + age, 0) / sorted.length : null,
		median: sorted.length
			? sorted.length % 2
				? sorted[midpoint]
				: (sorted[midpoint - 1] + sorted[midpoint]) / 2
			: null
	};
}

/**
 * tumorIds omitted => all raw rows, including patients without diagnoses.
 * tumorIds=[] => empty cohort. For a tumor lock patients are deduplicated by ID.
 * patientIds optionally narrows patient charts explicitly.
 * includeRow(collection, rawRow, sourceIndex) supports local event predicates:
 * e.g. therapy=operation counts only matching events, not all events of tumors
 * which happen to have an operation. The callback must evaluate raw data.
 */
export function calculateRawOmockMetrics(
	raw,
	{ tumorIds, patientIds, includeRow = () => true } = {}
) {
	const allowedTumors = tumorIds == null ? null : new Set(tumorIds);
	const allPatients = Array.isArray(raw.patient) ? raw.patient : [];
	const allDiagnoses = Array.isArray(raw.diagnosis) ? raw.diagnosis : [];
	const patientById = new Map(allPatients.map((row) => [row.patID, row]));
	const tumorAllowed = (row) => !allowedTumors || allowedTumors.has(row.tumorID);
	const diagnoses = allDiagnoses.filter(
		(row, index) => tumorAllowed(row) && includeRow('diagnosis', row, index)
	);
	const scopedPatientIds =
		patientIds != null
			? new Set(patientIds)
			: allowedTumors
			? new Set(diagnoses.map((row) => row.patID))
			: null;
	const patients = allPatients.filter(
		(row, index) =>
			(!scopedPatientIds || scopedPatientIds.has(row.patID)) && includeRow('patient', row, index)
	);
	const events = Object.fromEntries(
		RAW_EVENT_COLLECTIONS.map((name) => [
			name,
			(raw[name] ?? []).filter((row, index) => tumorAllowed(row) && includeRow(name, row, index))
		])
	);
	const counts = {
		patient: patients.length,
		diagnosis: diagnoses.length,
		...Object.fromEntries(Object.entries(events).map(([name, rows]) => [name, rows.length]))
	};
	// Radiation is a component count in the overview. A radiation therapy with no
	// components still contributes one, matching the chart's declared unit.
	const radiationByTherapy = new Map();
	for (const component of raw.singleRadiation ?? []) {
		radiationByTherapy.set(
			component.therapyID,
			(radiationByTherapy.get(component.therapyID) ?? 0) + 1
		);
	}
	counts.operation = events.therapy.filter((row) => row.generalType === 'operation').length;
	counts.systemic = events.therapy.filter((row) => row.generalType === 'systemic').length;
	counts.radiation = events.therapy
		.filter((row) => row.generalType === 'radiation')
		.reduce((sum, row) => sum + Math.max(1, radiationByTherapy.get(row.therapyID) ?? 0), 0);

	const ages = diagnoses.map((row) =>
		rawAgeAtDiagnosis(row.diagnosisDate, patientById.get(row.patID)?.birthDate)
	);
	const diagnosisObservations = diagnoses.map((row) => {
		const date = rawOmockDate(row.diagnosisDate);
		const patient = patientById.get(row.patID);
		return {
			icd3: typeof row.ICD_ICD10 === 'string' ? row.ICD_ICD10.slice(0, 3) : '',
			year: date ? String(date.getUTCFullYear()) : null,
			gender: bucketValue(patient?.gender)
		};
	});
	return {
		counts,
		patientGender: metricHistogram(patients.map((row) => row.gender)),
		patientVitalState: metricHistogram(patients.map((row) => row.vitalState)),
		diagnosisIcd3: metricHistogram(diagnosisObservations.map((row) => row.icd3)),
		diagnosisYear: metricHistogram(diagnosisObservations.map((row) => row.year)),
		diagnosisIcd3YearGender: metricHistogram(
			diagnosisObservations.map(({ icd3, year, gender }) => [icd3, year, gender])
		),
		diagnosisAge: metricHistogram(ages.filter((age) => age != null)),
		ageSummary: ageSummary(ages, diagnoses.length)
	};
}

/** Canonicalize response shape, not expected values; null/missing bucket join. */
export function normalizeLabelCountMetric(result) {
	const values = result.label.map((label, index) => ({
		value: bucketValue(label),
		count: result.count[index]
	}));
	return values.sort((a, b) => compare(a.value, b.value));
}

/** getTumors({group:'ICD_ICD10_3',abscissa:'years',genderWise:true}). */
export function normalizeTumorYearGenderMetric(result) {
	return result.groups
		.flatMap((group) =>
			group.count.map((count, index) => ({
				value: [
					bucketValue(group.label),
					bucketValue(result.category[index]),
					bucketValue(group.gender)
				],
				count
			}))
		)
		.filter((entry) => entry.count !== 0)
		.sort((a, b) => compare(a.value, b.value));
}
