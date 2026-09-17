const assert = require('node:assert/strict');
const test = require('node:test');
const { MongoClient } = require('mongodb');
const { createAccessControl } = require('./accessControl');
const { filter2match } = require('./astTranslator');

// Run only against the disposable, internal test MongoDB, never a configured OVIS DB.
const address = process.env.OVIS_SYNTHETIC_COMBINATION_MONGO;
const leaf = (key, value, system = 'diagnosis', type = 'EQUALS') => ({ key, value, system, type });
const group = (operand, ...children) => ({ operand, children });
const row = (key, values, system = 'diagnosis', type = 'EQUALS') => ({
	key,
	operand: 'OR',
	children: values.map((value) => leaf(key, value, system, type))
});
const mandatory = group('AND', row('ICD_ICD10Group', ['C30-C39']));
const lung = row('ICD_ICD10_3', ['C34']);
const gender = row('gender', ['m', 'w'], 'patient');
const neitherGender = row('!gender', ['m', 'w'], 'patient', 'NEQUALS');
const age = row(
	'ageAtDiagnosis',
	[
		{ min: 20, max: 30 },
		{ min: 50, max: 60 }
	],
	'diagnosis',
	'BETWEEN'
);

test(
	'real Mongo results retain mandatory cohort under complex chart selections',
	{ skip: !address },
	async (t) => {
		assert.equal(
			new URL(address).hostname,
			'ovis-filter-combo-mongo-20260916',
			'only the dedicated synthetic MongoDB is permitted'
		);
		const { ReferenceModel, normalizeAstKeys } = await import(
			'./differential/referenceEvaluator.mjs'
		);
		const client = new MongoClient(address, { serverSelectionTimeoutMS: 15000 });
		await client.connect();
		try {
			const db = client.db(`synthetic_filter_combinations_${Date.now()}`);
			const cases = [
				['t1', 'C34', 'm', 25, 'w'],
				['t2', 'C34', 'w', 55, 'm'],
				['t3', 'C34', 'd', 25, 'd'],
				['t4', 'C34', 'm', 40, 'm'],
				['t5', 'C32', 'w', 55, 'w'],
				['t6', 'C50', 'm', 25, 'm'],
				['t7', 'C34', 'w', 70, 'w'],
				['t8', 'C32', 'd', 25, 'd'],
				['t9', 'C34', 'x', 60, 'x'],
				['t10', 'C34', 'm', 20, 'm'],
				['t11', 'C34', 'w', 30, 'w'],
				['t12', 'C34', 'd', 50, 'd'],
				['t13', 'C34', 'x', 31, 'x'],
				['t14', 'C34', 'w', 61, 'w']
			];
			const patient = cases.map(([id, _code, gender]) => ({
				_id: `p-${id}`,
				patID: `p-${id}`,
				tumorID: [id],
				gender
			}));
			const diagnosis = cases.map(([id, code, _gender, ageAtDiagnosis, gender]) => ({
				_id: id,
				tumorID: id,
				patID: `p-${id}`,
				gender,
				ageAtDiagnosis,
				ICD: { ICD10_3: code, ICD10Group: code === 'C50' ? 'C50-C59' : 'C30-C39' }
			}));
			await db.collection('patient').insertMany(patient);
			await db.collection('diagnosis').insertMany(diagnosis);
			const model = new ReferenceModel({ patient, diagnosis });
			const context = {
				db,
				collections: { usr: 'user', patient: 'patient', diagnosis: 'diagnosis' },
				security: {
					anonymous: false,
					userId: 'synthetic-restricted',
					role: 'user',
					user: {
						_id: 'synthetic-restricted',
						role: 'user',
						status: 'active',
						userFilter: [JSON.stringify(mandatory)]
					}
				}
			};
			let effectiveFilter;
			const control = createAccessControl({ env: { OVIS_IMPORT_MODE: 'credos' } });
			const guarded = control.protectResolvers([
				{
					Query: {
						getTumors: async (_parent, args) => {
							effectiveFilter = JSON.parse(args.filter);
							const pipeline = await filter2match({ value: args.filter, column: 'diagnosis', db });
							return db.collection('diagnosis').aggregate(pipeline).toArray();
						}
					}
				}
			])[0];
			const info = {
				parentType: { getFields: () => ({ getTumors: { args: [{ name: 'filter' }] } }) }
			};
			const lungIds = ['t1', 't2', 't3', 't4', 't7', 't9', 't10', 't11', 't12', 't13', 't14'];
			const checks = [
				['C34 within assigned C30-C39', group('OR', group('AND', lung)), lungIds],
				[
					'male OR female within C34',
					group('OR', group('AND', lung, gender)),
					['t1', 't2', 't4', 't7', 't10', 't11', 't14']
				],
				[
					'two disjoint age ranges with inclusive boundaries',
					group('OR', group('AND', lung, age)),
					['t1', 't2', 't3', 't9', 't10', 't11', 't12']
				],
				[
					'C34 AND gender alternatives AND age alternatives',
					group('OR', group('AND', lung, gender, age)),
					['t1', 't2', 't10', 't11']
				],
				[
					'negative gender OR row means neither male nor female',
					group('OR', group('AND', lung, neitherGender)),
					['t3', 't9', 't12', 't13']
				],
				[
					'negative gender plus disjoint age ranges',
					group('OR', group('AND', lung, neitherGender, age)),
					['t3', 't9', 't12']
				],
				[
					'second OR branch preserves independent C32 selection',
					group(
						'OR',
						group('AND', lung, row('gender', ['m'], 'patient'), age),
						group('AND', row('ICD_ICD10_3', ['C32']), row('gender', ['w'], 'patient'))
					),
					['t1', 't5', 't10']
				],
				[
					'same key in patient and diagnosis remains distinct',
					group(
						'OR',
						group('AND', lung, row('gender', ['w'], 'patient'), row('gender', ['m'], 'diagnosis'))
					),
					['t2']
				],
				[
					'removing gender retains age and mandatory group',
					group('OR', group('AND', lung, age)),
					['t1', 't2', 't3', 't9', 't10', 't11', 't12']
				],
				[
					'removing all personal filters still retains assignment',
					null,
					cases.filter(([, code]) => code !== 'C50').map(([id]) => id)
				],
				[
					'personal OR cannot add outside-cohort C50',
					group('OR', group('AND', lung), group('AND', row('ICD_ICD10_3', ['C50']))),
					lungIds
				]
			];
			for (const [name, requested, expected] of checks) {
				await t.test(name, async () => {
					const args = requested ? { filter: JSON.stringify(requested) } : {};
					const actual = await guarded.Query.getTumors(null, args, context, info);
					const expectedIds = [...expected].sort();
					assert.deepEqual(
						actual.map(({ tumorID }) => tumorID).sort(),
						expectedIds,
						'MongoDB result'
					);
					assert.deepEqual(
						effectiveFilter,
						requested ? group('AND', mandatory, requested) : mandatory,
						'server-enforced outer AND'
					);
					const normalized = normalizeAstKeys(effectiveFilter);
					const reference = diagnosis.filter((document) =>
						model.evaluateTargetDocument(document, 'diagnosis', normalized)
					);
					assert.deepEqual(
						reference.map(({ tumorID }) => tumorID).sort(),
						expectedIds,
						'independent reference result'
					);
				});
			}
		} finally {
			await client.close();
		}
	}
);
