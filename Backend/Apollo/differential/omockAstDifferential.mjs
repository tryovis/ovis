import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { ReferenceModel } from './referenceEvaluator.mjs';

const require = createRequire(import.meta.url);
const { MongoClient } = require('mongodb');
const { filter2match } = require('../astTranslator.js');
const {
	filterAstToParticipationMatch,
	parseAstFilter
} = require('../resolver/studyPatientTable.js');

const DB_PREFIX = 'ovis_ast_diff_';
const DEFAULT_DB = 'ovis_ast_diff_flat_20260807';
const DEFAULT_REPORT = resolve('differential', 'ast-differential-report.json');
const NULL_AST = { operand: 'OR', children: [] };

const COLLECTIONS = [
	'patient',
	'diagnosis',
	'histology',
	'therapy',
	'progress',
	'diagnostic',
	'consultation',
	'tumorBoard',
	'supplementary',
	'molecularMarker',
	'tnm',
	'metastasis',
	'status',
	'followUp',
	'kaplanMeier',
	'study',
	'studyPatient',
	'bioMaterial'
];

const OMIT_FIELDS = new Set(['_id', 'tumorID', '_astDiffFixture']);
const ARRAY_FIELDS = new Set([
	'ECOG',
	'radiation',
	'complication',
	'substance',
	'ops',
	'surgeon',
	'metastasisResection'
]);

const numberEnv = (name, fallback) => {
	const parsed = Number(process.env[name]);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const config = {
	address: process.env.ADDRESS || 'mongodb://ovis-backend-database-mongodb:27017',
	dbName: process.env.AST_DIFF_DB || DEFAULT_DB,
	caseLimit: numberEnv('AST_DIFF_CASE_LIMIT', 5000),
	fuzzCases: numberEnv('AST_DIFF_FUZZ_CASES', 800),
	maxFailureDetails: numberEnv('AST_DIFF_MAX_FAILURES', 80),
	progressEvery: numberEnv('AST_DIFF_PROGRESS_EVERY', 100),
	reportPath: resolve(process.env.AST_DIFF_REPORT || DEFAULT_REPORT),
	seedFixtures: process.env.AST_DIFF_SEED_FIXTURES !== '0',
	keepFixtures: process.env.AST_DIFF_KEEP_FIXTURES === '1',
	dropDatabase: process.env.AST_DIFF_DROP_DB_AFTER === '1',
	seed: numberEnv('AST_DIFF_SEED', 0x0b0d5206)
};

if (!config.dbName.startsWith(DB_PREFIX)) {
	throw new Error(
		`Refusing to use non-test database "${config.dbName}"; expected prefix ${DB_PREFIX}`
	);
}

const scalarSignature = (value) => {
	if (value instanceof Date) return `date:${value.toISOString()}`;
	return `${typeof value}:${JSON.stringify(value)}`;
};

const cloneAstValue = (value) => {
	if (value instanceof Date) return value.getTime();
	return value;
};

const frontendKey = (path) => (path.startsWith('ICDO_') ? path : path.replaceAll('.', '_'));

const leaf = (descriptor, type, value) => ({
	key: `${type.startsWith('N') ? '!' : ''}${frontendKey(descriptor.path)}`,
	type,
	system: descriptor.system,
	value
});

const fieldGroup = (descriptor, type, values, { keyed = true } = {}) => {
	const children = values.map((value) => leaf(descriptor, type, value));
	const key = `${type.startsWith('N') ? '!' : ''}${frontendKey(descriptor.path)}`;
	return {
		...(keyed ? { key } : {}),
		operand: 'OR',
		children
	};
};

const rootOf = (children, operand = 'AND') => ({
	operand: 'OR',
	children: [{ operand, children }]
});

const logical = (operand, children) => ({ operand, children });

const asComparable = (value) => (value instanceof Date ? value.getTime() : value);

function seededRandom(seed) {
	let state = seed >>> 0;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 0x100000000;
	};
}

const choose = (random, values) => values[Math.floor(random() * values.length)];

const shuffle = (random, values) => {
	const result = [...values];
	for (let index = result.length - 1; index > 0; index -= 1) {
		const other = Math.floor(random() * (index + 1));
		[result[index], result[other]] = [result[other], result[index]];
	}
	return result;
};

function addFieldValue(fields, system, path, value, { arrayPrefix = null } = {}) {
	if (!path || OMIT_FIELDS.has(path) || path.split('.').some((part) => part.startsWith('_')))
		return;
	if (value != null && typeof value === 'object' && !(value instanceof Date)) return;
	const key = `${system}:${path}`;
	let field = fields.get(key);
	if (!field) {
		field = {
			system,
			path,
			arrayPrefix,
			kinds: new Set(),
			values: new Map(),
			nullishObserved: false
		};
		fields.set(key, field);
	}
	if (value == null || value === '' || value === ' ' || value === '-') field.nullishObserved = true;
	if (value == null) return;
	field.kinds.add(value instanceof Date ? 'date' : typeof value);
	if (field.values.size < 20) field.values.set(scalarSignature(value), value);
}

