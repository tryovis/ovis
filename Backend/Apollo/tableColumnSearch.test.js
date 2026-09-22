const assert = require('node:assert/strict');
const test = require('node:test');
const { columnFilterStages } = require('./tableColumnSearch');
const { Query } = require('./resolver/resolver');

function getValue(value, path) {
	if (!path) return value;
	const [key, ...rest] = path.split('.');
	if (Array.isArray(value)) return value.map((item) => getValue(item, path));
	return getValue(value?.[key], rest.join('.'));
}

function evaluate(expr, doc, variables = {}) {
	if (typeof expr === 'string' && expr.startsWith('$$')) return getValue(variables, expr.slice(2));
	if (typeof expr === 'string' && expr.startsWith('$')) return getValue(doc, expr.slice(1));
	if (Array.isArray(expr)) return expr.map((item) => evaluate(item, doc, variables));
	if (expr == null || typeof expr !== 'object') return expr;
	const read = (value) => evaluate(value, doc, variables);
	const [operator, value] = Object.entries(expr)[0];
	if (operator === '$convert') {
		const input = read(value.input);
		if (input == null) return value.onNull;
		return typeof input === 'object' ? value.onError : String(input);
	}
	if (operator === '$isArray') return Array.isArray(read(value));
	if (operator === '$type') return Array.isArray(read(value)) ? 'array' : typeof read(value);
	if (operator === '$cond') return read(read(value[0]) ? value[1] : value[2]);
	if (operator === '$eq') return read(value[0]) === read(value[1]);
	if (operator === '$ne') return read(value[0]) !== read(value[1]);
	if (operator === '$and') return value.every((item) => read(item));
	if (operator === '$ifNull') return read(value[0]) ?? read(value[1]);
	if (operator === '$concat') return value.map(read).join('');
	if (operator === '$trim') return read(value.input).trim();
	if (operator === '$size') return read(value).length;
	if (operator === '$substr') return read(value[0]).substr(value[1], value[2]);
	if (operator === '$map')
		return (
			read(value.input)?.map((item) =>
				evaluate(value.in, doc, { ...variables, [value.as]: item })
			) ?? null
		);
	if (operator === '$filter')
		return read(value.input).filter((item) =>
			evaluate(value.cond, doc, { ...variables, [value.as]: item })
		);
	if (operator === '$reduce')
		return read(value.input).reduce(
			(acc, item) => evaluate(value.in, doc, { ...variables, value: acc, this: item }),
			read(value.initialValue)
		);
	if (operator === '$regexMatch')
		return new RegExp(value.regex, value.options).test(read(value.input));
	assert.fail(`Unsupported synthetic expression ${operator}`);
}

function matches(doc, query) {
	return Object.entries(query).every(([field, condition]) => {
		if (field === '$expr') return evaluate(condition, doc);
		if (field === '$and') return condition.every((item) => matches(doc, item));
		if (field === '$or') return condition.some((item) => matches(doc, item));
		const value = getValue(doc, field);
		if ('$regex' in condition)
			return [value]
				.flat()
				.some(
					(item) =>
						typeof item === 'string' && new RegExp(condition.$regex, condition.$options).test(item)
				);
		if ('$eq' in condition) return value === condition.$eq;
		if ('$in' in condition) return [value].flat().some((item) => condition.$in.includes(item));
		assert.fail(`Unsupported synthetic predicate ${JSON.stringify(condition)}`);
	});
}

const search = (field, value, doc, collection = 'therapy') =>
	columnFilterStages([{ field, value }], collection).every((stage) => matches(doc, stage.$match));

test('OPS search matches displayed codes, including joined values, but not descriptions or IDs', () => {
	const doc = {
		ops: [
			{ code: '5-552.1', text: 'Hidden description', procedureID: 'hidden-id' },
			{ code: '8-123' }
		]
	};
	assert.equal(search('ops', '5-5', doc), true);
	assert.equal(search('ops', '5-552.1, 8-123', doc), true);
	assert.equal(search('ops', 'Hidden', doc), false);
	assert.equal(search('ops', 'hidden-id', doc), false);
	assert.equal(search('ops', '5-552X1', doc), false);
});

test('array-column search treats regex metacharacters literally', () => {
	assert.equal(search('substance', 'A+B (x).', { substance: [{ substance: 'A+B (x).' }] }), true);
	assert.equal(search('substance', 'A+B (x).', { substance: [{ substance: 'AAAB xZ' }] }), false);
	assert.equal(search('ops', '.*', { ops: [{ code: '5-552' }] }), false);
});

