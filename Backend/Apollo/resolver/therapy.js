const { agg, genCategoryGroupedResult } = require('../groupResult.js');
const { buildTherapyRadiationAggregation } = require('./therapyRadiationTable');
const { filter2match } = require('../astTranslator');

module.exports = {
	Query: {
		getTherapyGroupedByKey: async (_parent, { groupedBy, filter }, context) => {
			const stages = filter
				? await filter2match({ value: filter, column: context.collections.therapy, db: context.db })
				: [];
			let result = await context.db
				.collection(context.collections.therapy)
				.aggregate([
					...stages,
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
									category: { $max: '$ops.text4' },
									count: { $count: {} }
								}
							},
							{ $sort: { count: -1 } },
							{
								$project: {
									code: '$_id.type',
									text: 1,
									category: 1,
									count: 1
								}
							}
						],
						category: [
							{
								$group: {
									_id: { type: { $substr: ['$ops.code', 0, 4] } },
									text: { $max: '$ops.text4' },
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
						]
					}
				}
			);

			const res = await context.db.collection(context.collections.therapy).aggregate(agg).toArray();
			return res[0] || { code: [], category: [] };
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

		getTherapyRadiationTable: async (_parent, args, context) => {
			return context.db
				.collection(context.collections.therapy)
				.aggregate(await buildTherapyRadiationAggregation(args, context))
				.toArray();
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
