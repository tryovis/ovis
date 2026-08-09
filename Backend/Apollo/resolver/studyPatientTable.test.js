const assert = require('node:assert/strict');
const test = require('node:test');

const {
	buildStudyOverviewAggregation,
	buildStudyPatientCountAggregation,
	buildStudyPatientTableAggregation,
	getStudyOverview,
	getStudyOverviewCount,
	getStudyPatientCount,
	getStudyPatientTable
} = require('./studyPatientTable');

const emptyFilter = '{"operand":"OR","children":[]}';

const studies = [
	{
		_id: 's1',
		studyKey: 'study-1',
		studyID: '004902',
		shortname: 'HOLOSURGE',
		status: 'open'
	},
	{
		_id: 's2',
		studyKey: 'study-2',
		studyID: '004595',
		shortname: 'LIVER-R',
		status: 'closed'
	},
	{
		_id: 's3',
		studyKey: 'study-3',
		studyID: '009999',
		shortname: 'EMPTY',
		status: 'planned'
	}
];

const studyPatients = [
	{
		_id: 'sp1',
		studyKey: 'study-1',
		studyID: '004902',
		shortname: 'HOLOSURGE',
		patID: 'p1',
		recruitmentDate: 3
	},
	{
		_id: 'sp2',
		studyKey: 'study-1',
		studyID: '004902',
		shortname: 'HOLOSURGE',
		patID: 'p2',
		recruitmentDate: 2
	},
	{
		_id: 'sp3',
		studyKey: 'study-1',
		studyID: '004902',
		shortname: 'HOLOSURGE',
		patID: 'p3',
		recruitmentDate: 1
	},
	{
		_id: 'sp4',
		studyKey: 'study-2',
		studyID: '004595',
		shortname: 'LIVER-R',
		patID: 'p4',
		recruitmentDate: 4
	}
];

const patients = [
	{ patID: 'p1', tumorID: ['t1', 't2'] },
	{ patID: 'p2', tumorID: ['t2'] },
	{ patID: 'p3', tumorID: ['t3'] },
	{ patID: 'p4', tumorID: ['t4'] }
];

const diagnosis = [
	{ patID: 'p1', tumorID: 't1', ICD: { ICD10: 'C25' }, grading: 'G1' },
	{ patID: 'p1', tumorID: 't2', ICD: { ICD10: 'C34' } },
	{ patID: 'p3', tumorID: 't3', ICD: { ICD10: 'C25' } },
	{ patID: 'p3', tumorID: 't3', ICD: { ICD10: 'C18' }, grading: 'G1' },
	{ patID: 'p4', tumorID: 't4', ICD: { ICD10: 'C18' } }
];

const therapy = [
	{ patID: 'p1', tumorID: 't1', status: 'same-tumor' },
	{ patID: 'p1', tumorID: 't2', status: 'other-tumor' }
];

const getValue = (doc, path) => path.split('.').reduce((acc, key) => acc?.[key], doc);

const arrayIntersects = (left, right) => {
	const leftValues = Array.isArray(left) ? left : [left];
	return leftValues.some((value) => right.includes(value));
};

const matchesCondition = (value, condition) => {
	if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
		if ('$in' in condition) return arrayIntersects(value, condition.$in);
		if ('$nin' in condition) return !arrayIntersects(value, condition.$nin);
		if ('$eq' in condition) return value === condition.$eq;
		if ('$exists' in condition)
			return condition.$exists ? value !== undefined : value === undefined;
		if ('$regex' in condition) {
			const flags = condition.$options || '';
			return new RegExp(condition.$regex, flags).test(String(value ?? ''));
		}
	}

	return value === condition;
};

const matches = (doc, query = {}, variables = {}) =>
	Object.entries(query).every(([key, condition]) => {
		if (key === '$and') return condition.every((sub) => matches(doc, sub, variables));
		if (key === '$or') return condition.some((sub) => matches(doc, sub, variables));
		if (key === '$nor') return condition.every((sub) => !matches(doc, sub, variables));
		if (key === '$expr') return Boolean(readExpr(doc, condition, variables));

		return matchesCondition(getValue(doc, key), condition);
	});