function inspectValue(fields, system, path, value, arrayPrefix = null) {
	if (Array.isArray(value)) {
		if (value.length === 0) {
			addFieldValue(fields, system, path, null, { arrayPrefix: arrayPrefix ?? path });
			return;
		}
		const containsObjects = value.some(
			(item) => item && typeof item === 'object' && !(item instanceof Date)
		);
		if (!containsObjects) {
			for (const item of value) addFieldValue(fields, system, path, item, { arrayPrefix: path });
			return;
		}
		for (const item of value) inspectValue(fields, system, path, item, path);
		return;
	}

	if (value && typeof value === 'object' && !(value instanceof Date)) {
		for (const [key, child] of Object.entries(value)) {
			inspectValue(fields, system, path ? `${path}.${key}` : key, child, arrayPrefix);
		}
		return;
	}

	addFieldValue(fields, system, path, value, { arrayPrefix });
}

function discoverFields(collections) {
	const fields = new Map();
	for (const [system, documents] of Object.entries(collections)) {
		for (const document of documents) {
			for (const [key, value] of Object.entries(document)) {
				if (OMIT_FIELDS.has(key) || key.startsWith('_')) continue;
				inspectValue(fields, system, key, value);
			}
		}
	}

	return [...fields.values()]
		.map((field) => ({
			...field,
			kinds: [...field.kinds],
			values: [...field.values.values()]
		}))
		.filter((field) => field.values.length > 0)
		.sort((left, right) =>
			`${left.system}:${left.path}`.localeCompare(`${right.system}:${right.path}`)
		);
}

function buildFieldPathMap(fields) {
	const result = new Map();
	for (const field of fields) {
		result.set(`${field.system}:${frontendKey(field.path)}`, field.path);
		result.set(`${field.system}:${field.path}`, field.path);
	}
	return result;
}

function normalizeCaseAst(ast, fieldPathMap) {
	const result = structuredClone(ast);
	const visit = (node, inheritedSystem = null) => {
		if (!node || typeof node !== 'object') return;
		const childSystem = Array.isArray(node.children)
			? node.children.map((child) => child.system).find(Boolean)
			: null;
		const system = node.system ?? childSystem ?? inheritedSystem;
		if (typeof node.key === 'string' && system) {
			const negated = node.key.startsWith('!');
			const rawKey = negated ? node.key.slice(1) : node.key;
			const path = fieldPathMap.get(`${system}:${rawKey}`) ?? rawKey;
			node.key = `${negated ? '!' : ''}${path}`;
		}
		if (Array.isArray(node.children)) node.children.forEach((child) => visit(child, system));
	};
	visit(result);
	return result;
}

function descriptor(fields, system, path) {
	const found = fields.find((field) => field.system === system && field.path === path);
	if (!found) throw new Error(`Fixture field not discovered: ${system}.${path}`);
	return found;
}

async function cleanupFixtures(db) {
	await Promise.all(
		COLLECTIONS.map((collection) => db.collection(collection).deleteMany({ _astDiffFixture: true }))
	);
}

