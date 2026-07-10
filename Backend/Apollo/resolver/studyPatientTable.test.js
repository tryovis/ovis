const assert = require('node:assert/strict');
const test = require('node:test');

const {
	buildStudyPatientCountAggregation,
	buildStudyPatientTableAggregation,
	getStudyPatientCount,
	getStudyPatientTable
} = require('./studyPatientTable');

const emptyFilter = '{"operand":"OR","children":[]}';

const studies = [
	{
		_id: 's1',
		studyID: '004902',
		shortname: 'HOLOSURGE',
		status: 'open',
		studyPatients: [
			{ patID: 'p1', recruitmentDate: 3 },
			{ patID: 'p2', recruitmentDate: 2 },
			{ patID: 'p3', recruitmentDate: 1 }
		]
	},
	{
		_id: 's2',
		studyID: '004595',
		shortname: 'LIVER-R',
		status: 'closed',
		studyPatients: [{ patID: 'p4', recruitmentDate: 4 }]
	}
];

const patients = [
	{ patID: 'p1', tumorID: ['t1'] },
	{ patID: 'p2', tumorID: ['t2'] },
	{ patID: 'p3', tumorID: ['t3'] },
	{ patID: 'p4', tumorID: ['t4'] }
];

const diagnosis = [
	{ patID: 'p1', tumorID: 't1', ICD: { ICD10: 'C25' }, grading: 'G1' },
	{ patID: 'p3', tumorID: 't3', ICD: { ICD10: 'C25' } },
	{ patID: 'p3', tumorID: 't3', ICD: { ICD10: 'C18' }, grading: 'G1' },
	{ patID: 'p4', tumorID: 't4', ICD: { ICD10: 'C18' } }
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
		if ('$exists' in condition) return condition.$exists ? value !== undefined : value === undefined;
		if ('$regex' in condition) {
			const flags = condition.$options || '';
			return new RegExp(condition.$regex, flags).test(String(value ?? ''));
		}
	}

	return value === condition;
};

const matches = (doc, query = {}) =>
	Object.entries(query).every(([key, condition]) => {
		if (key === '$and') return condition.every((sub) => matches(doc, sub));
		if (key === '$or') return condition.some((sub) => matches(doc, sub));
		if (key === '$nor') return condition.every((sub) => !matches(doc, sub));

		return matchesCondition(getValue(doc, key), condition);
	});

const readExpr = (doc, expr) => {
	if (typeof expr === 'string' && expr.startsWith('$')) return getValue(doc, expr.slice(1));
	if (expr && typeof expr === 'object' && '$toString' in expr) {
		return String(readExpr(doc, expr.$toString));
	}
	if (expr && typeof expr === 'object' && '$concat' in expr) {
		return expr.$concat.map((part) => readExpr(doc, part)).join('');
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

const runPipeline = (docs, pipeline) =>
	pipeline.reduce((current, stage) => {
		if (stage.$match) return current.filter((doc) => matches(doc, stage.$match));
		if (stage.$unwind) {
			const path = (typeof stage.$unwind === 'string' ? stage.$unwind : stage.$unwind.path).slice(1);
			return current.flatMap((doc) =>
				(getValue(doc, path) || []).map((entry) => ({ ...doc, [path]: entry }))
			);
		}
		if (stage.$project) return current.map((doc) => projectDoc(doc, stage.$project));
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
	const collections = { study: studies, patient: patients, diagnosis };
	return {
		collection(name) {
			const docs = collections[name] ?? [];
			return {
				distinct(field, query = {}) {
					return Promise.resolve([
						...new Set(docs.filter((doc) => matches(doc, query)).map((doc) => getValue(doc, field)).flat())
					]);
				},
				aggregate(pipeline) {
					const result = runPipeline(docs, pipeline);
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
	collections: { study: 'study', patient: 'patient' },
	db: makeDb()
});

const filterValue = (children, operand = 'OR') => JSON.stringify({ operand, children });

test('buildStudyPatientTableAggregation unwinds studyPatients before table paging', async () => {
	const stages = await buildStudyPatientTableAggregation(
		{
			filter: emptyFilter,
			offset: 20,
			limit: 10,
			sortField: 'recruitmentDate',
			sortDirection: 'desc',
			columnFilters: [{ field: 'patID', value: '0022' }]
		},
		{ study: 'study', patient: 'patient' },
		{}
	);

	const unwindIndex = stages.findIndex((stage) => stage.$unwind?.path === '$studyPatients');
	const matchIndex = stages.findIndex((stage) => stage.$match?.patID);
	const sortIndex = stages.findIndex((stage) => stage.$sort?.recruitmentDate);
	const skipIndex = stages.findIndex((stage) => stage.$skip === 20);
	const limitIndex = stages.findIndex((stage) => stage.$limit === 10);

	assert.notEqual(unwindIndex, -1);
	assert.ok(unwindIndex < matchIndex);
	assert.ok(matchIndex < sortIndex);
	assert.ok(sortIndex < skipIndex);
	assert.ok(skipIndex < limitIndex);
});

test('buildStudyPatientCountAggregation counts flattened study patient rows', async () => {
	const stages = await buildStudyPatientCountAggregation(
		{
			filter: emptyFilter,
			columnFilters: [{ field: 'shortname', value: 'HOLOSURGE' }]
		},
		{ study: 'study', patient: 'patient' },
		{}
	);

	const unwindIndex = stages.findIndex((stage) => stage.$unwind?.path === '$studyPatients');
	const matchIndex = stages.findIndex((stage) => stage.$match?.shortname);
	const countIndex = stages.findIndex((stage) => stage.$count === 'count');

	assert.notEqual(unwindIndex, -1);
	assert.ok(unwindIndex < matchIndex);
	assert.ok(matchIndex < countIndex);
});

test('getStudyPatientTable pages flattened study-patient rows', async () => {
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

test('getStudyPatientCount counts all flattened rows without a filter', async () => {
	const count = await getStudyPatientCount({ filter: emptyFilter, columnFilters: [] }, context());

	assert.equal(count, 4);
});

test('study filters are applied to study rows before flattened paging', async () => {
	const rows = await getStudyPatientTable(
		{
			filter: filterValue([{ key: 'status', type: 'EQUALS', system: 'study', value: 'open' }]),
			limit: 20,
			columnFilters: []
		},
		context()
	);

	assert.deepEqual(
		rows.map((row) => row.patID).sort(),
		['p1', 'p2', 'p3']
	);
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

	assert.deepEqual(
		rows.map((row) => row.patID).sort(),
		['p1', 'p3']
	);
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

	assert.deepEqual(
		rows.map((row) => row.patID).sort(),
		['p1', 'p3', 'p4']
	);
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

test('column filters apply after projection to table columns', async () => {
	const rows = await getStudyPatientTable(
		{
			filter: emptyFilter,
			limit: 20,
			columnFilters: [{ field: 'shortname', value: 'holo' }]
		},
		context()
	);

	assert.deepEqual(
		rows.map((row) => row.patID).sort(),
		['p1', 'p2', 'p3']
	);
});
