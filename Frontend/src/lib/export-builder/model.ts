import { ExportError } from './errors';

/** Export metadata uses translation keys; IDs always refer to the original schema. */
export type Field = {
	id: string;
	label: string;
	labelIsRaw?: boolean;
	type: 'text' | 'number' | 'date';
	default?: boolean;
};

export type Dataset = {
	id: string;
	label: string;
	description: string;
	icon: string;
	dateField?: string;
	fields: Field[];
};

export type RowSelection = 'all' | 'first' | 'last';

export type TableSelection = {
	dataset: string;
	parent: string | null;
	relation: string | null;
	join: 'left' | 'inner';
	selection?: RowSelection;
};

export type ColumnSelection = { dataset: string; field: string; alias: string };
export type Relation = {
	id: string;
	from: string;
	to: string;
	fromField: string;
	toField: string;
	label: string;
};

const field = (
	id: string,
	label: string,
	type: Field['type'] = 'text',
	selected = false
): Field => ({ id, label, type, ...(selected ? { default: true } : {}) });
const tumor = () => field('tumorID', 'tumorID', 'text', true);
const patient = () => field('patID', 'patientID');
const record = () => field('_id', 'exportRecordID');

/** Approved clinical datasets. Field metadata is enriched from the stored MongoDB records. */
export const datasets: Dataset[] = [
	{
		id: 'patient',
		label: 'studyPatients',
		icon: 'patient',
		description: 'exportPatientDescription',
		fields: [
			field('patID', 'patientID', 'text', true),
			field('gender', 'gender', 'text', true),
			field('birthDate', 'birthDateLong', 'date'),
			field('vitalState', 'vitalStatus'),
			field('vitalDate', 'vitalDateLong', 'date'),
			field('deathDate', 'deathLong', 'date'),
			field('ageAtDiagnosis', 'ageAtDiagnosis', 'number'),
			field('countryCode', 'exportCountryCode'),
			field('countryName', 'countryLong'),
			field('state', 'exportFederalState'),
			field('district', 'exportAdministrativeDistrict'),
			field('county', 'exportCounty'),
			field('postalCode', 'ZIPCode'),
			record()
		]
	},
	{
		id: 'diagnosis',
		dateField: 'diagnosisDate',
		label: 'tumors',
		icon: 'diagnosis',
		description: 'exportDiagnosisDescription',
		fields: [
			tumor(),
			patient(),
			field('diagnosisDate', 'diagnosisDateLong', 'date'),
			field('ICD.ICD10', 'ICD10', 'text', true),
			field('ICDO_histologyCode', 'histologyCodeLong'),
			field('ICDO_histologyCodeText', 'histology'),
			field('ICDO_localizationCode', 'localizationCodeLong'),
			field('side', 'side'),
			field('ageAtDiagnosis', 'ageAtDiagnosis', 'number'),
			field('diagnosisReason', 'diagnosisReason'),
			field('diagnosisAssurance', 'diagnosisConfirmation'),
			field('ECOG', 'coxEcog'),
			field('centerCase', 'centerCase'),
			field('primaryCase', 'primaryCase'),
			field('reportDate', 'exportReportDate', 'date'),
			field('organizationalUnit', 'organizationalUnit'),
			record()
		]
	},
	{
		id: 'therapy',
		dateField: 'therapyOccurrenceDate',
		label: 'therapies',
		icon: 'therapy',
		description: 'exportTherapyDescription',
		fields: [
			field('therapyID', 'therapyID'),
			field('tumorID', 'tumorID'),
			patient(),
			field('generalType', 'therapyType', 'text', true),
			field('therapyOccurrenceDate', 'therapyOccurrenceDate', 'date', true),
			field('therapyEndDate', 'exportTherapyEndDate', 'date'),
			field('intention', 'therapyIntention'),
			field('protocol', 'protocol'),
			field('phase', 'therapyPhase'),
			field('therapyLine', 'therapyLine'),
			field('localRState', 'localResStatus'),
			field('globalRState', 'exportGlobalResidualStatus'),
			field('terminationReason', 'terminationReason'),
			field('ECOG', 'coxEcog'),
			field('organizationalUnit', 'organizationalUnit'),
			field('therapyDaysSinceDiagnosis', 'daysSinceDiagnosis', 'number'),
			record()
		]
	},
	{
		id: 'radiation',
		label: 'exportRadiationDetails',
		icon: 'radiation',
		description: 'exportRadiationDescription',
		fields: [
			field('therapyID', 'therapyID'),
			field('tumorID', 'tumorID'),
			patient(),
			field('type', 'radiationType'),
			field('areaDetailed', 'targetArea', 'text', true),
			field('singleDose', 'singleDose', 'number'),
			field('singleDoseUnit', 'singleDoseUnit'),
			field('totalDose', 'totalDose', 'number', true),
			field('totalDoseUnit', 'totalDoseUnit'),
			field('boost', 'boost'),
			field('side', 'side'),
			field('tech', 'technology'),
			field('radioType', 'radioType'),
			field('radioNuclid', 'radioNuclid'),
			field('brachyType', 'brachyType'),
			field('areaGrouped', 'exportTargetAreaGroup'),
			field('therapyOccurrenceDate', 'therapyOccurrenceDate', 'date'),
			record()
		]
	},
	{
		id: 'histology',
		dateField: 'ICDO_histologyDate',
		label: 'histology',
		icon: 'histology',
		description: 'exportHistologyDescription',
		fields: [
			tumor(),
			patient(),
			field('ICDO_histologyCode', 'histologyCodeLong', 'text', true),
			field('ICDO_histologyCodeText', 'histology', 'text', true),
			field('ICDO_histologyDate', 'histologyDate', 'date', true),
			field('ICDO_source', 'exportFindingSource'),
			field('ICDO_mixedTumor', 'mixedTumor'),
			field('ICDO_grading', 'grading'),
			field('ICDO_Nb', 'positiveLymphNodes'),
			field('ICDO_Nu', 'examinedLymphNodes'),
			field('ICDO_sNb', 'positiveSentinelNodes'),
			field('ICDO_sNu', 'examinedSentinelNodes'),
			record()
		]
	},
	{
		id: 'tnm',
		dateField: 'tnmOccurrenceDate',
		label: 'km.links.tnm',
		icon: 'tnm',
		description: 'exportTnmDescription',
		fields: [
			tumor(),
			patient(),
			field('tnmOccurrenceDate', 'tnmDate', 'date', true),
			field('type', 'tnmType'),
			field('T', 'T', 'text', true),
			field('N', 'N', 'text', true),
			field('M', 'M', 'text', true),
			field('UICC', 'coxUicc'),
			field('version', 'tnmVersion'),
			field('RClass', 'rClassification'),
			field('L', 'lymphVesselInvasion'),
			field('V', 'venousInvasion'),
			field('Pn', 'perineuralInvasion'),
			field('y', 'exportYPrefix'),
			record()
		]
	},
	{
		id: 'progress',
		dateField: 'progressOccurrenceDate',
		label: 'progress',
		icon: 'progress',
		description: 'exportProgressDescription',
		fields: [
			tumor(),
			patient(),
			field('progressOccurrenceDate', 'progressDateLong', 'date', true),
			field('overallAssessment', 'exportOverallAssessment', 'text', true),
			field('tumorState', 'statusOfPrimaryTumor'),
			field('lymphNodeState', 'statusOfLymphNodes'),
			field('metastasisState', 'statusOfDistantMetastases'),
			field('progressReason', 'reasonForProgressSurvey'),
			field('progressSource', 'sourceOfInformation'),
			field('vitalState', 'vitalStatus'),
			field('vitalDate', 'vitalDateLong', 'date'),
			field('progressDaysSinceDiagnosis', 'daysSinceDiagnosis', 'number'),
			field('reportID', 'reportID'),
			record()
		]
	},
	{
		id: 'metastasis',
		dateField: 'metastasisDate',
		label: 'metastases',
		icon: 'metastasis',
		description: 'exportMetastasisDescription',
		fields: [
			tumor(),
			patient(),
			field('metastasisDate', 'metastasisDate', 'date', true),
			field('metastasisLocation', 'metastasisLocation', 'text', true),
			field('type', 'exportTiming'),
			field('spread', 'spread'),
			record()
		]
	},
	{
		id: 'tumorBoard',
		dateField: 'tumorBoardOccurrenceDate',
		label: 'tumorboards',
		icon: 'tumorBoard',
		description: 'exportTumorBoardDescription',
		fields: [
			tumor(),
			patient(),
			field('tumorBoardOccurrenceDate', 'tumorBoardDateLong', 'date', true),
			field('type', 'typeOfTumorBoard', 'text', true),
			field('recommendation', 'recommendation'),
			field('presentationMode', 'presentationMode'),
			field('praepost', 'exportPrePostTreatment'),
			field('tbInternal', 'internalExternal'),
			field('tumorBoardDaysSinceDiagnosis', 'daysSinceDiagnosis', 'number'),
			record()
		]
	},
	{
		id: 'consultation',
		dateField: 'consultationOccurrenceDate',
		label: 'consultations',
		icon: 'consultation',
		description: 'exportConsultationDescription',
		fields: [
			tumor(),
			patient(),
			field('consultationOccurrenceDate', 'consultationDateLong', 'date', true),
			field('type', 'typeOfConsultation', 'text', true),
			field('status', 'status'),
			field('consultationDaysSinceDiagnosis', 'daysSinceDiagnosis', 'number'),
			record()
		]
	},
	{
		id: 'status',
		dateField: 'statusOccurrenceDate',
		label: 'status',
		icon: 'status',
		description: 'exportStatusDescription',
		fields: [
			tumor(),
			patient(),
			field('statusOccurrenceDate', 'recordingDate', 'date', true),
			field('type', 'typeOfStatus'),
			field('status', 'value', 'text', true),
			field('statusDaysSinceDiagnosis', 'daysSinceDiagnosis', 'number'),
			record()
		]
	},
	{
		id: 'molecularMarker',
		dateField: 'molecularMarkerOccurrenceDate',
		label: 'exportMolecularMarkers',
		icon: 'molecularMarker',
		description: 'exportMolecularMarkerDescription',
		fields: [
			tumor(),
			patient(),
			field('molecularMarkerOccurrenceDate', 'exportFindingDate', 'date', true),
			field('type', 'marker', 'text', true),
			field('status', 'exportResult', 'text', true),
			field('exon', 'exon'),
			field('method', 'method'),
			field('miscellaneous', 'supplementaryInformation'),
			field('project', 'project'),
			record()
		]
	},
	{
		id: 'bioMaterial',
		dateField: 'bioMaterialOccurrenceDate',
		label: 'bioMaterial',
		icon: 'bioMaterial',
		description: 'exportBioMaterialDescription',
		fields: [
			tumor(),
			patient(),
			field('bioMaterialOccurrenceDate', 'exportSampleDate', 'date', true),
			field('type', 'exportMaterialType', 'text', true),
			field('status', 'status'),
			field('project', 'project'),
			field('reference', 'coxReference'),
			field('amount', 'exportAmount'),
			field('amountUnit', 'exportAmountUnit'),
			record()
		]
	},
	{
		id: 'studyPatient',
		dateField: 'recruitmentDate',
		label: 'studyName',
		icon: 'studyPatient',
		description: 'exportStudyDescription',
		fields: [
			field('patID', 'patientID', 'text', true),
			field('studyID', 'studyID', 'text', true),
			field('shortname', 'studyShortname', 'text', true),
			field('recruitmentDate', 'studyRecruitmentDate', 'date'),
			record()
		]
	},
	{
		id: 'diagnostic',
		dateField: 'diagnosticOccurrenceDate',
		label: 'diagnosticDetails',
		icon: 'diagnostic',
		description: 'exportDiagnosticDescription',
		fields: [
			tumor(),
			patient(),
			field('diagnosticOccurrenceDate', 'diagnosticDate', 'date'),
			field('investigationMethod', 'diagnosticProcedure', 'text', true),
			record()
		]
	},
	{
		id: 'study',
		label: 'studies',
		icon: 'studyPatient',
		description: 'exportStudyMetadataDescription',
		fields: [
			field('studyID', 'studyID', 'text', true),
			field('shortname', 'studyShortname', 'text', true),
			field('start', 'studyStart', 'date'),
			record()
		]
	},
	{
		id: 'kaplanMeier',
		label: 'kaplanMeierTitle',
		icon: 'survival',
		description: 'exportKaplanMeierDescription',
		fields: [tumor(), patient(), field('diagnosisDate', 'diagnosisDateLong', 'date'), record()]
	},
	{
		id: 'followUp',
		label: 'followUpAnalysisTitle',
		icon: 'survival',
		description: 'exportFollowUpDescription',
		fields: [tumor(), patient(), field('diagnosisDate', 'diagnosisDateLong', 'date'), record()]
	},
	{
		id: 'supplementary',
		dateField: 'supplementaryOccurrenceDate',
		label: 'supplementaryInformation',
		icon: 'supplementary',
		description: 'exportSupplementaryDescription',
		fields: [
			tumor(),
			patient(),
			field('supplementaryOccurrenceDate', 'recordingDate', 'date', true),
			field('type', 'type', 'text', true),
			field('status', 'value'),
			field('therapyID', 'therapyID'),
			record()
		]
	}
];