async function seedEdgeFixtures(db) {
	await cleanupFixtures(db);
	const d0 = new Date('2020-01-01T00:00:00.000Z');
	const d1 = new Date('2020-01-02T12:34:56.000Z');
	const d2 = new Date('2020-01-03T00:00:00.000Z');
	const marker = { _astDiffFixture: true };

	await db.collection('patient').insertMany([
		{ ...marker, patID: 'AST-P1', gender: 'w', birthDate: d0, tumorID: ['AST-T1', 'AST-T2'] },
		{ ...marker, patID: 'AST-P2', gender: 'm', birthDate: null, tumorID: ['AST-T3'] },
		{ ...marker, patID: 'AST-P3', gender: '', tumorID: ['AST-T4'] },
		{ ...marker, patID: 'AST-P4', gender: ' ', tumorID: ['AST-T5'] }
	]);

	await db.collection('diagnosis').insertMany([
		{
			...marker,
			patID: 'AST-P1',
			tumorID: 'AST-T1',
			diagnosisDate: d0,
			ICD: { ICD10: 'AST-C1', ICD10Text: 'edge_one' },
			ICDO_histologyCode: 'AST-H1',
			ICDO_histologyCodeText: 'edge_histology_one',
			grading_first: 'G1',
			ECOG: []
		},
		{
			...marker,
			patID: 'AST-P1',
			tumorID: 'AST-T2',
			diagnosisDate: d1,
			ICD: { ICD10: 'AST-C2', ICD10Text: '' },
			ICDO_histologyCode: 'AST-H2',
			ICDO_histologyCodeText: null,
			grading_first: null,
			ECOG: [null, '1']
		},
		{
			...marker,
			patID: 'AST-P2',
			tumorID: 'AST-T3',
			diagnosisDate: d2,
			ICD: { ICD10: 'AST-C1' },
			ICDO_histologyCode: '',
			grading_first: 'G2',
			ECOG: ['2']
		},
		{ ...marker, patID: 'AST-P3', tumorID: 'AST-T4', diagnosisDate: null, ICD: {} },
		{ ...marker, patID: 'AST-P4', tumorID: 'AST-T5' }
	]);

	await db.collection('histology').insertMany([
		{
			...marker,
			patID: 'AST-P1',
			tumorID: 'AST-T1',
			ICDO_histologyCode: 'AST-H1',
			ICDO_histologyCodeText: 'edge_primary',
			ICDO_source: 'diagnosis',
			ICDO_histologyDate: d0,
			ICDO_grading: 'G1'
		},
		{
			...marker,
			patID: 'AST-P1',
			tumorID: 'AST-T1',
			ICDO_histologyCode: 'AST-HX',
			ICDO_histologyCodeText: 'edge_other',
			ICDO_source: 'other',
			ICDO_histologyDate: d1,
			ICDO_grading: 'G3'
		},
		{
			...marker,
			patID: 'AST-P1',
			tumorID: 'AST-T2',
			ICDO_histologyCode: null,
			ICDO_source: 'other',
			ICDO_histologyDate: null,
			ICDO_grading: ''
		}
	]);

	await db.collection('therapy').insertMany([
		{
			...marker,
			patID: 'AST-P1',
			tumorID: 'AST-T1',
			therapyID: 'AST-TH1',
			status: 'edge-a',
			intention: 'edge-i',
			therapyOccurrenceDate: d0,
			ECOG: [],
			surgeon: [],
			metastasisResection: [],
			ops: [
				{ code: 'AST-OP-A', text: 'edge-one' },
				{ code: 'AST-OP-B', text: 'edge-two' }
			],
			complication: [
				{ code: 'AST-K-A', grade: '1' },
				{ code: 'AST-K-B', grade: '2' }
			],
			substance: [
				{ substance: 'edge_drug_one', ATCCode: 'AST-A' },
				{ substance: 'edge_drug_two', ATCCode: 'AST-B' }
			],
			radiation: [
				{ area: 'edge-area-a', side: 'left' },
				{ area: 'edge-area-b', side: 'right' }
			]
		},
		{
			...marker,
			patID: 'AST-P1',
			tumorID: 'AST-T1',
			therapyID: 'AST-TH2',
			status: 'edge-b',
			intention: 'edge-j',
			therapyOccurrenceDate: d1,
			ECOG: [null, '1'],
			surgeon: [null, 'edge_surgeon'],
			metastasisResection: [' '],
			ops: [{ code: 'AST-OP-C', text: 'edge-three' }]
		},
		{
			...marker,
			patID: 'AST-P1',
			tumorID: 'AST-T2',
			therapyID: 'AST-TH3',
			status: '',
			intention: null,
			therapyOccurrenceDate: d2,
			surgeon: ['edge_surgeon'],
			metastasisResection: ['edge_resection'],
			ops: []
		},
		{ ...marker, patID: 'AST-P2', tumorID: 'AST-T3', therapyID: 'AST-TH4' }
	]);

	await db.collection('status').insertMany([
		{ ...marker, patID: 'AST-P1', tumorID: 'AST-T1', status: 'edge-status', type: 'edge-type' },
		{ ...marker, patID: 'AST-P1', tumorID: 'AST-T1', status: 'other-status', type: 'other-type' },
		{ ...marker, patID: 'AST-P2', tumorID: 'AST-T3', status: null, type: '' }
	]);

	await db.collection('study').insertMany([
		{
			...marker,
			studyKey: 'ast-study-1',
			studyID: 'AST-S1',
			shortname: 'study_edge_one',
			status: 'edge-open',
			phase: null,
			start: d0
		},
		{
			...marker,
			studyKey: 'ast-study-2',
			studyID: 'AST-S2',
			shortname: 'study_edge_two',
			status: 'edge-closed',
			phase: '',
			start: null
		},
		{
			...marker,
			studyKey: 'ast-study-3',
			studyID: 'AST-S3',
			shortname: 'study_edge_empty',
			status: ' '
		}
	]);

	await db.collection('studyPatient').insertMany([
		{
			...marker,
			studyKey: 'ast-study-1',
			studyID: 'AST-S1',
			shortname: 'study_edge_one',
			patID: 'AST-P1',
			recruitmentDate: d0
		},
		{
			...marker,
			studyKey: 'ast-study-1',
			studyID: 'AST-S1',
			shortname: 'study_edge_one',
			patID: 'AST-P2',
			recruitmentDate: d1
		},
		{
			...marker,
			studyKey: 'ast-study-2',
			studyID: 'AST-S2',
			shortname: 'study_edge_two',
			patID: 'AST-P3',
			recruitmentDate: null
		}
	]);
}

async function loadCollections(db) {
	const entries = await Promise.all(
		COLLECTIONS.map(async (collection) => [
			collection,
			await db.collection(collection).find({}).toArray()
		])
	);
	return Object.fromEntries(entries);
}

function addCase(cases, item) {
	if (!item?.ast || !item?.target) return;
	cases.push(item);
}