const readExpr = (doc, expr, variables = {}) => {
	if (typeof expr === 'string' && expr.startsWith('$$')) return variables[expr.slice(2)];
	if (typeof expr === 'string' && expr.startsWith('$')) return getValue(doc, expr.slice(1));
	if (expr && typeof expr === 'object' && '$toString' in expr) {
		return String(readExpr(doc, expr.$toString, variables));
	}
	if (expr && typeof expr === 'object' && '$concat' in expr) {
		return expr.$concat.map((part) => readExpr(doc, part, variables)).join('');
	}
	if (expr && typeof expr === 'object' && '$ifNull' in expr) {
		const [value, fallback] = expr.$ifNull;
		const resolved = readExpr(doc, value, variables);
		return resolved == null ? readExpr(doc, fallback, variables) : resolved;
	}
	if (expr && typeof expr === 'object' && '$size' in expr) {
		return readExpr(doc, expr.$size, variables).length;
	}
	if (expr && typeof expr === 'object' && '$eq' in expr) {
		const [left, right] = expr.$eq;
		return readExpr(doc, left, variables) === readExpr(doc, right, variables);
	}
	return expr;
};

const projectDoc = (doc, projection) =>
	Object.fromEntries(
		Object.entries(projection).map(([key, expr]) => [
			key,
			expr === 1 ? doc[key] : readExpr(doc, expr)
		])
	);

const compareValues = (left, right, direction) => {
	if (left === right) return 0;
	return left > right ? direction : -direction;
};

const runPipeline = (docs, pipeline, collections, variables = {}) =>
	pipeline.reduce((current, stage) => {
		if (stage.$match) return current.filter((doc) => matches(doc, stage.$match, variables));
		if (stage.$lookup) {
			return current.map((doc) => {
				const lookupVariables = Object.fromEntries(
					Object.entries(stage.$lookup.let ?? {}).map(([key, expr]) => [
						key,
						readExpr(doc, expr, variables)
					])
				);
				return {
					...doc,
					[stage.$lookup.as]: runPipeline(
						collections[stage.$lookup.from] ?? [],
						stage.$lookup.pipeline ?? [],
						collections,
						lookupVariables
					)
				};
			});
		}
		if (stage.$unwind) {
			const path = (typeof stage.$unwind === 'string' ? stage.$unwind : stage.$unwind.path).slice(
				1
			);
			return current.flatMap((doc) =>
				(getValue(doc, path) || []).map((entry) => ({ ...doc, [path]: entry }))
			);
		}
		if (stage.$project) return current.map((doc) => projectDoc(doc, stage.$project));
		if (stage.$set) {
			return current.map((doc) => ({
				...doc,
				...Object.fromEntries(
					Object.entries(stage.$set).map(([key, expr]) => [key, readExpr(doc, expr, variables)])
				)
			}));
		}
		if (stage.$sort) {
			const entries = Object.entries(stage.$sort);
			return [...current].sort((left, right) => {
				for (const [field, direction] of entries) {
					const compared = compareValues(getValue(left, field), getValue(right, field), direction);
					if (compared !== 0) return compared;
				}
				return 0;
			});
		}
		if (stage.$skip) return current.slice(stage.$skip);
		if (stage.$limit) return current.slice(0, stage.$limit);
		if (stage.$count) return [{ [stage.$count]: current.length }];
		if (stage.$group?.ids?.$addToSet) {
			const field = stage.$group.ids.$addToSet.slice(1);
			return [{ _id: null, ids: [...new Set(current.map((doc) => getValue(doc, field)).flat())] }];
		}
		if (stage.$group?.ts?.$addToSet) {
			const field = stage.$group.ts.$addToSet.slice(1);
			return [{ _id: null, ts: [...new Set(current.map((doc) => getValue(doc, field)).flat())] }];
		}
		throw new Error(`Unsupported test pipeline stage: ${JSON.stringify(stage)}`);
	}, docs);