const link = (from: string, to: string, key: string, label: string): Relation => ({
	id: `${from}-${to}`,
	from,
	to,
	fromField: key,
	toField: key,
	label
});

/** Approved canonical tree. Reversing an edge changes its direction, never its keys. */
export const relations: Relation[] = [
	link('patient', 'diagnosis', 'patID', 'exportRelationPatientDiagnosis'),
	link('diagnosis', 'therapy', 'tumorID', 'exportRelationDiagnosisTherapy'),
	// Flattened radiation details retain their parent therapy document's _id.
	// therapyID can be reused by distinct therapy records and is not a unique parent key.
	link('therapy', 'radiation', '_id', 'exportRelationTherapyRadiation'),
	...[
		'histology',
		'tnm',
		'progress',
		'metastasis',
		'tumorBoard',
		'consultation',
		'status',
		'molecularMarker',
		'bioMaterial',
		'supplementary',
		'diagnostic',
		'kaplanMeier',
		'followUp'
	].map((id) =>
		link('diagnosis', id, 'tumorID', `exportRelationDiagnosis${id[0].toUpperCase()}${id.slice(1)}`)
	),
	link('patient', 'studyPatient', 'patID', 'exportRelationPatientStudy'),
	link('studyPatient', 'study', 'studyKey', 'exportRelationStudyMetadata')
];

