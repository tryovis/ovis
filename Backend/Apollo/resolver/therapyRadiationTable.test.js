const assert = require('node:assert/strict');
const test = require('node:test');
const genericResolver = require('./resolver');
const therapyResolver = require('./therapy');

const leaf = (key, value, system = 'therapy', type = 'EQUALS') => ({
	key,
	value,
	system,
	type
});
const group = (operand, ...children) => ({ operand, children });

const therapy = [
	{
		_id: 'r1',
		therapyID: 'r1',
		tumorID: 't1',
		patID: 'p1',
		generalType: 'radiation',
		therapyOccurrenceDate: 5,
		radiation: [
			{ type: 'Teletherapie', radioType: 'Photonen', singleDoseUnit: 'Gy', totalDoseUnit: 'Gy' },
			{ type: 'Brachytherapie', radioType: 'Elektronen', brachyType: 'radiation_literal' }
		]
	},
	{
		_id: 'r2',
		therapyID: 'r2',
		tumorID: 't2',
		patID: 'p1',
		generalType: 'radiation',
		therapyOccurrenceDate: 4,
		radiation: null
	},
	{
		_id: 'r3',
		therapyID: 'r3',
		tumorID: 't3',
		patID: 'p2',
		generalType: 'radiation',
		therapyOccurrenceDate: 3,
		radiation: []
	},
	{
		_id: 'r4',
		therapyID: 'r4',
		tumorID: 't4',
		patID: 'p3',
		generalType: 'radiation',
		therapyOccurrenceDate: 2
	},
	{
		_id: 'r5',
		therapyID: 'r5',
		tumorID: 't5',
		patID: 'p2',
		generalType: 'radiation',
		therapyOccurrenceDate: 1,
		radiation: [{ type: 'Teletherapie', radioType: 'Elektronen' }]
	},
	{
		_id: 'systemic',
		tumorID: 't1',
		patID: 'p1',
		generalType: 'systemic',
		radiation: [{ type: 'Teletherapie', radioType: 'Photonen' }]
	},
	{ _id: 'nuclear', tumorID: 't2', patID: 'p1', generalType: 'nuclear' }
];
const patient = [
	{ patID: 'p1', tumorID: ['t1', 't2'], gender: 'w' },
	{ patID: 'p2', tumorID: ['t3', 't5'], gender: 'm' },
	{ patID: 'p3', tumorID: ['t4'], gender: 'w' }
];
const diagnosis = ['t1', 't2', 't3', 't4', 't5'].map((tumorID, index) => ({
	tumorID,
	patID: ['p1', 'p1', 'p2', 'p3', 'p2'][index],
	group: index === 0 || index === 4 ? 'allowed' : 'outside'
}));

const getValue = (doc, path) => path.split('.').reduce((value, key) => value?.[key], doc);
const equals = (value, expected) =>
	Array.isArray(value)
		? value.some((item) => equals(item, expected))
		: expected === null
		? value == null
		: value === expected;

function matches(doc, query) {
	return Object.entries(query).every(([field, condition]) => {
		if (field === '$and') return condition.every((item) => matches(doc, item));
		if (field === '$or') return condition.some((item) => matches(doc, item));
		if (field === '$nor') return !condition.some((item) => matches(doc, item));
		const value = getValue(doc, field);
		if (condition == null || typeof condition !== 'object') return equals(value, condition);
		return Object.entries(condition).every(([operator, expected]) => {
			if (operator === '$eq') return equals(value, expected);
			if (operator === '$in') return expected.some((item) => equals(value, item));
			if (operator === '$nin') return !expected.some((item) => equals(value, item));
			if (operator === '$exists') return expected === (value !== undefined);
			if (operator === '$size') return Array.isArray(value) && value.length === expected;
			if (operator === '$regex')
				return typeof value === 'string' && new RegExp(expected, condition.$options).test(value);
			if (operator === '$options') return true;
			assert.fail(`Unsupported test query operator ${operator}`);
		});
	});
}

function runPipeline(documents, pipeline) {
	return pipeline.reduce((rows, stage) => {
		if (stage.$match) return rows.filter((doc) => matches(doc, stage.$match));
		if (stage.$unwind) {
			const { path, preserveNullAndEmptyArrays } = stage.$unwind;
			const field = path.slice(1);
			return rows.flatMap((doc) => {
				const value = getValue(doc, field);
				if (Array.isArray(value) && value.length)
					return value.map((item) => ({ ...doc, [field]: item }));
				if (value != null && !Array.isArray(value)) return [doc];
				if (!preserveNullAndEmptyArrays) return [];
				const result = { ...doc };
				if (Array.isArray(value)) delete result[field];
				return [result];
			});
		}
		if (stage.$set)
			return rows.map((doc) => {
				const result = { ...doc };
				for (const [field, expression] of Object.entries(stage.$set)) {
					assert.equal(typeof expression, 'string');
					const value = getValue(doc, expression.slice(1));
					if (value === undefined) delete result[field];
					else result[field] = value;
				}
				return result;
			});
		if (stage.$unset)
			return rows.map((doc) => {
				const result = { ...doc };
				delete result[stage.$unset];
				return result;
			});
		if (stage.$sort)
			return rows.toSorted((left, right) => {
				for (const [field, direction] of Object.entries(stage.$sort)) {
					const a = getValue(left, field);
					const b = getValue(right, field);
					if (a === b) continue;
					return (a == null ? -1 : b == null || a > b ? 1 : -1) * direction;
				}
				return 0;
			});
		if (stage.$skip) return rows.slice(stage.$skip);
		if (stage.$limit) return rows.slice(0, stage.$limit);
		if (stage.$count) return rows.length ? [{ [stage.$count]: rows.length }] : [];
		assert.fail(`Unsupported test pipeline stage ${JSON.stringify(stage)}`);
	}, structuredClone(documents));
}

