const { filter2match } = require('../astTranslator');

/**
 * Kaplan–Meier chart backend mapping.
 *
 * date  -> field (days since relevant start)
 * status-> 1 event, 0 censored
 */
const type2Field = {
	overallSurvival: { date: 'vitalDiag', status: 'vitalState' },

	// Metastasis-free survival: event only for metachronous metastasis (metastasis===1).
	// Synch/both (metastasis===2) are excluded in getAggre() to match the +page definition.
	metastasis: { date: 'metastaseDiag', status: 'metastasisEvent' },

	recurrence: { date: 'rezidivDiag', status: 'recurrence' },

	// PFS: progress (incl. recurrence label if configured) OR death, censored at last follow-up
	progression: { date: 'pfsDiag', status: 'pfsEvent' },

	// Survival after progression: start = firstProgressDate, event = death, censor = last follow-up
	postprogression: { date: 'vitalProgress', status: 'vitalState' },

	// DFS: start = dfsDate (tumor-free), event = progression OR death, censor = last follow-up
	dfs: { date: 'dfsVital', status: 'dfsEvent' },
	diseaseFreeSurvival: { date: 'dfsVital', status: 'dfsEvent' }
};

const stratField = {
	age: 'age',
	gender: 'gender',
	UICC: 'UICC',
	TStage: 'TStage',
	metastasisStrat: 'metastasisStrat'
};

const diff = ({ startDate = '$diagnosisDate', endDate }) => ({
	$dateDiff: {
		startDate,
		endDate,
		unit: 'day',
		startOfWeek: 'mon'
	}
});

const ifDates = (startExpr, endExpr, diffExpr) => ({
	$cond: [{ $and: [{ $ne: [startExpr, null] }, { $ne: [endExpr, null] }] }, diffExpr, null]
});