export type Cell = string | number | null;
export type DataRow = Record<string, Cell | undefined>;
export type DataRows = Record<string, DataRow[]>;

export const columnKey = (dataset: string, field: string): string => `${dataset}.${field}`;

function assertDataset(id: string): void {
	if (!datasets.some((dataset) => dataset.id === id))
		throw new ExportError('exportErrorUnknownTable', { table: id });
}

/** Paths retain bridge tables even when no fields from those tables are selected. */
export function buildTablePlan(base: string, selected: string[]): TableSelection[] {
	assertDataset(base);
	selected.forEach(assertDataset);
	const rooted: TableSelection[] = [{ dataset: base, parent: null, relation: null, join: 'left' }];
	const seen = new Set([base]);
	for (let cursor = 0; cursor < rooted.length; cursor += 1) {
		const parent = rooted[cursor].dataset;
		for (const relation of relations) {
			const child =
				relation.from === parent ? relation.to : relation.to === parent ? relation.from : null;
			if (!child || seen.has(child)) continue;
			seen.add(child);
			rooted.push({ dataset: child, parent, relation: relation.id, join: 'left' });
		}
	}
	const byId = new Map(rooted.map((entry) => [entry.dataset, entry]));
	const needed = new Set([base]);
	for (const id of selected) {
		let current: string | null = id;
		while (current !== null && !needed.has(current)) {
			const entry = byId.get(current);
			if (!entry) throw new ExportError('exportErrorNoConnection', { table: current });
			needed.add(current);
			current = entry.parent;
		}
	}
	return rooted.filter((entry) => needed.has(entry.dataset));
}

