const path = require('path');
const { pathToFileURL } = require('url');
const { agg, genCategoryGroupedResult } = require('../groupResult.js');
const { aggregationArry } = require('../utils');
const { filter2match } = require('../astTranslator');

const OPS_DATA_PATHS = [
	'/ops-data/ops4.mjs',
	'/app/data/ops4.mjs',
	path.join(__dirname, '..', '..', 'MongoDB', 'Preprocessing', 'ops4.mjs')
];

let cachedOpsCatalogue = null;
let cachedOpsCataloguePromise = null;
const loadOpsCatalogue = async () => {
	if (cachedOpsCatalogue) return cachedOpsCatalogue;
	if (cachedOpsCataloguePromise) return cachedOpsCataloguePromise;

	cachedOpsCataloguePromise = (async () => {
		for (const candidate of OPS_DATA_PATHS) {
			try {
				const moduleUrl = pathToFileURL(candidate).href;
				const parsedModule = await import(moduleUrl);
				const parsed = parsedModule.ops4 ?? parsedModule.default ?? [];
				if (Array.isArray(parsed)) {
					cachedOpsCatalogue = parsed;
					return cachedOpsCatalogue;
				}
			} catch (err) {
				// try next candidate
			}
		}
		console.warn('OPS catalogue file not found. Returning empty catalogue.');
		cachedOpsCatalogue = [];
		return cachedOpsCatalogue;
	})();

	return cachedOpsCataloguePromise;
};