const aggre = [
	{
		$set: {
			diagnosisYear: { $year: '$diagnosisDate' },
			daysSurvived: diff({ endDate: '$$NOW' }),

			// OS
			vitalDiag: ifDates('$diagnosisDate', '$vitalDate', diff({ endDate: '$vitalDate' })),

			// MFS (firstMetastasisDate is already censor/event date in preprocessing)
			metastaseDiag: ifDates(
				'$diagnosisDate',
				'$firstMetastasisDate',
				diff({ endDate: '$firstMetastasisDate' })
			),

			// RFS
			rezidivDiag: ifDates(
				'$diagnosisDate',
				'$recurrenceDate',
				diff({ endDate: '$recurrenceDate' })
			),

			// Progression date since diagnosis (for debugging/older UI)
			progressDiag: ifDates(
				'$diagnosisDate',
				'$firstProgressDate',
				diff({ endDate: '$firstProgressDate' })
			),

			// PFS date since diagnosis (progress OR death OR censor date)
			pfsDiag: ifDates(
				'$diagnosisDate',
				'$firstProgressDeathDate',
				diff({ endDate: '$firstProgressDeathDate' })
			),

			// Survival after progression (only meaningful if firstProgressDate exists)
			vitalProgress: ifDates(
				'$firstProgressDate',
				'$vitalDate',
				diff({ startDate: '$firstProgressDate', endDate: '$vitalDate' })
			),
			// DFS: from tumor-free date (dfsDate) to FIRST progression OR death AFTER dfsDate; otherwise censored at last follow-up (vitalDate).
			// This yields proper censoring for patients without progression and without death.
			dfsEvent: {
				$let: {
					vars: {
						progAfter: {
							$cond: [
								{
									$and: [
										{ $ne: ['$dfsDate', null] },
										{ $ne: ['$firstProgressDate', null] },
										{ $gte: ['$firstProgressDate', '$dfsDate'] }
									]
								},
								'$firstProgressDate',
								null
							]
						},
						deathAfter: {
							$cond: [
								{
									$and: [
										{ $ne: ['$dfsDate', null] },
										{ $eq: ['$vitalState', 1] },
										{ $ne: ['$vitalDate', null] },
										{ $gte: ['$vitalDate', '$dfsDate'] }
									]
								},
								'$vitalDate',
								null
							]
						}
					},
					in: {
						$cond: [
							{ $or: [{ $ne: ['$$progAfter', null] }, { $ne: ['$$deathAfter', null] }] },
							1,
							0
						]
					}
				}
			},

			dfsVital: {
				$let: {
					vars: {
						progAfter: {
							$cond: [
								{
									$and: [
										{ $ne: ['$dfsDate', null] },
										{ $ne: ['$firstProgressDate', null] },
										{ $gte: ['$firstProgressDate', '$dfsDate'] }
									]
								},
								'$firstProgressDate',
								null
							]
						},
						deathAfter: {
							$cond: [
								{
									$and: [
										{ $ne: ['$dfsDate', null] },
										{ $eq: ['$vitalState', 1] },
										{ $ne: ['$vitalDate', null] },
										{ $gte: ['$vitalDate', '$dfsDate'] }
									]
								},
								'$vitalDate',
								null
							]
						}
					},
					in: {
						$let: {
							vars: {
								dfsEnd: {
									$cond: [
										{ $and: [{ $ne: ['$$progAfter', null] }, { $ne: ['$$deathAfter', null] }] },
										{
											$cond: [
												{ $lt: ['$$progAfter', '$$deathAfter'] },
												'$$progAfter',
												'$$deathAfter'
											]
										},
										{
											$cond: [
												{ $ne: ['$$progAfter', null] },
												'$$progAfter',
												{ $cond: [{ $ne: ['$$deathAfter', null] }, '$$deathAfter', '$vitalDate'] }
											]
										}
									]
								}
							},
							in: ifDates(
								'$dfsDate',
								'$$dfsEnd',
								diff({ startDate: '$dfsDate', endDate: '$$dfsEnd' })
							)
						}
					}
				}
			},

			// Event flag for MFS (metachronous metastasis only)
			metastasisEvent: {
				$cond: [{ $eq: ['$metastasis', 1] }, 1, 0]
			},

			// Event flag for PFS (already computed in preprocessing as progressDeath)
			pfsEvent: '$progressDeath'
		}
	},
	{
		$project: {
			tumorID: 1,
			diagnosisYear: 1,
			diagnosisDate: 1,

			vitalDate: 1,
			vitalDiag: 1,
			vitalState: 1,

			firstMetastasisDate: 1,
			metastaseDiag: 1,
			metastasis: 1,
			metastasisEvent: 1,
			metastasisStrat: 1,

			recurrenceDate: 1,
			rezidivDiag: 1,
			recurrence: 1,

			firstProgressDate: 1,
			progressDiag: 1,

			firstProgressDeathDate: 1,
			pfsDiag: 1,
			pfsEvent: 1,

			vitalProgress: 1,

			dfsDate: 1,
			dfsVital: 1,
			dfsEvent: 1,

			ICD10: 1,
			gender: 1,
			age: 1,
			UICC: 1,
			TStage: 1
		}
	}
];

const getAggre = (kpType, type) => {
	const sort = { $sort: { [kpType]: 1 } };

	// Only keep docs where the selected kpType can be computed
	const match = { $match: { [kpType]: { $gte: 0 } } };

	// Match +page definition: exclude synchronous/both metastasis cases for metastasis-free survival
	if (type === 'metastasis') {
		match.$match.metastasis = { $ne: 2 };
	}

	return [...aggre, match, sort];
};

module.exports = {
	Query: {
		getSurvivalKaplanMeierChart: async (
			_parent,
			{ type, strat, source, filter },
			context,
			_info
		) => {
			const col = source === 'sql' ? 'ockaplanMeier' : context.collections.kaplanmeier;

			if (!type2Field[type]) {
				throw new Error(`Unknown KM type: ${type}`);
			}

			const date = type2Field[type].date;
			const stat = type2Field[type].status;
			const group = stratField[strat] ?? null;

			const pipeline = [];
			if (filter) {
				const arr = await filter2match({
					value: filter,
					column: context.collections.kaplanmeier,
					db: context.db
				});
				pipeline.push(...arr);
			}
			pipeline.push(...getAggre(date, type));

			const res = await context.db.collection(col).aggregate(pipeline).toArray();

			const kp = [];
			res.forEach((ele) => {
				kp.push({
					dateDiff: ele[date],
					status: ele[stat],
					groupe: group ? ele[group] ?? '0' : '0',
					tumorID: ele.tumorID
				});
			});

			return kp;
		}
	}
};
