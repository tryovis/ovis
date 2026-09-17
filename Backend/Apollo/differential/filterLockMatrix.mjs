import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ReferenceModel, normalizeAstKeys } from './referenceEvaluator.mjs';

const require = createRequire(import.meta.url);
const { createAccessControl } = require('../accessControl.js');
const { filter2match } = require('../astTranslator.js');
const patientResolvers = require('../resolver/patient.js');

const leaf = (key, value, system = 'diagnosis', type = 'EQUALS') => ({ key, value, system, type });
const group = (operand, ...children) => ({ operand, children });
const row = (key, values, system = 'diagnosis', type = 'EQUALS') => ({
	key,
	operand: 'OR',
	children: values.map((value) => leaf(key, value, system, type))
});
const equals = (key, value, system) => row(key, [value], system);
const negative = (key, values, system = 'diagnosis') => row(`!${key}`, values, system, 'NEQUALS');
const range = (key, min, max, system = 'diagnosis', type = 'BETWEEN') =>
	row(type === 'NBETWEEN' ? `!${key}` : key, [{ min, max }], system, type);
const date = (value) => new Date(`${value}T00:00:00.000Z`);
const sorted = (values) => [...new Set(values)].sort();
const t = (...numbers) => numbers.map((number) => `t${String(number).padStart(2, '0')}`);
const all = t(...Array.from({ length: 16 }, (_, i) => i + 1));
const without = (numbers) => all.filter((id) => !t(...numbers).includes(id));

/** Small hand-auditable fixture, including one patient with an allowed and an
 * out-of-cohort tumor, and multiple rows which satisfy separate halves of AND. */
export function createFilterLockFixture() {
	const records = [
		[1, 'p01', 'm', 'C34', 20, '2019-12-31', 'adeno', 'OP'],
		[2, 'p01', 'm', 'C50', 55, '2020-02-29', 'squamous', 'systemic'],
		[3, 'p02', 'w', 'C32', 30, '2020-01-01', 'squamous', 'OP'],
		[4, 'p02', 'w', 'C34', 60, '2020-12-31', 'adeno', 'radiation'],
		[5, 'p03', 'd', 'C34', 0, '2021-01-01', null, null],
		[6, 'p04', null, 'C18', null, '2020-02-29', '', 'systemic'],
		[7, 'p05', '', 'C34', 50, null, undefined, 'OP'],
		[8, 'p06', ' ', 'C44', 51, '2020-06-30', 'squamous', ''],
		[9, 'p07', '-', 'C34', 40, '2020-07-01', 'adeno', null],
		[10, 'p08', undefined, 'C50', 70, '2021-02-01', undefined, undefined],
		[11, 'p09', 'w', 'C34', 25, '2020-03-01', 'adeno', 'systemic'],
		[12, 'p10', 'm', 'C32', 65, '2020-11-30', 'squamous', 'OP'],
		[13, 'p11', 'm', 'C34', 55, '2020-12-31', 'adeno', 'systemic'],
		[14, 'p12', 'w', 'C18', 30, '2018-01-01', null, 'radiation'],
		[15, 'p13', 'd', 'C50', 50, '2020-02-28', 'adeno', 'systemic'],
		[16, 'p14', 'w', 'C34', 60, '2020-03-01', '', 'OP']
	];
	const notes = [
		'',
		null,
		undefined,
		'-',
		' ',
		'known',
		false,
		0,
		'known',
		[],
		['', 'known'],
		'known',
		'',
		null,
		'known',
		'known'
	];
	const collections = { patient: [], diagnosis: [], histology: [], therapy: [] };
	const patients = new Map();
	for (const [
		number,
		patID,
		gender,
		code,
		ageAtDiagnosis,
		day,
		histologyCode,
		therapyType
	] of records) {
		const tumorID = t(number)[0];
		if (!patients.has(patID))
			patients.set(patID, {
				_id: patID,
				patID,
				tumorID: [],
				...(gender === undefined ? {} : { gender })
			});
		patients.get(patID).tumorID.push(tumorID);
		collections.diagnosis.push({
			_id: tumorID,
			tumorID,
			patID,
			ageAtDiagnosis,
			isTumor: number !== 10,
			diagnosisDate: day == null ? null : date(day),
			ICD: { ICD10: code, ICD10_3: code, ICD10Group: `C${code[1]}0-C${code[1]}9` },
			...(notes[number - 1] === undefined ? {} : { note: notes[number - 1] })
		});
		if (histologyCode !== undefined)
			collections.histology.push({
				_id: `h-${tumorID}`,
				tumorID,
				patID,
				code: histologyCode,
				ICDO_histologyCode: `HISTOLOGY-${tumorID}`,
				ICDO_histologyDate: date('2020-01-15'),
				grade: number === 11 ? 2 : 1
			});
		if (therapyType !== undefined && number !== 5)
			collections.therapy.push({
				_id: `therapy-${tumorID}`,
				tumorID,
				patID,
				type: therapyType,
				generalType: therapyType === 'OP' ? 'operation' : therapyType,
				subType: `THERAPY-${tumorID}`,
				ops: [{ code: `OP-${tumorID}` }],
				radiation: [{ type: `RADIATION-${tumorID}` }],
				therapyOccurrenceDate: date('2020-01-16'),
				status: number === 2 ? 'Y' : 'X',
				intention: 'curative',
				therapyStartDate: day == null ? null : date(day)
			});
	}
	collections.patient = [...patients.values()];
	collections.histology.push({
		_id: 'h-t01-second',
		tumorID: 't01',
		patID: 'p01',
		code: 'squamous',
		ICDO_histologyCode: 'HISTOLOGY-t01-second',
		ICDO_histologyDate: date('2020-01-17'),
		grade: 2
	});
	collections.therapy.push({
		_id: 'therapy-t01-second',
		tumorID: 't01',
		patID: 'p01',
		type: 'systemic',
		generalType: 'systemic',
		subType: 'THERAPY-t01-second',
		therapyOccurrenceDate: date('2020-01-18'),
		status: 'Y',
		intention: 'palliative'
	});
	return collections;
}