function basicCases(fields) {
	const cases = [];
	for (const field of fields) {
		const observed = cloneAstValue(field.values[0]);
		const second = cloneAstValue(field.values[1] ?? field.values[0]);
		const sameTarget = field.system;
		const crossTarget = field.system === 'diagnosis' ? 'therapy' : 'diagnosis';
		const isDate = field.kinds.includes('date');

		if (!isDate) {
			addCase(cases, {
				name: `${field.system}.${field.path} equals observed locally`,
				category: 'field/equals/local',
				target: sameTarget,
				ast: rootOf([fieldGroup(field, 'EQUALS', [observed])])
			});
			addCase(cases, {
				name: `${field.system}.${field.path} equals observed across tumor`,
				category: 'field/equals/cross-system',
				target: crossTarget,
				ast: rootOf([fieldGroup(field, 'EQUALS', [observed])])
			});
		}
		addCase(cases, {
			name: `${field.system}.${field.path} empty locally`,
			category: 'field/empty/local',
			target: sameTarget,
			ast: rootOf([fieldGroup(field, 'EQUALS', ['-'])])
		});
		addCase(cases, {
			name: `${field.system}.${field.path} empty across tumor`,
			category: 'field/empty/cross-system',
			target: crossTarget,
			ast: rootOf([fieldGroup(field, 'EQUALS', ['-'])])
		});
		if (!isDate) {
			addCase(cases, {
				name: `${field.system}.${field.path} not observed locally`,
				category: 'field/nequals/local-keyed',
				target: sameTarget,
				ast: rootOf([fieldGroup(field, 'NEQUALS', [observed])])
			});
			addCase(cases, {
				name: `${field.system}.${field.path} not observed across tumor`,
				category: 'field/nequals/cross-system',
				target: crossTarget,
				ast: rootOf([fieldGroup(field, 'NEQUALS', [observed])])
			});
			if (field.system !== 'patient' && field.system !== 'study') {
				addCase(cases, {
					name: `${field.system}.${field.path} equals observed on patient cohort`,
					category: 'field/equals/patient-cohort',
					target: 'patient',
					ast: rootOf([fieldGroup(field, 'EQUALS', [observed])])
				});
			}
		}

		if (!isDate && field.values.length > 1) {
			addCase(cases, {
				name: `${field.system}.${field.path} OR values locally`,
				category: 'field/or-values/local',
				target: sameTarget,
				ast: rootOf([fieldGroup(field, 'EQUALS', [observed, second])])
			});
		}

		if (field.kinds.includes('number') || field.kinds.includes('date')) {
			const values = field.values
				.map(asComparable)
				.filter(Number.isFinite)
				.sort((a, b) => a - b);
			if (values.length > 0) {
				const min = values[0];
				const max = values.at(-1);
				addCase(cases, {
					name: `${field.system}.${field.path} closed range locally`,
					category: 'field/between/closed',
					target: sameTarget,
					ast: rootOf([fieldGroup(field, 'BETWEEN', [{ min, max }])])
				});
				addCase(cases, {
					name: `${field.system}.${field.path} open lower date/number range`,
					category: 'field/between/open-bound',
					target: sameTarget,
					ast: rootOf([fieldGroup(field, 'BETWEEN', [{ min: null, max }])])
				});
				addCase(cases, {
					name: `${field.system}.${field.path} missing range`,
					category: 'field/between/missing',
					target: sameTarget,
					ast: rootOf([fieldGroup(field, 'BETWEEN', [{ min: null, max: null }])])
				});
				addCase(cases, {
					name: `${field.system}.${field.path} closed negated range locally`,
					category: 'field/nbetween/closed',
					target: sameTarget,
					ast: rootOf([fieldGroup(field, 'NBETWEEN', [{ min, max }])])
				});
				addCase(cases, {
					name: `${field.system}.${field.path} closed range across tumor`,
					category: 'field/between/cross-system',
					target: crossTarget,
					ast: rootOf([fieldGroup(field, 'BETWEEN', [{ min, max }])])
				});
			}
		}
	}
	return cases;
}