type JoinedRow = { baseIndex: number; tables: Record<string, DataRow | null> };
const isJoinKey = (value: Cell | undefined): value is string | number =>
	(typeof value === 'string' && value !== '') ||
	(typeof value === 'number' && Number.isFinite(value));

/** Accept epoch milliseconds and ISO dates only; date-times without a zone use UTC. */
function chronology(value: Cell | undefined): number | null {
	if (typeof value === 'number') {
		const timestamp = new Date(value).getTime();
		return Number.isFinite(timestamp) ? timestamp : null;
	}
	if (typeof value !== 'string') return null;
	const iso =
		/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-](\d{2}):(\d{2}))?)?$/.exec(
			value
		);
	if (!iso) return null;
	const [, year, month, day, hour, minute, second, , zone, offsetHour, offsetMinute] = iso;
	const leap = +year % 4 === 0 && (+year % 100 !== 0 || +year % 400 === 0);
	const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	if (
		+month < 1 ||
		+month > 12 ||
		+day < 1 ||
		+day > days[+month - 1] ||
		(hour !== undefined && (+hour > 23 || +minute > 59 || +(second ?? 0) > 59)) ||
		(offsetHour !== undefined && (+offsetHour > 23 || +offsetMinute > 59))
	)
		return null;
	const timestamp = Date.parse(hour === undefined || zone ? value : `${value}Z`);
	return Number.isFinite(timestamp) ? timestamp : null;
}