const makeDb = () => {
	const collections = {
		study: studies,
		studyPatient: studyPatients,
		patient: patients,
		diagnosis,
		therapy
	};
	return {
		collection(name) {
			const docs = collections[name] ?? [];
			return {
				distinct(field, query = {}) {
					return Promise.resolve([
						...new Set(
							docs
								.filter((doc) => matches(doc, query))
								.map((doc) => getValue(doc, field))
								.flat()
						)
					]);
				},
				aggregate(pipeline) {
					const result = runPipeline(docs, pipeline, collections);
					return {
						next: () => Promise.resolve(result[0]),
						toArray: () => Promise.resolve(result)
					};
				}
			};
		}
	};
};

const context = () => ({
	collections: { study: 'study', studyPatient: 'studyPatient', patient: 'patient' },
	db: makeDb()
});

const filterValue = (children, operand = 'OR') => JSON.stringify({ operand, children });

test('buildStudyPatientTableAggregation pages the materialized participation collection directly', async () => {
	const stages = await buildStudyPatientTableAggregation(
		{
			filter: emptyFilter,
			offset: 20,
			limit: 10,
			sortField: 'recruitmentDate',
			sortDirection: 'desc',
			columnFilters: [{ field: 'patID', value: '0022' }]
		},
		{ study: 'study', studyPatient: 'studyPatient', patient: 'patient' },
		{}
	);

	const unwindIndex = stages.findIndex((stage) => stage.$unwind);
	const projectIndex = stages.findIndex((stage) => stage.$project?.patID === 1);
	const matchIndex = stages.findIndex((stage) => stage.$match?.patID);
	const sortIndex = stages.findIndex((stage) => stage.$sort?.recruitmentDate);
	const skipIndex = stages.findIndex((stage) => stage.$skip === 20);
	const limitIndex = stages.findIndex((stage) => stage.$limit === 10);

	assert.equal(unwindIndex, -1);
	assert.ok(projectIndex < matchIndex);
	assert.ok(matchIndex < sortIndex);
	assert.ok(sortIndex < skipIndex);
	assert.ok(skipIndex < limitIndex);
});

test('buildStudyPatientCountAggregation counts materialized participation rows', async () => {
	const stages = await buildStudyPatientCountAggregation(
		{
			filter: emptyFilter,
			columnFilters: [{ field: 'shortname', value: 'HOLOSURGE' }]
		},
		{ study: 'study', studyPatient: 'studyPatient', patient: 'patient' },
		{}
	);

	const unwindIndex = stages.findIndex((stage) => stage.$unwind);
	const projectIndex = stages.findIndex((stage) => stage.$project?.shortname === 1);
	const matchIndex = stages.findIndex((stage) => stage.$match?.shortname);
	const countIndex = stages.findIndex((stage) => stage.$count === 'count');

	assert.equal(unwindIndex, -1);
	assert.ok(projectIndex < matchIndex);
	assert.ok(matchIndex < countIndex);
});

test('getStudyPatientTable pages materialized study-patient rows', async () => {
	const rows = await getStudyPatientTable(
		{
			filter: emptyFilter,
			offset: 1,
			limit: 2,
			sortField: 'recruitmentDate',
			sortDirection: 'desc',
			columnFilters: []
		},
		context()
	);

	assert.deepEqual(
		rows.map((row) => row.patID),
		['p1', 'p2']
	);
});

test('getStudyPatientCount counts all materialized rows without a filter', async () => {
	const count = await getStudyPatientCount({ filter: emptyFilter, columnFilters: [] }, context());

	assert.equal(count, 4);
});

test('study filters are applied before materialized participation paging', async () => {
	const rows = await getStudyPatientTable(
		{
			filter: filterValue([{ key: 'status', type: 'EQUALS', system: 'study', value: 'open' }]),
			limit: 20,
			columnFilters: []
		},
		context()
	);

	assert.deepEqual(rows.map((row) => row.patID).sort(), ['p1', 'p2', 'p3']);
});