function specialCases(fields) {
	const cases = [];
	const diagCode = descriptor(fields, 'diagnosis', 'ICD.ICD10');
	const diagDate = descriptor(fields, 'diagnosis', 'diagnosisDate');
	const diagIcdo = descriptor(fields, 'diagnosis', 'ICDO_histologyCode');
	const diagGrade = descriptor(fields, 'diagnosis', 'grading_first');
	const histCode = descriptor(fields, 'histology', 'ICDO_histologyCode');
	const histSource = descriptor(fields, 'histology', 'ICDO_source');
	const therapyStatus = descriptor(fields, 'therapy', 'status');
	const therapyIntention = descriptor(fields, 'therapy', 'intention');
	const therapyDate = descriptor(fields, 'therapy', 'therapyOccurrenceDate');
	const surgeon = descriptor(fields, 'therapy', 'surgeon');
	const opsCode = descriptor(fields, 'therapy', 'ops.code');
	const opsText = descriptor(fields, 'therapy', 'ops.text');
	const complicationCode = descriptor(fields, 'therapy', 'complication.code');
	const complicationGrade = descriptor(fields, 'therapy', 'complication.grade');
	const studyStatus = descriptor(fields, 'study', 'status');
	const studyShortname = descriptor(fields, 'study', 'shortname');
	const studyPat = descriptor(fields, 'studyPatient', 'patID');
	const studyRecruitment = descriptor(fields, 'studyPatient', 'recruitmentDate');
	const patientGender = descriptor(fields, 'patient', 'gender');

	const keyedNegation = rootOf([fieldGroup(therapyStatus, 'NEQUALS', ['edge-a'])]);
	const unkeyedNegation = rootOf([
		fieldGroup(therapyStatus, 'NEQUALS', ['edge-a'], { keyed: false })
	]);
	addCase(cases, {
		name: 'keyed NEQUALS excludes the selected value',
		category: 'negation/keyed',
		target: 'therapy',
		ast: keyedNegation
	});
	addCase(cases, {
		name: 'filter-editor-shaped unkeyed NEQUALS excludes the selected value',
		category: 'negation/unkeyed-editor-shape',
		target: 'therapy',
		ast: unkeyedNegation
	});

	for (const field of [surgeon, descriptor(fields, 'diagnosis', 'ECOG')]) {
		addCase(cases, {
			name: `${field.system}.${field.path} empty arrays count as empty`,
			category: 'array/empty-array',
			target: field.system,
			ast: rootOf([fieldGroup(field, 'EQUALS', ['-'])])
		});
		addCase(cases, {
			name: `${field.system}.${field.path} NEQUALS empty requires a present non-empty value`,
			category: 'array/non-empty',
			target: field.system,
			ast: rootOf([fieldGroup(field, 'NEQUALS', ['-'])])
		});
	}

	addCase(cases, {
		name: 'nested ops AND must match one array element',
		category: 'array/same-element-and',
		target: 'therapy',
		ast: rootOf([
			fieldGroup(opsCode, 'EQUALS', ['AST-OP-A']),
			fieldGroup(opsText, 'EQUALS', ['edge-two'])
		])
	});
	addCase(cases, {
		name: 'nested complication AND must match one array element',
		category: 'array/same-element-and',
		target: 'therapy',
		ast: rootOf([
			fieldGroup(complicationCode, 'EQUALS', ['AST-K-A']),
			fieldGroup(complicationGrade, 'EQUALS', ['2'])
		])
	});

	addCase(cases, {
		name: 'foreign therapy AND requires the same therapy row',
		category: 'join/same-entry-and',
		target: 'diagnosis',
		ast: rootOf([
			fieldGroup(therapyStatus, 'EQUALS', ['edge-a']),
			fieldGroup(therapyIntention, 'EQUALS', ['edge-j'])
		])
	});
	addCase(cases, {
		name: 'cross-system AND requires the same tumor',
		category: 'join/same-tumor-and',
		target: 'patient',
		ast: rootOf([
			fieldGroup(diagCode, 'EQUALS', ['AST-C1']),
			fieldGroup(therapyStatus, 'EQUALS', ['edge-b'])
		])
	});

	addCase(cases, {
		name: 'flat diagnosis ICDO field remains flat',
		category: 'histology/flat-icdo',
		target: 'diagnosis',
		ast: rootOf([fieldGroup(diagIcdo, 'EQUALS', ['AST-H1'])])
	});
	addCase(cases, {
		name: 'flat diagnosis grading aggregate remains flat',
		category: 'histology/flat-grading',
		target: 'diagnosis',
		ast: rootOf([fieldGroup(diagGrade, 'EQUALS', ['G1'])])
	});
	addCase(cases, {
		name: 'separate histology collection joins to diagnosis',
		category: 'histology/cross-collection',
		target: 'diagnosis',
		ast: rootOf([
			fieldGroup(histCode, 'EQUALS', ['AST-HX']),
			fieldGroup(histSource, 'EQUALS', ['other'])
		])
	});

	addCase(cases, {
		name: 'date lower-only interval',
		category: 'date/open-lower',
		target: 'diagnosis',
		ast: rootOf([
			fieldGroup(diagDate, 'BETWEEN', [{ min: Date.parse('2020-01-02T00:00:00.000Z'), max: null }])
		])
	});
	addCase(cases, {
		name: 'date upper-only interval',
		category: 'date/open-upper',
		target: 'therapy',
		ast: rootOf([
			fieldGroup(therapyDate, 'BETWEEN', [
				{ min: null, max: Date.parse('2020-01-02T23:59:59.999Z') }
			])
		])
	});
	addCase(cases, {
		name: 'date NBETWEEN open interval',
		category: 'date/negated-open-bound',
		target: 'diagnosis',
		ast: rootOf([
			fieldGroup(diagDate, 'NBETWEEN', [{ min: Date.parse('2020-01-02T00:00:00.000Z'), max: null }])
		])
	});

	addCase(cases, {
		name: 'study underscore value is not rewritten',
		category: 'study/value-preservation',
		target: 'studyPatient',
		ast: rootOf([fieldGroup(studyShortname, 'EQUALS', ['study_edge_one'])])
	});
	addCase(cases, {
		name: 'study-patient nested date and patient stay on the same row',
		category: 'study/same-patient-entry',
		target: 'studyPatient',
		ast: rootOf([
			fieldGroup(studyPat, 'EQUALS', ['AST-P1']),
			fieldGroup(studyRecruitment, 'BETWEEN', [
				{
					min: Date.parse('2020-01-02T00:00:00.000Z'),
					max: Date.parse('2020-01-02T23:59:59.999Z')
				}
			])
		])
	});
	addCase(cases, {
		name: 'mixed study and diagnosis OR keeps participation-row semantics',
		category: 'study/mixed-or',
		target: 'studyPatient',
		ast: logical('OR', [
			fieldGroup(studyStatus, 'EQUALS', ['edge-closed']),
			fieldGroup(diagCode, 'EQUALS', ['AST-C1'])
		])
	});
	addCase(cases, {
		name: 'mixed study, patient and tumor AND',
		category: 'study/mixed-and',
		target: 'studyPatient',
		ast: logical('AND', [
			fieldGroup(studyStatus, 'EQUALS', ['edge-open']),
			fieldGroup(patientGender, 'EQUALS', ['w']),
			fieldGroup(diagIcdo, 'EQUALS', ['AST-H2'])
		])
	});
	addCase(cases, {
		name: 'study patient cross-system AND requires the same tumor',
		category: 'study/same-tumor-and',
		target: 'studyPatient',
		ast: logical('AND', [
			fieldGroup(diagCode, 'EQUALS', ['AST-C2']),
			fieldGroup(therapyStatus, 'EQUALS', ['edge-a'])
		])
	});
	addCase(cases, {
		name: 'study metadata plus cross-system AND still requires the same tumor',
		category: 'study/mixed-same-tumor-and',
		target: 'studyPatient',
		ast: logical('AND', [
			fieldGroup(studyStatus, 'EQUALS', ['edge-open']),
			fieldGroup(diagCode, 'EQUALS', ['AST-C2']),
			fieldGroup(therapyStatus, 'EQUALS', ['edge-a'])
		])
	});
	addCase(cases, {
		name: 'study NOR handles row-level complements',
		category: 'study/nor',
		target: 'studyPatient',
		ast: logical('NOR', [
			fieldGroup(studyStatus, 'EQUALS', ['edge-closed']),
			fieldGroup(diagCode, 'EQUALS', ['AST-C2'])
		])
	});
	addCase(cases, {
		name: 'study XOR handles exactly one matching branch',
		category: 'study/xor',
		target: 'studyPatient',
		ast: logical('XOR', [
			fieldGroup(studyStatus, 'EQUALS', ['edge-open']),
			fieldGroup(diagCode, 'EQUALS', ['AST-C1'])
		])
	});

	return cases;
}