const canonicalRow = (row: DataRow): string =>
	JSON.stringify(
		Object.keys(row)
			.sort()
			.map((key) => [key, typeof row[key], String(row[key])])
	);

function compareRows(left: DataRow, right: DataRow): number {
	const leftId = String(left._id ?? ''),
		rightId = String(right._id ?? '');
	if (leftId !== rightId) return leftId < rightId ? -1 : 1;
	const a = canonicalRow(left),
		b = canonicalRow(right);
	return a < b ? -1 : a > b ? 1 : 0;
}

function selectDatedRow(
	matches: DataRow[],
	dataset: string,
	dateField: string,
	mode: RowSelection
): DataRow[] {
	let selected: DataRow | undefined;
	let selectedDate = 0;
	for (const row of matches) {
		const date = chronology(row[dateField]);
		if (date === null) continue;
		if (
			!selected ||
			(mode === 'first' ? date < selectedDate : date > selectedDate) ||
			(date === selectedDate && compareRows(row, selected) < 0)
		) {
			selected = row;
			selectedDate = date;
		}
	}
	if (!selected) throw new ExportError('exportErrorSelectionDate', { table: dataset });
	return [selected];
}

export type RowSelectionAvailability = {
	available: boolean;
	reason: 'noDateField' | 'noMatches' | 'missingDates' | null;
};

/** Conservative UI eligibility: orphan child rows cannot disable a connected group. */
export function getRowSelectionAvailability(
	table: TableSelection,
	data: DataRows
): RowSelectionAvailability {
	const dateField = datasets.find((dataset) => dataset.id === table.dataset)?.dateField;
	if (!dateField) return { available: false, reason: 'noDateField' };
	const relation = relations.find((candidate) => candidate.id === table.relation);
	if (table.parent === null || !relation) return { available: false, reason: 'noMatches' };
	const parentField = relation.from === table.parent ? relation.fromField : relation.toField;
	const childField = relation.from === table.parent ? relation.toField : relation.fromField;
	const parentKeys = new Set(
		(data[table.parent] ?? []).map((row) => row[parentField]).filter(isJoinKey)
	);
	const groups = new Map<string | number, boolean>();
	for (const row of data[table.dataset] ?? []) {
		const key = row[childField];
		if (!isJoinKey(key) || !parentKeys.has(key)) continue;
		groups.set(key, (groups.get(key) ?? false) || chronology(row[dateField]) !== null);
	}
	if (groups.size === 0) return { available: false, reason: 'noMatches' };
	if ([...groups.values()].some((dated) => !dated))
		return { available: false, reason: 'missingDates' };
	return { available: true, reason: null };
}

// Independent 1:n joins can otherwise allocate millions of rows synchronously in the browser.
export const MAX_JOIN_ROWS = 100_000;

function assertRowCapacity(count: number): void {
	if (count > MAX_JOIN_ROWS) {
		throw new ExportError('exportErrorRowLimit', { limit: MAX_JOIN_ROWS });
	}
}

/**
 * Sequential, parent-first equality joins. A LEFT edge preserves an unmatched row;
 * a later INNER edge removes it if its own parent/key is absent (SQL sequential semantics).
 * Independent 1:n children multiply rows. Optional first/last edges choose one complete
 * dated child per parent key before downstream joins; dates tied at the selected extreme
 * use stable record identity. Nothing is deduplicated or silently truncated;
 * oversized intermediate results fail explicitly before more rows are allocated.
 * matchedBaseCount counts source rows surviving the complete plan, not joined output rows.
 */
