const DAY_MS = 24 * 60 * 60 * 1000;

const COX_COVARIATES = Object.freeze([
	'age',
	'gender',
	'uicc',
	'tStage',
	'nStage',
	'mStage',
	'grading',
	'ecog',
	'diagnosisYear',
	'synchronousMetastasis'
]);

const CATEGORICAL_COVARIATES = new Set([
	'gender',
	'uicc',
	'tStage',
	'nStage',
	'mStage',
	'grading',
	'ecog',
	'synchronousMetastasis'
]);

const DEFAULT_BASELINE_WINDOW = Object.freeze({ beforeDays: 90, afterDays: 90 });
// This controls working memory/query size, never the number of analysed patients.
const COX_BATCH_SIZE = 2000;
const TNM_TYPE_PRIORITY = Object.freeze({ definitive: 3, pathological: 2, clinical: 1 });

const hasValue = (value) =>
	value !== null && value !== undefined && String(value).trim().length > 0;

const asDate = (value) => {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeTumorId = (value) => String(value ?? '');

const normalizeGender = (value) => {
	const normalized = String(value ?? '')
		.trim()
		.toLowerCase();
	if (!normalized) return null;
	if (['w', 'f', 'female', 'weiblich'].includes(normalized)) return 'female';
	if (['m', 'male', 'männlich', 'maennlich'].includes(normalized)) return 'male';
	if (['d', 'diverse', 'divers'].includes(normalized)) return 'diverse';
	return 'other';
};

const normalizeUiccGroup = (value) => {
	const normalized = String(value ?? '')
		.trim()
		.toUpperCase()
		.replace(/\s+/g, '');
	const match = normalized.match(/^(0|[IVX]+)(?:[ABC])?/);
	if (!match || match[1] === 'X') return null;
	if (match[1].startsWith('IV')) return 'IV';
	if (match[1].startsWith('III')) return 'III';
	if (match[1].startsWith('II')) return 'II';
	if (match[1].startsWith('I')) return 'I';
	return match[1] === '0' ? 'other' : null;
};

const normalizeTnmGroup = (value, prefix, allowedStages) => {
	const normalized = String(value ?? '')
		.trim()
		.toUpperCase();
	if (!normalized) return null;
	const match = normalized.match(/([0-4])(?!\d)/);
	return match && allowedStages.includes(match[1]) ? `${prefix}${match[1]}` : 'other';
};

const normalizeGrading = (value) => {
	const normalized = String(value ?? '').trim();
	if (!normalized) return null;
	const numeric = normalized.match(/(?:^|G\s*)([1-4])(?:\D|$)/i);
	if (numeric) return `G${numeric[1]}`;
	if (/niedrig|low[ -]?grade/i.test(normalized)) return 'lowGrade';
	if (/mittel|intermediate/i.test(normalized)) return 'intermediateGrade';
	if (/hoch|high[ -]?grade/i.test(normalized)) return 'highGrade';
	return null;
};

const normalizeEcog = (value) => {
	const match = String(value ?? '').match(/\b([0-4])\b/);
	if (!match) return null;
	return Number(match[1]) >= 3 ? '3-4' : match[1];
};

const inBaselineWindow = (occurrenceDate, diagnosisDate, window) => {
	const occurrence = asDate(occurrenceDate);
	const diagnosis = asDate(diagnosisDate);
	if (!occurrence || !diagnosis) return false;
	const differenceDays = (occurrence.getTime() - diagnosis.getTime()) / DAY_MS;
	return differenceDays >= -window.beforeDays && differenceDays <= window.afterDays;
};

const selectBaselineValue = (
	records,
	diagnosisDate,
	valueForRecord,
	window = DEFAULT_BASELINE_WINDOW,
	options = {}
) => {
	const diagnosis = asDate(diagnosisDate);
	if (!diagnosis) return null;
	let best = null;
	for (const record of records) {
		if (options.accept && !options.accept(record)) continue;
		const date = asDate(options.dateForRecord?.(record));
		if (!date || !inBaselineWindow(date, diagnosis, window)) continue;
		const value = valueForRecord(record);
		if (!hasValue(value)) continue;
		const priority = options.typePriority?.(record) ?? 0;
		const distance = Math.abs(date.getTime() - diagnosis.getTime());
		if (
			!best ||
			priority > best.priority ||
			(priority === best.priority && distance < best.distance)
		) {
			best = { value, priority, distance };
		}
	}
	return best?.value ?? null;
};

const selectFirstTnmAfterDiagnosis = (
	records,
	diagnosisDate,
	valueForRecord,
	useTypePriority = false
) => {
	const diagnosis = asDate(diagnosisDate);
	if (!diagnosis) return null;
	let best = null;
	for (const record of records) {
		const date = asDate(record.tnmOccurrenceDate);
		if (!date || date < diagnosis) continue;
		const value = valueForRecord(record);
		if (value === null) continue;
		const priority = useTypePriority
			? TNM_TYPE_PRIORITY[String(record.type ?? '').toLowerCase()] ?? 0
			: 0;
		if (!best || priority > best.priority || (priority === best.priority && date < best.date)) {
			best = { value, priority, date };
		}
	}
	return best?.value ?? null;
};

const selectGrading = (records, diagnosisDate, window) =>
	selectBaselineValue(
		records,
		diagnosisDate,
		(record) => normalizeGrading(record.ICDO_grading ?? record.grading),
		window,
		{ dateForRecord: (record) => record.ICDO_histologyDate }
	);

const selectEcog = (records, diagnosisDate, window) =>
	selectBaselineValue(records, diagnosisDate, (record) => normalizeEcog(record.status), window, {
		dateForRecord: (record) => record.statusOccurrenceDate,
		accept: (record) => /^ECOG(?:\s|$)/i.test(String(record.type ?? '').trim())
	});

const groupByTumorId = (records) => {
	const grouped = new Map();
	for (const record of records) {
		const key = normalizeTumorId(record.tumorID);
		if (!grouped.has(key)) grouped.set(key, []);
		grouped.get(key).push(record);
	}
	return grouped;
};

const firstByTumorId = (records) => {
	const indexed = new Map();
	for (const record of records) {
		const key = normalizeTumorId(record.tumorID);
		if (!indexed.has(key)) indexed.set(key, record);
	}
	return indexed;
};

const normalizeCovariates = (covariates) => {
	if (!Array.isArray(covariates) || covariates.length === 0) {
		throw new Error('At least one Cox covariate is required.');
	}
	const unique = [...new Set(covariates)];
	const unsupported = unique.filter((covariate) => !COX_COVARIATES.includes(covariate));
	if (unsupported.length > 0) {
		throw new Error(`Unsupported Cox covariate(s): ${unsupported.join(', ')}`);
	}
	return unique;
};

const buildIndexDiagnosisPipeline = (filterStages = []) => [
	...filterStages,
	{
		$match: {
			patID: { $nin: [null, ''] },
			diagnosisDate: { $type: 'date' }
		}
	},
	{ $sort: { patID: 1, diagnosisDate: 1, tumorID: 1 } },
	// Discard large nested diagnosis fields before grouping; cohort filtering is already complete.
	{
		$project: {
			patID: 1,
			tumorID: 1,
			diagnosisDate: 1,
			ageAtDiagnosis: 1,
			gender: 1,
			metastasis: 1
		}
	},
	{
		$group: {
			_id: '$patID',
			diagnosis: { $first: '$$ROOT' },
			matchingDiagnosisCount: { $sum: 1 }
		}
	},
	{
		$project: {
			_id: 0,
			patID: '$diagnosis.patID',
			tumorID: '$diagnosis.tumorID',
			diagnosisDate: '$diagnosis.diagnosisDate',
			ageAtDiagnosis: '$diagnosis.ageAtDiagnosis',
			gender: '$diagnosis.gender',
			metastasis: '$diagnosis.metastasis',
			matchingDiagnosisCount: 1
		}
	}
];

const supportingPipeline = (tumorIDs, projection) => [
	{ $match: { tumorID: { $in: tumorIDs } } },
	{ $project: { _id: 0, tumorID: 1, ...projection } }
];

const buildCoxRows = (
	indexDiagnoses,
	{ survivalRecords = [], tnmRecords = [], histologyRecords = [], statusRecords = [] },
	window = DEFAULT_BASELINE_WINDOW,
	covariates = COX_COVARIATES
) => {
	const survivalByTumorId = firstByTumorId(survivalRecords);
	const tnmByTumorId = groupByTumorId(tnmRecords);
	const histologyByTumorId = groupByTumorId(histologyRecords);
	const statusByTumorId = groupByTumorId(statusRecords);
	const rows = [];
	const exclusions = { missingSurvival: 0, invalidTime: 0, invalidEvent: 0 };

	for (const diagnosis of indexDiagnoses) {
		const key = normalizeTumorId(diagnosis.tumorID);
		const survival = survivalByTumorId.get(key);
		if (!survival) {
			exclusions.missingSurvival += 1;
			continue;
		}

		const diagnosisDate = asDate(diagnosis.diagnosisDate);
		const vitalDate = asDate(survival.vitalDate);
		const time =
			diagnosisDate && vitalDate ? (vitalDate.getTime() - diagnosisDate.getTime()) / DAY_MS : NaN;
		if (!Number.isFinite(time) || time <= 0) {
			exclusions.invalidTime += 1;
			continue;
		}
		const event = Number(survival.vitalState);
		if (event !== 0 && event !== 1) {
			exclusions.invalidEvent += 1;
			continue;
		}

		const tnm = tnmByTumorId.get(key) ?? [];
		const histology = histologyByTumorId.get(key) ?? [];
		const statuses = statusByTumorId.get(key) ?? [];
		const row = { time, event };
		for (const covariate of covariates) {
			switch (covariate) {
				case 'age':
					row.age = Number.isFinite(Number(diagnosis.ageAtDiagnosis))
						? Number(diagnosis.ageAtDiagnosis)
						: null;
					break;
				case 'gender':
					row.gender = normalizeGender(diagnosis.gender);
					break;
				case 'uicc':
					row.uicc = selectFirstTnmAfterDiagnosis(tnm, diagnosisDate, (record) =>
						normalizeUiccGroup(record.UICC)
					);
					break;
				case 'tStage':
					row.tStage = selectFirstTnmAfterDiagnosis(
						tnm,
						diagnosisDate,
						(record) => normalizeTnmGroup(record.T, 'T', ['1', '2', '3', '4']),
						true
					);
					break;
				case 'nStage':
					row.nStage = selectFirstTnmAfterDiagnosis(
						tnm,
						diagnosisDate,
						(record) => normalizeTnmGroup(record.N, 'N', ['0', '1', '2', '3']),
						true
					);
					break;
				case 'mStage':
					row.mStage = selectFirstTnmAfterDiagnosis(
						tnm,
						diagnosisDate,
						(record) => normalizeTnmGroup(record.M, 'M', ['0', '1']),
						true
					);
					break;
				case 'grading':
					row.grading = selectGrading(histology, diagnosisDate, window);
					break;
				case 'ecog':
					row.ecog = selectEcog(statuses, diagnosisDate, window);
					break;
				case 'diagnosisYear':
					row.diagnosisYear = diagnosisDate.getUTCFullYear();
					break;
				case 'synchronousMetastasis': {
					const metastasis = String(diagnosis.metastasis ?? '').toLowerCase();
					row.synchronousMetastasis =
						metastasis === 'synchron' || metastasis === 'both' ? 'present' : 'absent';
					break;
				}
			}
		}
		rows.push(row);
	}

	return { rows, exclusions };
};

const summarizeAvailability = (rows, covariates = COX_COVARIATES) =>
	covariates.map((covariate) => {
		let available = 0;
		const levelCounts = new Map();
		for (const row of rows) {
			const value = row[covariate];
			if (value === null || value === undefined || value === '') continue;
			available += 1;
			if (CATEGORICAL_COVARIATES.has(covariate)) {
				const key = String(value);
				levelCounts.set(key, (levelCounts.get(key) ?? 0) + 1);
			}
		}
		return {
			covariate,
			available,
			missing: rows.length - available,
			percentage: rows.length > 0 ? (available / rows.length) * 100 : 0,
			levels: [...levelCounts]
				.map(([value, count]) => ({ value, count }))
				.sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
		};
	});

const loadCoxDataset = async (
	db,
	collections,
	filterStages = [],
	window = DEFAULT_BASELINE_WINDOW,
	covariates = COX_COVARIATES,
	deadline = { remaining: () => 60_000 }
) => {
	const cursor = db
		.collection(collections.diagnosis)
		.aggregate(buildIndexDiagnosisPipeline(filterStages), {
			allowDiskUse: true,
			maxTimeMS: deadline.remaining(),
			batchSize: COX_BATCH_SIZE
		});
	const rows = [];
	const exclusions = { missingSurvival: 0, invalidTime: 0, invalidEvent: 0 };
	let indexPatients = 0;
	let matchingDiagnoses = 0;
	const selected = new Set(covariates);
	const tnmProjection = { type: 1, tnmOccurrenceDate: 1 };
	for (const [covariate, field] of Object.entries({
		uicc: 'UICC',
		tStage: 'T',
		nStage: 'N',
		mStage: 'M'
	})) {
		if (selected.has(covariate)) tnmProjection[field] = 1;
	}
	const needsTnm = Object.keys(tnmProjection).length > 2;
	const processBatch = async (diagnoses) => {
		deadline.remaining();
		const tumorIDs = diagnoses.map((diagnosis) => diagnosis.tumorID);
		const read = (collection, projection) =>
			db
				.collection(collection)
				.aggregate(supportingPipeline(tumorIDs, projection), { maxTimeMS: deadline.remaining() })
				.toArray();
		const [survivalRecords, tnmRecords, histologyRecords, statusRecords] = await Promise.all([
			read(collections.kaplanmeier, { vitalDate: 1, vitalState: 1 }),
			needsTnm ? read(collections.tnm, tnmProjection) : [],
			selected.has('grading')
				? read(collections.histology, { ICDO_grading: 1, ICDO_histologyDate: 1 })
				: [],
			selected.has('ecog')
				? read(collections.status, { type: 1, status: 1, statusOccurrenceDate: 1 })
				: []
		]);
		deadline.remaining();
		const batch = buildCoxRows(
			diagnoses,
			{ survivalRecords, tnmRecords, histologyRecords, statusRecords },
			window,
			covariates
		);
		for (const row of batch.rows) rows.push(row);
		for (const reason of Object.keys(exclusions)) exclusions[reason] += batch.exclusions[reason];
	};
	try {
		let batch = [];
		for await (const diagnosis of cursor) {
			deadline.remaining();
			indexPatients += 1;
			matchingDiagnoses += Number(diagnosis.matchingDiagnosisCount ?? 1);
			batch.push(diagnosis);
			if (batch.length === COX_BATCH_SIZE) {
				await processBatch(batch);
				batch = [];
			}
		}
		if (batch.length > 0) await processBatch(batch);
	} finally {
		await cursor.close();
	}
	return {
		rows,
		availability: summarizeAvailability(rows, covariates),
		exclusions,
		indexPatients,
		matchingDiagnoses
	};
};

module.exports = {
	CATEGORICAL_COVARIATES,
	COX_COVARIATES,
	DEFAULT_BASELINE_WINDOW,
	buildCoxRows,
	buildIndexDiagnosisPipeline,
	loadCoxDataset,
	normalizeCovariates,
	summarizeAvailability,
	internal: {
		normalizeEcog,
		normalizeGender,
		normalizeGrading,
		normalizeTnmGroup,
		normalizeUiccGroup,
		selectBaselineValue,
		selectFirstTnmAfterDiagnosis
	}
};