const nestedScalar = (value, relativePath) =>
	String(relativePath)
		.split('.')
		.reduce((current, part) => current?.[part], value);

const sameScalar = (left, right) => {
	if (left instanceof Date || right instanceof Date) {
		return new Date(left).getTime() === new Date(right).getTime();
	}
	return left === right;
};

function sameArrayEntryCases(fields, collections) {
	const cases = [];
	const byArray = new Map();
	for (const field of fields) {
		if (!field.arrayPrefix || !field.path.startsWith(`${field.arrayPrefix}.`)) continue;
		const key = `${field.system}:${field.arrayPrefix}`;
		if (!byArray.has(key)) byArray.set(key, []);
		byArray.get(key).push(field);
	}

	for (const [key, arrayFields] of byArray.entries()) {
		if (arrayFields.length < 2) continue;
		const [system, arrayPrefix] = key.split(':', 2);
		let added = 0;
		for (const document of collections[system] ?? []) {
			const array = nestedScalar(document, arrayPrefix);
			if (!Array.isArray(array) || array.length < 2) continue;
			for (let leftIndex = 0; leftIndex < arrayFields.length; leftIndex += 1) {
				for (let rightIndex = leftIndex + 1; rightIndex < arrayFields.length; rightIndex += 1) {
					const leftField = arrayFields[leftIndex];
					const rightField = arrayFields[rightIndex];
					const leftRelative = leftField.path.slice(arrayPrefix.length + 1);
					const rightRelative = rightField.path.slice(arrayPrefix.length + 1);
					const leftValue = nestedScalar(array[0], leftRelative);
					const rightValue = nestedScalar(array[1], rightRelative);
					if (leftValue == null || rightValue == null) continue;
					const collision = array.some(
						(item) =>
							sameScalar(nestedScalar(item, leftRelative), leftValue) &&
							sameScalar(nestedScalar(item, rightRelative), rightValue)
					);
					if (collision) continue;

					const ast = rootOf([
						fieldGroup(leftField, 'EQUALS', [cloneAstValue(leftValue)]),
						fieldGroup(rightField, 'EQUALS', [cloneAstValue(rightValue)])
					]);
					addCase(cases, {
						name: `${system}.${arrayPrefix} generated same-element collision ${added + 1}`,
						category: 'array/generated-same-element-and',
						target: system === 'study' ? 'studyPatient' : system,
						ast
					});
					if (system === 'study') {
						addCase(cases, {
							name: `study.${arrayPrefix} generic study same-element collision`,
							category: 'study/generic-same-patient-entry',
							target: 'study',
							ast
						});
					}
					added += 1;
					if (added >= 2) break;
				}
				if (added >= 2) break;
			}
			if (added >= 2) break;
		}
	}

	return cases;
}

function randomComparison(random, field) {
	const observed = cloneAstValue(choose(random, field.values));
	const rangeCapable = field.kinds.includes('number') || field.kinds.includes('date');
	if (rangeCapable && random() < 0.45) {
		const point = asComparable(choose(random, field.values));
		const width = field.kinds.includes('date') ? 86400000 * (1 + Math.floor(random() * 30)) : 3;
		const open = random();
		const value = {
			min: open < 0.2 ? null : point - width,
			max: open >= 0.2 && open < 0.4 ? null : point + width
		};
		return fieldGroup(field, random() < 0.25 ? 'NBETWEEN' : 'BETWEEN', [value], {
			keyed: random() >= 0.15
		});
	}

	const requested = random() < 0.2 ? '-' : observed;
	const negated = random() < 0.25;
	return fieldGroup(field, negated ? 'NEQUALS' : 'EQUALS', [requested], {
		keyed: !negated || random() >= 0.15
	});
}