module.exports = {
	Query: {
		getTherapyGroupedByKey: async (_parent, { groupedBy }, context) => {
			let result = await context.db
				.collection(context.collections.therapy)
				.aggregate([
					{
						$group: {
							_id: `$${groupedBy}`,
							count: { $count: {} }
						}
					},
					{
						$project: {
							_id: 0,
							label: '$_id',
							count: 1
						}
					}
				])
				.toArray();
			return result;
		},

		getTherapyOperationOPSTable: async (_parent, { filter }, context) => {
			let agg = [];
			if (filter)
				agg = await filter2match({
					value: filter,
					column: context.collections.therapy,
					db: context.db
				});
			agg.push(
				{
					$unwind: '$ops'
				},
				{
					$facet: {
						code: [
							{
								$group: {
									_id: { type: '$ops.code' },
									text: { $addToSet: '$ops.text' },
									count: { $count: {} }
								}
							},
							{ $sort: { count: -1 } },
							{
								$project: {
									code: '$_id.type',
									text: 1,
									count: 1
								}
							}
						],
						category: [
							{
								$group: {
									_id: { type: { $substr: ['$ops.code', 0, 4] } },
									count: { $count: {} }
								}
							},
							{ $sort: { count: -1 } },
							{
								$project: {
									code: '$_id.type',
									count: 1
								}
							}
						]
					}
				}
			);

			const res = await context.db.collection(context.collections.therapy).aggregate(agg).toArray();
			const opsCatalogue = await loadOpsCatalogue();
			const opsMap = new Map(
				opsCatalogue.map(({ OPSC_4, OPS_Gruppen_Text }) => [OPSC_4, OPS_Gruppen_Text])
			);
			const result = res[0] || { code: [], category: [] };

			result.code.forEach((it) => {
				const categoryText = opsMap.get(it.code.substring(0, 4));
				if (categoryText) it.category = categoryText;
			});

			result.category.forEach((it) => {
				const text = opsMap.get(it.code);
				if (text) it.text = text;
			});

			return result;
		},
		getTherapySystemicSubstanceTable: async (_parent, { filter }, context) => {
			const colname = context.collections.therapy;
			let agg = [];
			if (filter) agg = await filter2match({ value: filter, column: colname, db: context.db });
			agg.push(
				{ $unwind: '$substance' },
				{
					$group: {
						_id: '$substance.substance',
						ATCCode: { $first: '$substance.ATCCode' },
						count: { $count: {} }
					}
				},
				{ $sort: { count: -1 } },
				{
					$project: {
						label: '$_id',
						ATCCode: 1,
						count: 1
					}
				}
			);
			return context.db.collection(colname).aggregate(agg).toArray();
		},

		getTherapyGeneralComplicationChart: async (_parent, { filter }, context) => {
			const colname = context.collections.therapy;
			const unwind = { $unwind: '$complication' };
			let aggregation = [];
			const cpyagg = JSON.parse(JSON.stringify(agg.toSpliced(0, 0, unwind)));
			cpyagg[1].$group._id = {
				complication: '$complication.complication',
				label: '$complication.grade'
			};
			if (filter)
				aggregation = await filter2match({ value: filter, column: colname, db: context.db });
			aggregation.push(...cpyagg);
			let raw = await context.db.collection(colname).aggregate(aggregation).toArray();
			return genCategoryGroupedResult(raw);
		},

		// therapy.js – in getTherapyRadiationTable
		// therapy.js
		// therapy.js – in getTherapyRadiationTable
		getTherapyRadiationTable: async (_parent, args, context) => {
			if (args?.filter) {
				// 'radiation_type' -> 'type', etc. (du hattest diese Zeile schon kommentiert)
				args.filter = args.filter.replaceAll('radiation_', '');
			}

			const agg = await aggregationArry(args, context.collections.therapy, context.db);

			agg.unshift(
				// 1) Top-Level-Filter (therapy.*) VOR dem Unwind/Mapping
				{ $match: { generalType: 'radiation' /* weitere therapy.*-Filter hier */ } },

				{ $unwind: { path: '$radiation', preserveNullAndEmptyArrays: true } },

				// 2) Anstatt $project => $set: fügt nur neue/umbenannte Felder hinzu,
				//    der Rest des Dokuments bleibt erhalten.
				{
					$set: {
						type: '$radiation.type',
						brachyType: '$radiation.brachyType',
						radioTarget: '$radiation.radioTarget',
						boost: '$radiation.boost',
						totalDose: '$radiation.totalDose',
						tech: '$radiation.tech',
						radioType: '$radiation.radioType',
						radioNuclid: '$radiation.radioNuclid',
						singleDose: '$radiation.singleDose',
						singleDoseUnit: '$radiation.singleDoseUnit',
						subArea: '$radiation.subArea',
						supArea: '$radiation.supArea',
						side: '$radiation.side',
						tumor: '$radiation.tumor',
						metastasis: '$radiation.metastasis',
						lymphNodes: '$radiation.lymphNodes',
						performance: '$radiation.performance',
						duration: '$radiation.duration',
						breath: '$radiation.breath',
						stereo: '$radiation.stereo',
						areaGrouped: '$radiation.areaGrouped',
						areaDetailed: '$radiation.areaDetailed'
					}
				},

				// 3) Optional: ursprüngliches Nested-Feld loswerden
				{ $unset: 'radiation' }
			);

			// Dein generisches filter2match kannst du danach weiterhin anhängen.
			// Matches auf therapy.* sollten vor Schritt 2 kommen (wie oben).
			// Matches auf radiation_* (bzw. die flachen Aliases wie "type") kommen danach.

			return context.db.collection(context.collections.therapy).aggregate(agg).toArray();
		},

		// … im Resolver-Objekt
		getTherapyRadiationMap: async (_p, { level = 'radiation_areaDetailed', filter }, ctx) => {
			const col = ctx.collections.therapy;

			// 1) optionaler Filter → frühe Match-Stages
			const pre = [];
			if (filter) {
				const stages = await filter2match({ value: filter, column: col, db: ctx.db });
				pre.push(...stages);
			}

			// 2) Welches Feld wird als Label/Description benutzt?
			const fieldMap = {
				radiation_supArea: { label: '$radiation.supArea', description: '$radiation.areaGrouped' },
				radiation_subArea: { label: '$radiation.subArea', description: '$radiation.areaDetailed' }
			};
			const fields = fieldMap[level] ?? fieldMap.radiation_areaDetailed;

			// 3) Aggregation: distinct + counts + description
			const pipeline = [
				...pre,
				{ $unwind: { path: '$radiation', preserveNullAndEmptyArrays: false } },

				// Label/Description setzen
				{
					$set: {
						label: { $ifNull: [fields.label, ''] },
						description: { $ifNull: [fields.description, ''] }
					}
				},

				// gruppieren → DISTINCT + zählen
				{
					$group: {
						_id: { label: '$label', description: '$description' },
						count: { $sum: 1 }
					}
				},
				{
					$project: {
						_id: 0,
						label: '$_id.label',
						description: '$_id.description',
						count: 1
					}
				},

				// numerisch sortieren (damit 2 < 2.1 < 10 < 10.3 …)
				{
					$addFields: {
						_n: {
							$convert: { input: '$label', to: 'double', onError: null, onNull: null }
						}
					}
				},
				{ $sort: { _n: 1, label: 1 } },
				{ $project: { _n: 0 } }
			];

			return ctx.db.collection(col).aggregate(pipeline).toArray();
		}
	}
};