test('diagnosis filters match study-patient rows by patient id instead of study tumor fields', async () => {
	const input = {
		filter: filterValue([{ key: 'ICD.ICD10', type: 'EQUALS', system: 'diagnosis', value: 'C25' }]),
		limit: 20,
		columnFilters: []
	};

	const [rows, count] = await Promise.all([
		getStudyPatientTable(input, context()),
		getStudyPatientCount(input, context())
	]);

	assert.deepEqual(rows.map((row) => row.patID).sort(), ['p1', 'p3']);
	assert.equal(count, 2);
});

test('patient filters match only the selected study-patient row', async () => {
	const rows = await getStudyPatientTable(
		{
			filter: filterValue([{ key: 'patID', type: 'EQUALS', system: 'patient', value: 'p2' }]),
			limit: 20,
			columnFilters: []
		},
		context()
	);

	assert.deepEqual(
		rows.map((row) => row.patID),
		['p2']
	);
});

test('mixed study and diagnosis filters preserve row-level OR semantics', async () => {
	const rows = await getStudyPatientTable(
		{
			filter: filterValue([
				{ key: 'status', type: 'EQUALS', system: 'study', value: 'closed' },
				{ key: 'ICD.ICD10', type: 'EQUALS', system: 'diagnosis', value: 'C25' }
			]),
			limit: 20,
			columnFilters: []
		},
		context()
	);

	assert.deepEqual(rows.map((row) => row.patID).sort(), ['p1', 'p3', 'p4']);
});

test('diagnosis subtrees preserve same-entry AND semantics before matching study-patient rows', async () => {
	const rows = await getStudyPatientTable(
		{
			filter: filterValue(
				[
					{ key: 'ICD.ICD10', type: 'EQUALS', system: 'diagnosis', value: 'C25' },
					{ key: 'grading', type: 'EQUALS', system: 'diagnosis', value: 'G1' }
				],
				'AND'
			),
			limit: 20,
			columnFilters: []
		},
		context()
	);

	assert.deepEqual(
		rows.map((row) => row.patID),
		['p1']
	);
});

test('cross-system tumor filters must match the same tumor of a study patient', async () => {
	const inputFor = (status, includeStudy = false) => ({
		filter: filterValue(
			[
				...(includeStudy
					? [{ key: 'status', type: 'EQUALS', system: 'study', value: 'open' }]
					: []),
				{ key: 'ICD.ICD10', type: 'EQUALS', system: 'diagnosis', value: 'C25' },
				{ key: 'status', type: 'EQUALS', system: 'therapy', value: status }
			],
			'AND'
		),
		limit: 20,
		columnFilters: []
	});

	const [sameTumorRows, otherTumorRows, mixedStudyRows] = await Promise.all([
		getStudyPatientTable(inputFor('same-tumor'), context()),
		getStudyPatientTable(inputFor('other-tumor'), context()),
		getStudyPatientTable(inputFor('other-tumor', true), context())
	]);

	assert.deepEqual(
		sameTumorRows.map((row) => row.patID),
		['p1']
	);
	assert.deepEqual(otherTumorRows, []);
	assert.deepEqual(mixedStudyRows, []);
});

test('column filters apply after projection to table columns', async () => {
	const rows = await getStudyPatientTable(
		{
			filter: emptyFilter,
			limit: 20,
			columnFilters: [{ field: 'shortname', value: 'holo' }]
		},
		context()
	);

	assert.deepEqual(rows.map((row) => row.patID).sort(), ['p1', 'p2', 'p3']);
});