function cleanRandomComparison(random, field) {
	const isDate = field.kinds.includes('date');
	const isNumber = field.kinds.includes('number');
	if ((isDate && field.path.toLowerCase().includes('date')) || isNumber) {
		const numericValues = field.values.map(asComparable).filter(Number.isFinite);
		if (numericValues.length > 0) {
			const point = choose(random, numericValues);
			const width = isDate ? 86400000 * 30 : Math.max(1, Math.abs(point) * 0.1);
			return fieldGroup(field, 'BETWEEN', [{ min: point - width, max: point + width }]);
		}
	}
	return fieldGroup(field, 'EQUALS', [cloneAstValue(choose(random, field.values))]);
}

function cleanFuzzCases(fields, count, seed) {
	const random = seededRandom(seed);
	const candidates = fields.filter(
		(field) =>
			field.system !== 'study' &&
			(!field.path.includes('_') || field.path.startsWith('ICDO_')) &&
			(!field.kinds.includes('date') || field.path.toLowerCase().includes('date'))
	);
	const targets = ['diagnosis', 'therapy', 'histology', 'patient'];
	const cases = [];

	for (let index = 0; index < count; index += 1) {
		const operand = choose(random, ['AND', 'OR', 'NOR', 'XOR']);
		const branchCount = operand === 'XOR' ? 2 : 2 + Math.floor(random() * 3);
		const picked = [];
		const usedArrayPrefixes = new Set();
		for (const field of shuffle(random, candidates)) {
			if (field.arrayPrefix && usedArrayPrefixes.has(`${field.system}:${field.arrayPrefix}`)) {
				continue;
			}
			picked.push(field);
			if (field.arrayPrefix) usedArrayPrefixes.add(`${field.system}:${field.arrayPrefix}`);
			if (picked.length === branchCount) break;
		}
		addCase(cases, {
			name: `clean seeded fuzz ${index + 1}`,
			category: `fuzz-clean/${operand.toLowerCase()}`,
			target: choose(random, targets),
			ast: logical(
				operand,
				picked.map((field) => cleanRandomComparison(random, field))
			)
		});
	}

	return cases;
}

function fuzzCases(fields, count, seed) {
	const random = seededRandom(seed);
	const candidates = fields.filter((field) => !['study'].includes(field.system));
	const cases = [];
	const targets = ['diagnosis', 'therapy', 'histology', 'patient'];
	for (let index = 0; index < count; index += 1) {
		const branchCount = 2 + Math.floor(random() * 3);
		const picked = shuffle(random, candidates).slice(0, branchCount);
		const operand = choose(random, ['AND', 'OR', 'NOR', 'XOR']);
		addCase(cases, {
			name: `seeded fuzz ${index + 1}`,
			category: `fuzz-edge/${operand.toLowerCase()}`,
			target: choose(random, targets),
			ast: logical(
				operand,
				picked.map((field) => randomComparison(random, field))
			)
		});
	}
	return cases;
}

function expectedIds(model, collections, testCase, fieldPathMap) {
	const ast = normalizeCaseAst(testCase.ast, fieldPathMap);
	if (testCase.target === 'studyPatient') {
		return model
			.studyPatientRows()
			.filter((row) => model.evaluateStudyPatient(row, ast))
			.map(studyPatientRowId)
			.sort();
	}

	const documents = collections[testCase.target] ?? [];
	return documents
		.filter((document) =>
			testCase.target === 'patient'
				? model.evaluatePatient(document, ast)
				: model.evaluateTargetDocument(document, testCase.target, ast)
		)
		.map((document) => String(document._id))
		.sort();
}

const studyPatientRowId = (row) => {
	const studyPatient = row.studyPatient ?? row.studyPatients;
	if (studyPatient?._id != null) return String(studyPatient._id);
	const study = row.study ?? row;
	const date = studyPatient?.recruitmentDate;
	const normalizedDate = date instanceof Date ? date.toISOString() : String(date ?? '');
	return `${study._id}|${studyPatient?.patID ?? ''}|${normalizedDate}`;
};

async function withMutedTranslatorLogs(callback) {
	const originalLog = console.log;
	const originalDir = console.dir;
	console.log = () => {};
	console.dir = () => {};
	try {
		return await callback();
	} finally {
		console.log = originalLog;
		console.dir = originalDir;
	}
}

async function actualIds(db, testCase) {
	return withMutedTranslatorLogs(async () => {
		if (testCase.target === 'studyPatient') {
			const parsed = parseAstFilter(JSON.stringify(testCase.ast));
			if (!parsed) throw new Error('study AST parser returned null');
			const match = await filterAstToParticipationMatch(
				parsed,
				{
					patient: 'patient',
					diagnosis: 'diagnosis',
					study: 'study',
					studyPatient: 'studyPatient'
				},
				db
			);
			const pipeline = [];
			if (match) pipeline.push({ $match: match });
			const documents = await db.collection('studyPatient').aggregate(pipeline).toArray();
			return documents.map((document) => studyPatientRowId({ studyPatient: document })).sort();
		}

		const pipeline = await filter2match({
			value: JSON.stringify(testCase.ast),
			column: testCase.target,
			db
		});
		pipeline.push({ $project: { _id: 1 } });
		const documents = await db.collection(testCase.target).aggregate(pipeline).toArray();
		return documents.map((document) => String(document._id)).sort();
	});
}