export function buildPreview(
	plan: TableSelection[],
	columns: ColumnSelection[],
	data: DataRows,
	catalog: readonly Dataset[] = datasets
): {
	rows: Record<string, Cell>[];
	baseCount: number;
	matchedBaseCount: number;
	expanded: boolean;
} {
	if (plan.length === 0) return { rows: [], baseCount: 0, matchedBaseCount: 0, expanded: false };
	const base = plan[0];
	assertDataset(base.dataset);
	if (base.selection !== undefined && !['all', 'first', 'last'].includes(base.selection))
		throw new ExportError('exportErrorSelectionMode');
	if (base.parent !== null || base.relation !== null)
		throw new ExportError('exportErrorBaseParent');
	const available = new Set([base.dataset]);
	const joins = plan.slice(1).map((entry) => {
		assertDataset(entry.dataset);
		if (available.has(entry.dataset) || entry.parent === null || !available.has(entry.parent)) {
			throw new ExportError('exportErrorJoinOrder');
		}
		const relation = relations.find((candidate) => candidate.id === entry.relation);
		if (
			!relation ||
			!(
				(relation.from === entry.parent && relation.to === entry.dataset) ||
				(relation.to === entry.parent && relation.from === entry.dataset)
			)
		) {
			throw new ExportError('exportErrorUnapprovedJoin');
		}
		if (entry.join !== 'left' && entry.join !== 'inner')
			throw new ExportError('exportErrorJoinType');
		const selection = entry.selection === undefined ? 'all' : entry.selection;
		if (!['all', 'first', 'last'].includes(selection))
			throw new ExportError('exportErrorSelectionMode');
		const dateField = datasets.find((dataset) => dataset.id === entry.dataset)?.dateField;
		if (selection !== 'all' && !dateField)
			throw new ExportError('exportErrorSelectionDate', { table: entry.dataset });
		available.add(entry.dataset);
		return {
			...entry,
			selection,
			dateField,
			parent: entry.parent,
			parentField: relation.from === entry.parent ? relation.fromField : relation.toField,
			childField: relation.from === entry.parent ? relation.toField : relation.fromField
		};
	});
	for (const column of columns) {
		const dataset = catalog.find((candidate) => candidate.id === column.dataset);
		if (
			!available.has(column.dataset) ||
			!dataset?.fields.some((candidate) => candidate.id === column.field)
		) {
			throw new ExportError('exportErrorUnconnectedField', {
				field: columnKey(column.dataset, column.field)
			});
		}
	}
	const sourceRows = data[base.dataset] ?? [];
	assertRowCapacity(sourceRows.length);
	let joined: JoinedRow[] = sourceRows.map((row, baseIndex) => ({
		baseIndex,
		tables: { [base.dataset]: row }
	}));
	for (const entry of joins) {
		const byKey = new Map<string | number, DataRow[]>();
		for (const child of data[entry.dataset] ?? []) {
			const key = child[entry.childField];
			if (!isJoinKey(key)) continue;
			const matches = byKey.get(key);
			if (matches) matches.push(child);
			else byKey.set(key, [child]);
		}
		const next: JoinedRow[] = [];
		const selectedByKey = new Map<string | number, DataRow[]>();
		for (const row of joined) {
			const parentKey = row.tables[entry.parent]?.[entry.parentField];
			let matches = isJoinKey(parentKey) ? byKey.get(parentKey) : undefined;
			if (!matches?.length) {
				if (entry.join === 'left') {
					assertRowCapacity(next.length + 1);
					next.push({ ...row, tables: { ...row.tables, [entry.dataset]: null } });
				}
				continue;
			}
			if (entry.selection !== 'all' && isJoinKey(parentKey)) {
				matches =
					selectedByKey.get(parentKey) ??
					selectDatedRow(matches, entry.dataset, entry.dateField!, entry.selection);
				selectedByKey.set(parentKey, matches);
			}
			assertRowCapacity(next.length + matches.length);
			for (const child of matches) {
				next.push({ ...row, tables: { ...row.tables, [entry.dataset]: child } });
			}
		}
		joined = next;
	}
	const multiplicity = new Map<number, number>();
	for (const row of joined)
		multiplicity.set(row.baseIndex, (multiplicity.get(row.baseIndex) ?? 0) + 1);
	return {
		rows: joined.map((row) =>
			Object.fromEntries(
				columns.map((column) => [
					columnKey(column.dataset, column.field),
					row.tables[column.dataset]?.[column.field] ?? null
				])
			)
		),
		baseCount: sourceRows.length,
		matchedBaseCount: multiplicity.size,
		expanded: [...multiplicity.values()].some((count) => count > 1)
	};
}