test('substance and complication searches use their visible names and grades', () => {
	const doc = {
		substance: [{ substance: 'Carboplatin', ATCCode: 'L01XA02' }],
		complication: [
			{ complication: 'Müdigkeit', grade: 2, code: 'hidden-code', category: 'hidden-category' }
		]
	};
	assert.equal(search('substance', 'CARBO', doc), true);
	assert.equal(search('substance', 'L01XA02', doc), false);
	assert.equal(search('complication', 'MÜDIGKEIT:2', doc), true);
	assert.equal(search('complication', '2', doc), true);
	assert.equal(search('complication', 'hidden', doc), false);
	assert.equal(
		search('complication', ':', { complication: [{ complication: 'Übelkeit', grade: null }] }),
		false
	);
	for (const grade of [0, '0'])
		assert.equal(
			search('complication', 'Übelkeit:0', { complication: [{ complication: 'Übelkeit', grade }] }),
			true
		);
});

test('visible primitive arrays and legacy strings retain the displayed string normalization', () => {
	const doc = {
		surgeon: ['Dr. A', '', 123, { id: 'hidden' }, 'Dr. B'],
		metastasisResection: ['Leber', 'Lunge']
	};
	assert.equal(search('surgeon', 'Dr. A, Dr. B', doc), true);
	assert.equal(search('surgeon', '123', doc), false);
	assert.equal(search('surgeon', 'hidden', doc), false);
	assert.equal(search('metastasisResection', 'leber, lunge', doc), true);
	assert.equal(search('surgeon', 'Dr. A', { surgeon: 'Dr. A' }), true);
});

test('missing arrays are safe and scalar or dot-path search remains unchanged', () => {
	for (const field of ['ops', 'substance', 'complication', 'surgeon', 'metastasisResection']) {
		for (const value of [undefined, null, []])
			assert.equal(search(field, 'test', { [field]: value }), false);
	}
	assert.equal(search('ICD.ICD10', 'C34.', { ICD: { ICD10: 'C34.1' } }, 'diagnosis'), true);
	assert.equal(search('number', '12', { number: 123 }), false);
	assert.deepEqual(columnFilterStages([{ field: 'ops', value: '   ' }], 'therapy'), []);
});

function createContext() {
	const therapy = [
		{ _id: 'a', tumorID: 'allowed', generalType: 'operation', ops: [{ code: '5-552' }] },
		{
			_id: 'b',
			tumorID: 'allowed',
			generalType: 'operation',
			ops: [{ code: '5-553' }, { code: '8-123' }]
		},
		{ _id: 'c', tumorID: 'outside', generalType: 'operation', ops: [{ code: '5-555' }] },
		{ _id: 'd', tumorID: 'allowed', generalType: 'systemic', ops: [{ code: '5-554' }] },
		{
			_id: 'e',
			tumorID: 'allowed',
			generalType: 'operation',
			ops: [{ code: '8-999', text: '5-5 hidden text' }]
		}
	];
	return {
		collections: { therapy: 'therapy' },
		db: {
			collection(name) {
				assert.equal(name, 'therapy');
				return {
					distinct: async () => ['allowed', 'outside'],
					aggregate(pipeline) {
						const result = pipeline.reduce((rows, stage) => {
							if (stage.$match) return rows.filter((row) => matches(row, stage.$match));
							if (stage.$set)
								return rows.map((row) => ({
									...row,
									...Object.fromEntries(
										Object.entries(stage.$set).map(([field, expr]) => [field, evaluate(expr, row)])
									)
								}));
							if (stage.$lookup) return rows.map((row) => ({ ...row, [stage.$lookup.as]: [] }));
							if (stage.$sort) return rows.toSorted((a, b) => b._id.localeCompare(a._id));
							if (stage.$skip) return rows.slice(stage.$skip);
							if (stage.$limit) return rows.slice(0, stage.$limit);
							if (stage.$count) return rows.length ? [{ count: rows.length }] : [];
							assert.fail(`Unsupported synthetic stage ${JSON.stringify(stage)}`);
						}, structuredClone(therapy));
						return { toArray: async () => result, next: async () => result[0] };
					}
				};
			}
		}
	};
}

test('therapy rows, filtered counts and paged exports share array search inside the original cohort', async () => {
	const context = createContext();
	const input = {
		filter: JSON.stringify({
			operand: 'AND',
			children: [
				{ system: 'therapy', key: 'tumorID', type: 'EQUALS', value: 'allowed' },
				{ system: 'therapy', key: 'generalType', type: 'EQUALS', value: 'operation' }
			]
		}),
		columnFilters: [{ field: 'ops', value: '5-5' }]
	};
	const rows = await Query.getAllTherapies(null, input, context);
	const count = await Query.getTableCount(null, { ...input, collection: 'therapy' }, context);
	assert.equal(count, 2);
	assert.deepEqual(
		rows.map((row) => row._id),
		['b', 'a']
	);
	assert.deepEqual(
		rows[0].ops.map((op) => op.ops),
		['5-553', '8-123']
	);
	const exported = [];
	for (let offset = 0; offset < count; offset++)
		exported.push(...(await Query.getAllTherapies(null, { ...input, limit: 1, offset }, context)));
	assert.deepEqual(
		exported.map((row) => row._id),
		['b', 'a']
	);
});