function createContext() {
	const collections = { therapy, patient, diagnosis };
	const calls = [];
	return {
		calls,
		collections: { therapy: 'therapy', patient: 'patient', diagnosis: 'diagnosis' },
		db: {
			collection(name) {
				assert.ok(name in collections, `Unexpected collection ${name}`);
				return {
					async distinct(field, query = {}) {
						return [
							...new Set(
								collections[name]
									.filter((doc) => matches(doc, query))
									.flatMap((doc) => getValue(doc, field))
									.filter((value) => value != null)
							)
						];
					},
					aggregate(pipeline) {
						calls.push({ name, pipeline });
						const result = runPipeline(collections[name], pipeline);
						return { toArray: async () => result, next: async () => result[0] };
					}
				};
			}
		}
	};
}

async function rowsAndCount(input = {}, context = createContext()) {
	const rows = await therapyResolver.Query.getTherapyRadiationTable(null, input, context);
	const count = await genericResolver.Query.getTableCount(
		null,
		{ ...input, collection: 'radiation' },
		context
	);
	return { rows, count, context };
}

test('radiation counts detail rows, preserves absent details and excludes other therapies', async () => {
	const { rows, count, context } = await rowsAndCount({
		sortField: 'therapyOccurrenceDate',
		sortDirection: 'desc'
	});
	assert.equal(count, 6);
	assert.equal(rows[0].singleDoseUnit, 'Gy');
	assert.equal(rows[0].totalDoseUnit, 'Gy');
	assert.deepEqual(
		rows.map((row) => row.therapyID),
		['r1', 'r1', 'r2', 'r3', 'r4', 'r5']
	);
	assert.deepEqual(
		rows.map((row) => row.type),
		['Teletherapie', 'Brachytherapie', undefined, undefined, undefined, 'Teletherapie']
	);
	assert.equal(
		await genericResolver.Query.getTableCount(null, { collection: 'therapy' }, context),
		7
	);
});

test('radiation page and export counts use the full row set independently of pagination', async () => {
	const all = [];
	for (const offset of [0, 2, 4, 6]) {
		const { rows, count } = await rowsAndCount({
			limit: 2,
			offset,
			sortField: 'therapyOccurrenceDate',
			sortDirection: 'desc'
		});
		assert.equal(count, 6);
		all.push(...rows.map((row) => row.therapyID));
	}
	assert.deepEqual(all, ['r1', 'r1', 'r2', 'r3', 'r4', 'r5']);
});

test('radiation column aliases filter and sort the same rows that are counted', async () => {
	const { rows, count } = await rowsAndCount({
		columnFilters: [{ field: 'radiation_radioType', value: 'eLEK' }],
		sortField: 'radiation_type',
		sortDirection: 'asc'
	});
	assert.equal(count, 2);
	assert.deepEqual(
		rows.map((row) => row.type),
		['Brachytherapie', 'Teletherapie']
	);
});

test('radiation AST conjunctions require the same detail row', async () => {
	const { rows, count } = await rowsAndCount({
		filter: JSON.stringify(
			group(
				'AND',
				group('OR', leaf('generalType', 'radiation'), leaf('generalType', 'systemic')),
				leaf('radiation_type', 'Teletherapie'),
				leaf('radiation_radioType', 'Elektronen')
			)
		)
	});
	assert.equal(count, 1);
	assert.deepEqual(
		rows.map((row) => row.therapyID),
		['r5']
	);
});

test('radiation rows and counts retain assigned patient and diagnosis scopes under alternatives', async () => {
	const mandatory = group(
		'AND',
		leaf('gender', 'w', 'patient'),
		leaf('group', 'allowed', 'diagnosis')
	);
	const selection = group(
		'OR',
		leaf('radiation_type', 'Teletherapie'),
		leaf('generalType', 'nuclear')
	);
	const { rows, count } = await rowsAndCount({
		filter: JSON.stringify(group('AND', mandatory, selection))
	});
	assert.equal(count, 1);
	assert.deepEqual(
		rows.map((row) => row.therapyID),
		['r1']
	);
});

test('radiation missing-value filters count legacy rows without details', async () => {
	const { rows, count } = await rowsAndCount({
		filter: JSON.stringify(group('OR', leaf('radiation_type', '-')))
	});
	assert.equal(count, 3);
	assert.deepEqual(rows.map((row) => row.therapyID).sort(), ['r2', 'r3', 'r4']);
});

test('radiation alias mapping preserves literal values and does not mutate resolver arguments', async () => {
	const input = Object.freeze({
		filter: JSON.stringify(group('AND', leaf('radiation.brachyType', 'radiation_literal')))
	});
	const { rows, count } = await rowsAndCount(input);
	assert.equal(count, 1);
	assert.equal(rows[0].brachyType, 'radiation_literal');
});

test('radiation counts zero when all rows are filtered out', async () => {
	const { rows, count } = await rowsAndCount({
		columnFilters: [{ field: 'radiation_type', value: 'no match' }]
	});
	assert.equal(count, 0);
	assert.deepEqual(rows, []);
});