test('diagnosis filters return only matching participations in the study overview', async () => {
	const rows = await getStudyOverview(
		{
			filter: filterValue([
				{ key: 'ICD.ICD10', type: 'EQUALS', system: 'diagnosis', value: 'C25' }
			]),
			limit: 20,
			columnFilters: []
		},
		context()
	);

	assert.deepEqual(
		rows.map((row) => row.studyID),
		['004902']
	);
	assert.deepEqual(rows[0].studyPatients.map((row) => row.patID).sort(), ['p1', 'p3']);
});

test('study overview sorts the patient column by participation count', async () => {
	const inputFor = (sortDirection) => ({
		filter: emptyFilter,
		limit: 20,
		sortField: 'studyPatients',
		sortDirection,
		columnFilters: []
	});
	const [ascending, descending, stages] = await Promise.all([
		getStudyOverview(inputFor('asc'), context()),
		getStudyOverview(inputFor('desc'), context()),
		buildStudyOverviewAggregation(
			inputFor('asc'),
			{ study: 'study', studyPatient: 'studyPatient', patient: 'patient' },
			makeDb()
		)
	]);

	assert.deepEqual(ascending.map((row) => row.studyID), ['009999', '004595', '004902']);
	assert.deepEqual(descending.map((row) => row.studyID), ['004902', '004595', '009999']);
	assert.ok(stages.some((stage) => stage.$set?.__studyPatientCount?.$size));
	assert.ok(stages.some((stage) => stage.$sort?.__studyPatientCount === 1));
});

test('study metadata filters keep every participation of the matching study', async () => {
	const rows = await getStudyOverview(
		{
			filter: filterValue([{ key: 'status', type: 'EQUALS', system: 'study', value: 'open' }]),
			limit: 20,
			columnFilters: []
		},
		context()
	);

	assert.deepEqual(
		rows.map((row) => row.studyID),
		['004902']
	);
	assert.deepEqual(rows[0].studyPatients.map((row) => row.patID).sort(), ['p1', 'p2', 'p3']);
});

test('study metadata filters retain matching studies without participations', async () => {
	const input = {
		filter: filterValue([{ key: 'status', type: 'EQUALS', system: 'study', value: 'planned' }]),
		limit: 20,
		columnFilters: []
	};
	const [rows, count] = await Promise.all([
		getStudyOverview(input, context()),
		getStudyOverviewCount(input, context())
	]);

	assert.equal(count, 1);
	assert.deepEqual(
		rows.map((row) => row.studyID),
		['009999']
	);
	assert.deepEqual(rows[0].studyPatients, []);
});

test('mixed filters include an empty study only when the study-only branch is sufficient', async () => {
	const clauses = [
		{ key: 'status', type: 'EQUALS', system: 'study', value: 'planned' },
		{ key: 'ICD.ICD10', type: 'EQUALS', system: 'diagnosis', value: 'C25' }
	];
	const inputFor = (operand) => ({
		filter: filterValue(clauses, operand),
		limit: 20,
		columnFilters: []
	});
	const [orRows, andRows] = await Promise.all([
		getStudyOverview(inputFor('OR'), context()),
		getStudyOverview(inputFor('AND'), context())
	]);

	assert.deepEqual(orRows.map((row) => row.studyID).sort(), ['004902', '009999']);
	assert.deepEqual(orRows.find((row) => row.studyID === '009999').studyPatients, []);
	assert.deepEqual(andRows, []);
});

test('mixed study and diagnosis OR filters preserve participation-level semantics in overview and count', async () => {
	const input = {
		filter: filterValue([
			{ key: 'status', type: 'EQUALS', system: 'study', value: 'closed' },
			{ key: 'ICD.ICD10', type: 'EQUALS', system: 'diagnosis', value: 'C25' }
		]),
		limit: 20,
		columnFilters: []
	};
	const [rows, count] = await Promise.all([
		getStudyOverview(input, context()),
		getStudyOverviewCount(input, context())
	]);

	assert.equal(count, 2);
	assert.deepEqual(
		rows
			.flatMap((study) => study.studyPatients.map((row) => `${study.studyID}:${row.patID}`))
			.sort(),
		['004595:p4', '004902:p1', '004902:p3']
	);
});