/** Golden IDs are handwritten, not obtained from either the Mongo translator or
 * the independent AST evaluator. The cross-product also tests the two together. */
function predicates() {
	const lung = equals('ICD_ICD10_3', 'C34');
	const male = equals('gender', 'm', 'patient');
	const female = equals('gender', 'w', 'patient');
	const year = range('diagnosisDate', date('2020-01-01').getTime(), date('2020-12-31').getTime());
	return [
		['unrestricted', null, all],
		['lung', lung, t(1, 4, 5, 7, 9, 11, 13, 16)],
		['respiratory-group', equals('ICD_ICD10Group', 'C30-C39'), t(1, 3, 4, 5, 7, 9, 11, 12, 13, 16)],
		['breast', equals('ICD_ICD10_3', 'C50'), t(2, 10, 15)],
		['male', male, t(1, 2, 12, 13)],
		['female', female, t(3, 4, 11, 14, 16)],
		['male-or-female', row('gender', ['m', 'w'], 'patient'), t(1, 2, 3, 4, 11, 12, 13, 14, 16)],
		[
			'neither-male-nor-female',
			negative('gender', ['m', 'w'], 'patient'),
			t(5, 6, 7, 8, 9, 10, 15)
		],
		['missing-gender-family', equals('gender', '-', 'patient'), t(6, 7, 8, 9, 10)],
		['literal-empty-gender', equals('gender', '', 'patient'), t(7)],
		['literal-null-note', equals('note', null), t(2, 3, 14)],
		['not-literal-null-note', negative('note', [null]), without([2, 3, 14])],
		['literal-empty-note', equals('note', ''), t(1, 11, 13)],
		['not-literal-empty-note', negative('note', ['']), without([1, 11, 13])],
		['missing-note-family', equals('note', '-'), t(1, 2, 3, 4, 5, 10, 11, 13, 14)],
		['nonempty-note', negative('note', ['-']), t(6, 7, 8, 9, 12, 15, 16)],
		['year-2020-inclusive', year, t(2, 3, 4, 6, 8, 9, 11, 12, 13, 15, 16)],
		[
			'iso-date-range',
			range('diagnosisDate', '2020-01-01T00:00:00.000Z', '2020-12-31T00:00:00.000Z'),
			t(2, 3, 4, 6, 8, 9, 11, 12, 13, 15, 16)
		],
		['leap-day-exact', equals('diagnosisDate', '2020-02-29T00:00:00.000Z'), t(2, 6)],
		[
			'outside-year-2020',
			range(
				'diagnosisDate',
				date('2020-01-01').getTime(),
				date('2020-12-31').getTime(),
				'diagnosis',
				'NBETWEEN'
			),
			t(1, 5, 7, 10, 14)
		],
		['missing-diagnosis-date', range('diagnosisDate', null, null), t(7)],
		['age-zero', range('ageAtDiagnosis', 0, 0), t(5)],
		['age-open-upper', range('ageAtDiagnosis', null, 30), t(1, 3, 5, 11, 14)],
		['age-open-lower', range('ageAtDiagnosis', 60, null), t(4, 10, 12, 16)],
		[
			'age-disjoint',
			row(
				'ageAtDiagnosis',
				[
					{ min: 20, max: 30 },
					{ min: 50, max: 60 }
				],
				'diagnosis',
				'BETWEEN'
			),
			t(1, 2, 3, 4, 7, 8, 11, 13, 14, 15, 16)
		],
		[
			'age-excluded-disjoint',
			row(
				'!ageAtDiagnosis',
				[
					{ min: 20, max: 30 },
					{ min: 50, max: 60 }
				],
				'diagnosis',
				'NBETWEEN'
			),
			t(5, 6, 9, 10, 12)
		],
		['histology-adeno', equals('code', 'adeno', 'histology'), t(1, 4, 9, 11, 13, 15)],
		[
			'histology-no-squamous',
			negative('code', ['squamous'], 'histology'),
			without([1, 2, 3, 8, 12])
		],
		['therapy-operation', equals('type', 'OP', 'therapy'), t(1, 3, 7, 12, 16)],
		[
			'therapy-not-systemic',
			negative('type', ['systemic'], 'therapy'),
			without([1, 2, 6, 11, 13, 15])
		],
		['lung-and-female', group('AND', lung, female), t(4, 11, 16)],
		['lung-or-female', group('OR', lung, female), t(1, 3, 4, 5, 7, 9, 11, 13, 14, 16)],
		[
			'two-branches',
			group('OR', group('AND', lung, male), group('AND', equals('ICD_ICD10_3', 'C18'), female)),
			t(1, 13, 14)
		],
		['contradictory-genders', group('AND', male, female), []],
		['nor-gender-branches', group('NOR', male, female), t(5, 6, 7, 8, 9, 10, 15)],
		['xor-gender-lung', group('XOR', male, lung), t(2, 4, 5, 7, 9, 11, 12, 16)],
		['boolean-true-string', equals('isTumor', 'true'), without([10])]
	];
}