const difference = (left, right) => {
	const rightSet = new Set(right);
	return left.filter((value) => !rightSet.has(value));
};

const summarizeInventory = (fields) => {
	const perSystem = {};
	const arrays = [];
	for (const field of fields) {
		perSystem[field.system] = (perSystem[field.system] ?? 0) + 1;
		if (field.arrayPrefix || ARRAY_FIELDS.has(field.path)) {
			arrays.push(`${field.system}.${field.path}`);
		}
	}
	return { fieldCount: fields.length, perSystem, arrayFields: [...new Set(arrays)].sort() };
};

async function run() {
	const client = new MongoClient(config.address);
	const startedAt = Date.now();
	let db;
	try {
		await client.connect();
		db = client.db(config.dbName);
		if (config.seedFixtures) await seedEdgeFixtures(db);

		const collections = await loadCollections(db);
		const fields = discoverFields(collections);
		const fieldPathMap = buildFieldPathMap(fields);
		const model = new ReferenceModel(collections);
		const generated = [
			...specialCases(fields),
			...sameArrayEntryCases(fields, collections),
			...basicCases(fields),
			...cleanFuzzCases(fields, Math.floor(config.fuzzCases / 2), config.seed),
			...fuzzCases(fields, Math.ceil(config.fuzzCases / 2), config.seed ^ 0x9e3779b9)
		];
		const seen = new Set();
		const cases = generated
			.filter((testCase) => {
				const signature = `${testCase.target}:${JSON.stringify(testCase.ast)}`;
				if (seen.has(signature)) return false;
				seen.add(signature);
				return true;
			})
			.slice(0, config.caseLimit || undefined);

		console.log(
			`AST differential: ${cases.length} cases, ${fields.length} materialized fields, seed ${config.seed}`
		);

		const failures = [];
		const categoryStats = {};
		const slowestCases = [];
		let passed = 0;
		let errors = 0;

		for (let index = 0; index < cases.length; index += 1) {
			const testCase = cases[index];
			const caseStartedAt = Date.now();
			const stats = (categoryStats[testCase.category] ??= { passed: 0, failed: 0, errors: 0 });
			let expected = [];
			let actual = [];
			let error = null;
			try {
				expected = expectedIds(model, collections, testCase, fieldPathMap);
				actual = await actualIds(db, testCase);
			} catch (caught) {
				error = caught instanceof Error ? `${caught.name}: ${caught.message}` : String(caught);
			}

			let failed = false;
			if (error) {
				errors += 1;
				stats.errors += 1;
			} else if (
				expected.length === actual.length &&
				expected.every((value, valueIndex) => value === actual[valueIndex])
			) {
				passed += 1;
				stats.passed += 1;
			} else {
				stats.failed += 1;
				failed = true;
			}

			const durationMs = Date.now() - caseStartedAt;
			slowestCases.push({ name: testCase.name, category: testCase.category, durationMs });
			slowestCases.sort((left, right) => right.durationMs - left.durationMs);
			if (slowestCases.length > 20) slowestCases.length = 20;

			if ((error || failed) && failures.length < config.maxFailureDetails) {
				failures.push({
					index: index + 1,
					name: testCase.name,
					category: testCase.category,
					target: testCase.target,
					ast: testCase.ast,
					error,
					durationMs,
					expectedCount: expected.length,
					actualCount: actual.length,
					missingFromActual: difference(expected, actual).slice(0, 25),
					unexpectedActual: difference(actual, expected).slice(0, 25)
				});
			}

			if (config.progressEvery && (index + 1) % config.progressEvery === 0) {
				console.log(
					`  ${index + 1}/${cases.length}: passed=${passed}, mismatched=${
						index + 1 - passed - errors
					}, errors=${errors}`
				);
			}
		}

		const mismatched = cases.length - passed - errors;
		const report = {
			generatedAt: new Date().toISOString(),
			database: config.dbName,
			seed: config.seed,
			durationMs: Date.now() - startedAt,
			summary: { total: cases.length, passed, mismatched, errors },
			inventory: summarizeInventory(fields),
			collectionCounts: Object.fromEntries(
				Object.entries(collections).map(([name, documents]) => [name, documents.length])
			),
			categoryStats,
			slowestCases,
			failures,
			notes: [
				'Expected IDs come from the independent in-memory reference evaluator.',
				'Actual IDs come from the real astTranslator Mongo aggregation pipeline.',
				'Synthetic documents are isolated, marked with _astDiffFixture, and removed after the run.'
			]
		};

		await writeFile(config.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
		console.log(
			`AST differential complete: passed=${passed}, mismatched=${mismatched}, errors=${errors}, report=${config.reportPath}`
		);
		if (mismatched || errors) process.exitCode = 1;
	} finally {
		if (db && config.seedFixtures && !config.keepFixtures) await cleanupFixtures(db);
		if (db && config.dropDatabase) await db.dropDatabase();
		await client.close();
	}
}

await run();

export { NULL_AST, basicCases, discoverFields, specialCases };