const collectionNames = {
	usr: 'user',
	patient: 'patient',
	diagnosis: 'diagnosis',
	histology: 'histology',
	therapy: 'therapy',
	diagnostic: 'diagnostic',
	progress: 'progress',
	consultation: 'consultation',
	tumorBoard: 'tumorBoard',
	bioMaterial: 'bioMaterial',
	molecularmarker: 'molecularmarker',
	status: 'status',
	supplementary: 'supplementary',
	metastasis: 'metastasis',
	studyPatient: 'studyPatient'
};

/** Run only with a fresh database supplied by the isolated differential runner.
 * No network is opened here. The Keycloak responses are synthetic; the actual
 * authenticate, stored user lookup, authorization wrapper, translator and Mongo
 * aggregation execute unmodified. No live identity provider is contacted. */
export async function runFilterLockMatrix({ db, onProgress = () => {} }) {
	assert.match(
		db.databaseName,
		/^synthetic_filterlock_matrix_[A-Za-z0-9_]+$/,
		'dedicated disposable database required'
	);
	assert.equal(
		(await db.listCollections({}, { nameOnly: true }).toArray()).length,
		0,
		'matrix database must be empty'
	);
	const fixture = createFilterLockFixture();
	for (const [name, documents] of Object.entries(fixture))
		await db.collection(name).insertMany(documents);
	const model = new ReferenceModel(fixture);
	const cases = [];
	const failures = [];
	const record = async (name, check) => {
		try {
			await check();
			cases.push({ name, passed: true });
		} catch (error) {
			const failure = {
				name,
				message: error.message,
				actual: error.actual,
				expected: error.expected
			};
			failures.push(failure);
			cases.push({ name, passed: false });
		}
	};
	const control = createAccessControl({
		env: { OVIS_IMPORT_MODE: 'credos', KEYCLOAK_CLIENT_SECRET: 'synthetic-only' },
		fetchImpl: async (url, options) => {
			const token = url.endsWith('/token/introspect')
				? options.body.get('token')
				: options.headers.authorization.slice(7);
			const identity = token.replace(/^synthetic\./, '');
			return {
				ok: true,
				status: 200,
				json: async () =>
					url.endsWith('/token/introspect')
						? {
								active: true,
								sub: `subject-${identity}`,
								client_id: 'ovis_client',
								exp: Date.now() / 1000 + 600
						  }
						: { sub: `subject-${identity}`, preferred_username: identity }
			};
		}
	});
	const contextFor = async (id) => ({
		db,
		collections: collectionNames,
		...(await control.authenticate(
			{ headers: { authorization: `Bearer synthetic.${id}` } },
			db,
			collectionNames
		))
	});
	let effective;
	let resolverCalls = 0;
	const queryFields = Object.fromEntries(
		Object.keys(fixture).map((target) => [
			`matrix_${target}`,
			async (_parent, args) => {
				resolverCalls++;
				effective = args.filter ? JSON.parse(args.filter) : null;
				// Production resolvers skip translation when there is no filter;
				// filter2match deliberately rejects undefined as an invalid AST.
				const pipeline = args.filter
					? await filter2match({ value: args.filter, column: target, db })
					: [];
				return db.collection(target).aggregate(pipeline).toArray();
			}
		])
	);
	queryFields.getPatientSingleHeader = async (_parent, args) =>
		db.collection('patient').findOne({ patID: args.patID });
	queryFields.matrix_no_filter = async () => {
		resolverCalls++;
		return true;
	};
	const guarded = control.protectResolvers([{ Query: queryFields }])[0].Query;
	const info = (field) => ({
		parentType: {
			getFields: () => ({
				[field]: { args: field === 'matrix_no_filter' ? [] : [{ name: 'filter' }] }
			})
		}
	});
	const call = (target, context, requested) =>
		guarded[`matrix_${target}`](
			null,
			requested == null ? {} : { filter: JSON.stringify(requested) },
			context,
			info(`matrix_${target}`)
		);
	const expectedIds = (target, ast) =>
		fixture[target]
			.filter(
				(document) =>
					!ast ||
					(target === 'patient'
						? model.evaluatePatient(document, normalizeAstKeys(ast))
						: model.evaluateTargetDocument(document, target, normalizeAstKeys(ast)))
			)
			.map((document) => document._id)
			.sort();
	const predicatesToTest = predicates();
	for (const [name, ast, golden] of predicatesToTest) {
		await record(`golden-reference/${name}`, () =>
			assert.deepEqual(
				expectedIds('diagnosis', ast),
				sorted(golden),
				'independent reference must agree with handwritten IDs'
			)
		);
	}
	let lockIndex = 0;
	for (const [lockName, mandatory, golden] of predicatesToTest) {
		const id = `lock-${lockIndex++}`;
		await db.collection('user').insertOne({
			_id: id,
			role: 'user',
			status: 'active',
			userFilter: mandatory == null ? [] : [JSON.stringify(mandatory)]
		});
		const context = await contextFor(id);
		const permitted = new Set(golden);
		const permittedRows = Object.fromEntries(
			Object.keys(fixture).map((target) => [target, new Set(expectedIds(target, mandatory))])
		);
		for (const [requestName, requested] of predicatesToTest) {
			const merged =
				mandatory && requested ? group('AND', mandatory, requested) : mandatory || requested;
			for (const target of Object.keys(fixture))
				await record(`${lockName}/${requestName}/${target}`, async () => {
					const actual = await call(target, context, requested);
					assert.deepEqual(effective, merged, 'assigned filter must remain an outer AND');
					assert.deepEqual(
						actual.map((document) => document._id).sort(),
						expectedIds(target, merged),
						'actual Mongo IDs must equal independent evaluation'
					);
					assert(
						actual.every((document) => permittedRows[target].has(document._id)),
						'request widened standalone assigned record cohort'
					);
					if (target === 'diagnosis')
						assert(
							actual.every((document) => permitted.has(document.tumorID)),
							'request widened assigned tumor cohort'
						);
					if (target === 'patient')
						assert(
							actual.every((document) => document.tumorID.some((id) => permitted.has(id))),
							'request widened assigned patient cohort'
						);
				});
		}
		if (lockIndex % 5 === 0)
			onProgress({ locks: lockIndex, cases: cases.length, failures: failures.length });
	}

	// Authentication rejects inactive, absent and invalid-role records before any resolver.
	for (const [name, recordValue] of [
		['inactive', { status: 'inactive', role: 'user' }],
		['missing', null],
		['unknown-role', { status: 'active', role: 'unknown' }],
		['missing-status', { role: 'admin' }]
	])
		await record(`authentication/${name}`, async () => {
			if (recordValue)
				await db.collection('user').insertOne({ _id: `denied-${name}`, ...recordValue });
			await assert.rejects(
				contextFor(`denied-${name}`),
				(error) => error.extensions?.code === 'FORBIDDEN'
			);
		});
	await record('authentication/anonymous', async () => {
		const context = {
			db,
			collections: collectionNames,
			...(await control.authenticate({ headers: {} }, db, collectionNames))
		};
		await assert.rejects(
			call('diagnosis', context, null),
			(error) => error.extensions?.code === 'UNAUTHENTICATED'
		);
	});

	const lung = equals('ICD_ICD10_3', 'C34');
	for (const role of ['user', 'manager', 'admin', 'super-admin']) {
		await record(`role/${role}/retains-stored-assignment`, async () => {
			const id = `role-${role}`;
			await db
				.collection('user')
				.insertOne({ _id: id, role, status: 'active', userFilter: [JSON.stringify(lung)] });
			const result = await call(
				'diagnosis',
				await contextFor(id),
				group('OR', lung, equals('ICD_ICD10_3', 'C50'))
			);
			assert.deepEqual(result.map((document) => document._id).sort(), t(1, 4, 5, 7, 9, 11, 13, 16));
		});
	}
	const invalid = [
		['json', '{'],
		['object-not-string', { key: 'x' }],
		['unknown-system', JSON.stringify(equals('role', 'admin', 'user'))],
		['operator-key', JSON.stringify(equals('$where', 'x'))],
		['unknown-type', JSON.stringify(leaf('ageAtDiagnosis', 10, 'diagnosis', 'GT'))],
		['unknown-operand', JSON.stringify(group('NAND', lung))],
		['null-node', 'null'],
		['array-root', '[]']
	];
	for (const [name, raw] of invalid)
		for (const location of ['assigned', 'requested'])
			await record(`invalid-filter/${location}/${name}`, async () => {
				const id = `bad-${location}-${name}`;
				await db.collection('user').insertOne({
					_id: id,
					role: 'user',
					status: 'active',
					userFilter: [location === 'assigned' ? raw : JSON.stringify(lung)]
				});
				const context = await contextFor(id);
				const before = resolverCalls;
				await assert.rejects(
					guarded.matrix_diagnosis(
						null,
						location === 'requested' ? { filter: raw } : {},
						context,
						info('matrix_diagnosis')
					),
					(error) => error.extensions?.code === 'FORBIDDEN'
				);
				assert.equal(resolverCalls, before, 'invalid filters must not reach the resolver');
			});
	for (const [name, stored, expected] of [
		[
			'last-history-entry-wins',
			[JSON.stringify(equals('ICD_ICD10_3', 'C50')), JSON.stringify(lung)],
			t(1, 4, 5, 7, 9, 11, 13, 16)
		],
		['string-assignment', JSON.stringify(lung), t(1, 4, 5, 7, 9, 11, 13, 16)],
		['missing-assignment-means-unrestricted', undefined, all],
		['empty-assignment-means-unrestricted', [], all],
		['empty-ast-means-unrestricted', [JSON.stringify(group('OR'))], all]
	])
		await record(`stored-filter/${name}`, async () => {
			const id = `stored-${name}`;
			await db.collection('user').insertOne({
				_id: id,
				role: 'user',
				status: 'active',
				...(stored === undefined ? {} : { userFilter: stored })
			});
			assert.deepEqual(
				(await call('diagnosis', await contextFor(id), null))
					.map((document) => document._id)
					.sort(),
				expected
			);
		});
	await record('assigned-operation-without-filter-denied', async () => {
		const context = await contextFor('role-user');
		await assert.rejects(
			guarded.matrix_no_filter(null, {}, context, info('matrix_no_filter')),
			(error) => error.extensions?.code === 'FORBIDDEN'
		);
	});
	for (const [patID, permitted] of [
		['p01', true],
		['p02', true],
		['p04', false],
		['p08', false],
		['does-not-exist', false]
	])
		await record(`patient-header/${patID}`, async () => {
			const context = await contextFor('role-user');
			const action = () =>
				guarded.getPatientSingleHeader(null, { patID }, context, info('getPatientSingleHeader'));
			if (permitted) assert.equal((await action()).patID, patID);
			else await assert.rejects(action(), (error) => error.extensions?.code === 'FORBIDDEN');
		});

	// These golden cases expose independent-tumor and independent-row join leaks.
	const traps = [
		[
			'same-tumor-across-patient-and-clinical-systems',
			group(
				'AND',
				equals('gender', 'm', 'patient'),
				lung,
				equals('status', 'Y', 'therapy'),
				equals('intention', 'curative', 'therapy')
			),
			[],
			[]
		],
		[
			'same-histology-row',
			group('AND', lung, equals('code', 'adeno', 'histology'), equals('grade', 2, 'histology')),
			t(11),
			['p09']
		],
		[
			'same-therapy-row',
			group(
				'AND',
				lung,
				equals('status', 'Y', 'therapy'),
				equals('intention', 'curative', 'therapy')
			),
			[],
			[]
		]
	];
	for (const [name, filter, tumorIDs, patientIDs] of traps)
		await record(`join-trap/${name}`, async () => {
			const id = `trap-${name}`;
			await db.collection('user').insertOne({
				_id: id,
				role: 'user',
				status: 'active',
				userFilter: [JSON.stringify(filter)]
			});
			const context = await contextFor(id);
			assert.deepEqual(
				(await call('diagnosis', context, null)).map((document) => document._id).sort(),
				tumorIDs,
				'all clinical criteria must hold on the same tumor and related row'
			);
			assert.deepEqual(
				(await call('patient', context, null)).map((document) => document._id).sort(),
				patientIDs,
				'patient must have one tumor satisfying the full clinical conjunction'
			);
		});

	// Exercise the real detail resolvers, not just an authorization stub. A patient
	// can have one permitted tumor and another which must never appear in the
	// header's diagnosis list, age summary, or any tumor-level timeline event.
	const timelineCollections = [
		['diagnostic', 'diagnosticOccurrenceDate', 'investigationMethod'],
		['progress', 'progressOccurrenceDate', 'overallAssessment'],
		['consultation', 'consultationOccurrenceDate', 'type'],
		['tumorBoard', 'tumorBoardOccurrenceDate', 'type'],
		['bioMaterial', 'bioMaterialOccurrenceDate', 'type'],
		['molecularmarker', 'molecularMarkerOccurrenceDate', 'type'],
		['status', 'statusOccurrenceDate', 'type'],
		['supplementary', 'supplementaryOccurrenceDate', 'type'],
		['metastasis', 'metastasisDate', 'metastasisLocation']
	];
	for (const [name, dateField, labelField] of timelineCollections) {
		await db.collection(collectionNames[name]).insertMany(
			['t01', 't02'].map((tumorID) => ({
				_id: `${name}-${tumorID}`,
				tumorID,
				patID: 'p01',
				[dateField]: date('2020-01-19'),
				[labelField]: `${name}-${tumorID}`
			}))
		);
	}
	await db.collection('studyPatient').insertOne({
		_id: 'study-p01',
		patID: 'p01',
		studyKey: 'synthetic-study',
		recruitmentDate: date('2020-01-20'),
		shortname: 'STUDY-p01'
	});
	const realPatient = control.protectResolvers([patientResolvers])[0].Query;
	for (const [code, allowedTumor, ageAtDiagnosis, clinicalLabels] of [
		[
			'C34',
			't01',
			20,
			['C34', 'HISTOLOGY-t01', 'HISTOLOGY-t01-second', 'OP-t01', 'THERAPY-t01-second']
		],
		['C50', 't02', 55, ['C50', 'HISTOLOGY-t02', 'THERAPY-t02']]
	]) {
		const id = `details-${code}`;
		await db.collection('user').insertOne({
			_id: id,
			role: 'user',
			status: 'active',
			userFilter: [JSON.stringify(equals('ICD_ICD10_3', code))]
		});
		const context = await contextFor(id);
		await record(`real-patient-header/${code}/diagnoses`, async () => {
			const header = await realPatient.getPatientSingleHeader(
				null,
				{ patID: 'p01' },
				context,
				info('getPatientSingleHeader')
			);
			assert.equal(header.diagnosis, code, 'header must not disclose the other tumor diagnosis');
		});
		await record(`real-patient-header/${code}/age`, async () => {
			const header = await realPatient.getPatientSingleHeader(
				null,
				{ patID: 'p01' },
				context,
				info('getPatientSingleHeader')
			);
			assert.equal(
				header.ageAtDiagnosis,
				ageAtDiagnosis,
				'header age must be calculated only from permitted tumors'
			);
		});
		await record(`real-patient-overview/${code}`, async () => {
			const overview = await realPatient.getPatientOverview(
				null,
				{ patID: 'p01' },
				context,
				info('getPatientOverview')
			);
			const expected = [
				...clinicalLabels,
				...timelineCollections.map(([name]) => `${name}-${allowedTumor}`),
				'STUDY-p01'
			].sort();
			assert.deepEqual(
				overview.map((event) => event.label).sort(),
				expected,
				'timeline must contain only permitted tumor events and shared patient-level study participation'
			);
		});
	}
	for (const field of ['getPatientSingleHeader', 'getPatientOverview'])
		await record(`real-patient-denied/${field}`, async () => {
			await assert.rejects(
				realPatient[field](null, { patID: 'p04' }, await contextFor('details-C34'), info(field)),
				(error) => error.extensions?.code === 'FORBIDDEN'
			);
		});
	await record('real-patient-details/unrestricted-preserves-all-tumors', async () => {
		const context = await contextFor('lock-0');
		const header = await realPatient.getPatientSingleHeader(
			null,
			{ patID: 'p01' },
			context,
			info('getPatientSingleHeader')
		);
		assert.deepEqual(header.diagnosis.split(', ').sort(), ['C34', 'C50']);
		assert.equal(header.ageAtDiagnosis, 20);
		const overview = await realPatient.getPatientOverview(
			null,
			{ patID: 'p01' },
			context,
			info('getPatientOverview')
		);
		assert.deepEqual(
			overview.map((event) => event.label).sort(),
			[
				'C34',
				'C50',
				'HISTOLOGY-t01',
				'HISTOLOGY-t01-second',
				'HISTOLOGY-t02',
				'OP-t01',
				'THERAPY-t01-second',
				'THERAPY-t02',
				'STUDY-p01',
				...timelineCollections.flatMap(([name]) => [`${name}-t01`, `${name}-t02`])
			].sort()
		);
	});

	// A patient-level assignment is independent of diagnosis completeness. Import
	// feeds can contain events linked through patient.tumorID before a diagnosis
	// arrives. Retain that linkage without inventing membership for unknown or
	// missing tumorIDs merely from an event's patID. Diagnosis-only branches must
	// still reject events without a matching diagnosis.
	await db.collection('patient').updateOne({ _id: 'p01' }, { $push: { tumorID: 'orphan-listed' } });
	await db.collection('patient').insertOne({
		_id: 'p-no-diagnosis',
		patID: 'p-no-diagnosis',
		gender: 'w',
		tumorID: ['orphan-no-diagnosis-listed']
	});
	await db.collection('diagnostic').insertMany([
		{
			_id: 'orphan-listed',
			patID: 'p01',
			tumorID: 'orphan-listed',
			investigationMethod: 'orphan-listed',
			diagnosticOccurrenceDate: date('2020-01-21')
		},
		{
			_id: 'orphan-unknown',
			patID: 'p01',
			tumorID: 'orphan-unknown',
			investigationMethod: 'orphan-unknown',
			diagnosticOccurrenceDate: date('2020-01-21')
		},
		{
			_id: 'orphan-missing',
			patID: 'p01',
			investigationMethod: 'orphan-missing',
			diagnosticOccurrenceDate: date('2020-01-21')
		},
		{
			_id: 'orphan-patient-no-diagnosis',
			patID: 'p-no-diagnosis',
			investigationMethod: 'orphan-patient-no-diagnosis',
			diagnosticOccurrenceDate: date('2020-01-21')
		},
		{
			_id: 'orphan-no-diagnosis-listed',
			patID: 'p-no-diagnosis',
			tumorID: 'orphan-no-diagnosis-listed',
			investigationMethod: 'orphan-no-diagnosis-listed',
			diagnosticOccurrenceDate: date('2020-01-21')
		}
	]);
	const linkedOrphans = ['orphan-listed'];
	for (const [name, assignment, expectedOrphans, expectedDiagnoses] of [
		['patient-only', equals('gender', 'm', 'patient'), linkedOrphans, ['C34', 'C50']],
		['patient-negative', negative('gender', ['w'], 'patient'), linkedOrphans, ['C34', 'C50']],
		['diagnosis-only', lung, [], ['C34']],
		[
			'patient-or-diagnosis-patient-arm-matches',
			group('OR', equals('gender', 'm', 'patient'), lung),
			linkedOrphans,
			['C34', 'C50']
		],
		[
			'patient-or-diagnosis-patient-arm-does-not-match',
			group('OR', equals('gender', 'w', 'patient'), lung),
			[],
			['C34']
		],
		['patient-and-diagnosis', group('AND', equals('gender', 'm', 'patient'), lung), [], ['C34']]
	]) {
		const id = `orphan-${name}`;
		await db.collection('user').insertOne({
			_id: id,
			role: 'user',
			status: 'active',
			userFilter: [JSON.stringify(assignment)]
		});
		await record(`real-patient-orphan-events/${name}`, async () => {
			const overview = await realPatient.getPatientOverview(
				null,
				{ patID: 'p01' },
				await contextFor(id),
				info('getPatientOverview')
			);
			assert.deepEqual(
				overview
					.filter((event) => event.label?.startsWith('orphan-'))
					.map((event) => event.label)
					.sort(),
				expectedOrphans
			);
			assert.deepEqual(
				overview
					.filter((event) => event.y === 'Diagnose')
					.map((event) => event.label)
					.sort(),
				expectedDiagnoses
			);
		});
	}
	for (const [name, assignment] of [
		['patient-only', equals('gender', 'w', 'patient')],
		['patient-or-diagnosis', group('OR', equals('gender', 'w', 'patient'), lung)]
	]) {
		const id = `no-diagnosis-${name}`;
		await db.collection('user').insertOne({
			_id: id,
			role: 'user',
			status: 'active',
			userFilter: [JSON.stringify(assignment)]
		});
		await record(`real-patient-without-diagnosis/${name}`, async () => {
			const overview = await realPatient.getPatientOverview(
				null,
				{ patID: 'p-no-diagnosis' },
				await contextFor(id),
				info('getPatientOverview')
			);
			assert.deepEqual(
				overview.map((event) => event.label),
				['orphan-no-diagnosis-listed']
			);
		});
	}
	await record('real-patient-orphan-events/unfiltered-retains-unknown-events', async () => {
		const overview = await realPatient.getPatientOverview(
			null,
			{ patID: 'p01' },
			await contextFor('lock-0'),
			info('getPatientOverview')
		);
		assert.deepEqual(
			overview
				.filter((event) => event.label?.startsWith('orphan-'))
				.map((event) => event.label)
				.sort(),
			['orphan-listed', 'orphan-missing', 'orphan-unknown']
		);
	});

	// Independent Boolean goldens. These tumor sets were worked out by hand;
	// neither ReferenceModel nor the production translator generated them. In
	// particular, p1's two tumors and t1's two therapy rows must not satisfy
	// separate halves of a conjunction. Prefixes isolate this miniature fixture
	// from the main matrix even though both share the disposable database.
	const booleanPrefix = 'boolean-golden-';
	const booleanTumors = [
		[1, 1, 'm', 'C50'],
		[2, 1, 'm', 'C34'],
		[3, 2, 'w', 'C34'],
		[4, 3, 'w', 'C50'],
		[5, 4, null, 'C34'],
		[6, 5, 'm', 'C50'],
		[7, 6, 'w', 'C50']
	];
	const booleanPatients = new Map();
	for (const [tumorNumber, patientNumber, gender] of booleanTumors) {
		const patID = `${booleanPrefix}p${patientNumber}`;
		if (!booleanPatients.has(patID))
			booleanPatients.set(patID, { _id: patID, patID, gender, tumorID: [] });
		booleanPatients.get(patID).tumorID.push(`${booleanPrefix}t${tumorNumber}`);
	}
	await db.collection('patient').insertMany([...booleanPatients.values()]);
	await db.collection('diagnosis').insertMany(
		booleanTumors.map(([number, patientNumber, _gender, code]) => ({
			_id: `${booleanPrefix}t${number}`,
			tumorID: `${booleanPrefix}t${number}`,
			patID: `${booleanPrefix}p${patientNumber}`,
			ICD: { ICD10: code, ICD10_3: code }
		}))
	);
	const booleanTherapies = [
		[1, 'operation', 'curative'],
		[1, 'systemic', 'palliative'],
		[2, 'operation', 'palliative'],
		[3, 'operation', 'curative'],
		[4, 'systemic', 'palliative'],
		[6, 'operation', 'palliative'],
		[6, 'systemic', 'curative'],
		[7, 'operation', 'curative']
	];
	await db.collection('therapy').insertMany(
		booleanTherapies.map(([number, generalType, intention], index) => ({
			_id: `${booleanPrefix}therapy${index}`,
			tumorID: `${booleanPrefix}t${number}`,
			patID: `${booleanPrefix}p${booleanTumors.find(([tumorNumber]) => tumorNumber === number)[1]}`,
			generalType,
			intention,
			therapyOccurrenceDate: date(intention === 'curative' ? '2023-01-01' : '2024-01-01')
		}))
	);
	const A = equals('generalType', 'operation', 'therapy');
	const B = equals('intention', 'palliative', 'therapy');
	const C = equals('ICD_ICD10_3', 'C34');
	const W = equals('gender', 'w', 'patient');
	const M = equals('gender', 'm', 'patient');
	const U = equals('intention', 'curative', 'therapy');
	const notB = negative('intention', ['palliative'], 'therapy');
	const notC = negative('ICD_ICD10_3', ['C34']);
	const and = (...nodes) => group('AND', ...nodes);
	const or = (...nodes) => group('OR', ...nodes);
	const nor = (...nodes) => group('NOR', ...nodes);
	const xor = (...nodes) => group('XOR', ...nodes);
	const booleanGoldens = [
		['01-same-therapy-row', and(A, B), [2, 6]],
		['02-distribute-therapy-and-diagnosis', and(A, or(B, C)), [2, 3, 6], or(and(A, B), and(A, C))],
		['03-distribute-therapy-and-patient', and(A, or(B, W)), [2, 3, 6, 7], or(and(A, B), and(A, W))],
		[
			'04-nested-cross-system-branch',
			and(A, or(and(B, W), C)),
			[2, 3],
			or(and(A, B, W), and(A, C))
		],
		[
			'05-distribute-negative-diagnosis',
			and(A, or(B, notC)),
			[1, 2, 6, 7],
			or(and(A, B), and(A, notC))
		],
		['06-event-wide-anti-exists', and(A, notB), [3, 7]],
		['07-mixed-nor-inside-and', and(A, nor(B, C)), [7]],
		['08-nor-includes-no-therapy', nor(A, B), [5]],
		['09-nor-negates-same-row-conjunction', nor(and(A, B), C), [1, 4, 7]],
		['10-nor-therapy-and-diagnosis', nor(A, C), [4]],
		['11-xor-of-same-row-conjunction', xor(and(A, B), C), [3, 5, 6]],
		['12-xor-inside-and', and(A, xor(B, C)), [3, 6], or(and(A, B, notC), and(A, notB, C))],
		['13-xor-therapy-and-diagnosis', xor(A, C), [1, 5, 6, 7]],
		['14-no-cross-tumor-patient-and', and(C, U, M), []],
		['15-same-tumor-patient-and', and(C, A, M), [2]],
		[
			'16-patient-and-independent-branches',
			and(M, or(and(C, U), and(notC, B))),
			[1, 6],
			or(and(M, C, U), and(M, notC, B))
		],
		[
			'17-exclusion-remains-global',
			and(A, or(B, C), notB),
			[3],
			or(and(A, B, notB), and(A, C, notB))
		],
		[
			'18-nor-branch-remains-grouped',
			and(A, or(B, nor(C, W))),
			[1, 2, 6],
			or(and(A, B), and(A, nor(C, W)))
		],
		[
			'19-negative-date-is-event-wide-anti-exists',
			and(
				A,
				range(
					'therapyOccurrenceDate',
					date('2024-01-01').getTime(),
					date('2024-12-31').getTime(),
					'therapy',
					'NBETWEEN'
				)
			),
			[3, 7]
		]
	];
	const booleanContext = await contextFor('lock-0');
	let booleanExpressions = 0;
	let booleanBaseExpressions = 0;
	let booleanBareNegationVariants = 0;
	let booleanNeutralVariants = 0;
	let booleanMaxAstDepth = 0;
	const subtreePaths = (node, path = []) => [
		path,
		...(node.children ?? []).flatMap((child, index) => subtreePaths(child, [...path, index]))
	];
	const astDepth = (node) =>
		node.children?.length ? 1 + Math.max(...node.children.map(astDepth)) : 0;
	const neutralWrappers = [
		['unary-AND', (node) => and(node)],
		['unary-OR', (node) => or(node)],
		['unary-XOR', (node) => xor(node)],
		['double-unary-NOR', (node) => nor(nor(node))]
	];
	const wrapOneSubtree = (ast, path, wrap) => {
		// AST expressions intentionally reuse A/B/C objects. JSON cloning makes a
		// tree without shared object aliases so precisely one occurrence changes.
		const cloned = JSON.parse(JSON.stringify(ast));
		if (path.length === 0) return wrap(cloned);
		let parent = cloned;
		for (const index of path.slice(0, -1)) parent = parent.children[index];
		const index = path[path.length - 1];
		parent.children[index] = wrap(parent.children[index]);
		return cloned;
	};
	const removeUnaryNegativeGroups = (node) => {
		if (!Array.isArray(node.children)) return { ...node };
		const children = node.children.map(removeUnaryNegativeGroups);
		if (
			node.operand === 'OR' &&
			children.length === 1 &&
			!Array.isArray(children[0].children) &&
			['NEQUALS', 'NBETWEEN'].includes(children[0].type)
		) {
			return children[0];
		}
		return { ...node, children };
	};
	for (const [name, original, expectedTumors, distributed] of booleanGoldens) {
		const expectedTumorIDs = expectedTumors.map((number) => `${booleanPrefix}t${number}`).sort();
		const expectedPatientIDs = sorted(
			booleanTumors
				.filter(([number]) => expectedTumors.includes(number))
				.map(([, number]) => `${booleanPrefix}p${number}`)
		);
		const expressionVariants = [
			['original', original],
			...(distributed ? [['distributed', distributed]] : [])
		].flatMap(([variant, ast]) => {
			booleanBaseExpressions++;
			const bare = removeUnaryNegativeGroups(ast);
			if (JSON.stringify(bare) === JSON.stringify(ast)) return [[variant, ast]];
			booleanBareNegationVariants++;
			return [
				[variant, ast],
				[`${variant}-bare-negations`, bare]
			];
		});
		for (const [variant, ast] of expressionVariants) {
			booleanExpressions++;
			const variants = [['base', ast]];
			for (const path of subtreePaths(ast)) {
				for (const [wrapperName, wrap] of neutralWrappers) {
					variants.push([
						`subtree-${path.length ? path.join('.') : 'root'}/${wrapperName}`,
						wrapOneSubtree(ast, path, wrap)
					]);
					booleanNeutralVariants++;
				}
			}
			for (const [wrapperVariant, testedAst] of variants) {
				const depth = astDepth(testedAst);
				booleanMaxAstDepth = Math.max(booleanMaxAstDepth, depth);
				assert(
					depth <= 20,
					'neutral wrapper cases must remain within the access-control AST depth limit'
				);
				for (const [target, expected] of [
					['diagnosis', expectedTumorIDs],
					['patient', expectedPatientIDs]
				]) {
					await record(
						`independent-boolean/${name}/${variant}/${wrapperVariant}/${target}`,
						async () => {
							const actual = await call(target, booleanContext, testedAst);
							assert.deepEqual(
								actual
									.map((document) => document._id)
									.filter((id) => id.startsWith(booleanPrefix))
									.sort(),
								expected,
								'the hand-calculated complete tumor expression must survive neutral wrappers and patient projection'
							);
						}
					);
				}
			}
		}
		onProgress({
			phase: 'independent-boolean',
			golden: name,
			expressions: booleanExpressions,
			baseExpressions: booleanBaseExpressions,
			bareNegationVariants: booleanBareNegationVariants,
			neutralVariants: booleanNeutralVariants,
			cases: cases.length,
			failures: failures.length
		});
	}
	return {
		fixture: Object.fromEntries(
			Object.entries(fixture).map(([key, documents]) => [key, documents.length])
		),
		locks: predicatesToTest.length,
		requestsPerLock: predicatesToTest.length,
		targets: Object.keys(fixture),
		independentBoolean: {
			goldens: booleanGoldens.length,
			expressions: booleanExpressions,
			baseExpressions: booleanBaseExpressions,
			bareNegationVariants: booleanBareNegationVariants,
			neutralVariants: booleanNeutralVariants,
			maxAstDepth: booleanMaxAstDepth,
			targets: ['diagnosis', 'patient']
		},
		cases: cases.length,
		passed: cases.length - failures.length,
		failures,
		details: cases
	};
}
