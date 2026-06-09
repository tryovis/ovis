const { filter2match } = require('../astTranslator');

module.exports = {
	Query: {
		/**
		 * Computes follow-up rates per DIAGNOSIS YEAR.
		 * A tumor contributes to the numerator for year Y iff:
		 *  - deathDate exists and deathDate <= eval 'till' (Auswertezeitpunkt), OR
		 *  - (includeTherapy && any therapyStartDate or therapyEndDate inside [from, till]), OR
		 *  - any progressDate inside [from, till], OR
		 *  - (includeVital && vitalDate inside [from, till]).
		 * The denominator is the number of distinct tumors diagnosed in that diagnosis year.
		 */
		getSurvivalFollowUpAssessment: async (
			_parent,
			{ from, till, includeTherapy, includeVital, filter },
			context
		) => {
			const fromDate = new Date(from);
			const tillDate = new Date(till);

			// translate optional filter into aggregation stages (as in kaplanMeier / therapy)
			let pre = [];
			if (filter) {
				pre = await filter2match({
					value: filter,
					column: context.collections.followup,
					db: context.db
				});
			}

			const col = context.db.collection(context.collections.followup);

			// Build the aggregation in a single pass so we cannot accidentally "spread" stages inside $match.
			const pipeline = [
				...pre,
				{ $match: { diagnosisDate: { $exists: true } } },

				// compute diagnosis year and the boolean flags that qualify for follow-up in the evaluation interval
				{
					$set: {
						diagyear: { $year: '$diagnosisDate' },
						deathOK: {
							$and: [{ $ne: ['$deathDate', null] }, { $lte: ['$deathDate', tillDate] }]
						},
						therapyOK: includeTherapy
							? {
									$gt: [
										{
											$size: {
												$setUnion: [
													{
														$filter: {
															input: { $ifNull: ['$therapyStartDate', []] },
															as: 'd',
															cond: {
																$and: [{ $gte: ['$$d', fromDate] }, { $lte: ['$$d', tillDate] }]
															}
														}
													},
													{
														$filter: {
															input: { $ifNull: ['$therapyEndDate', []] },
															as: 'd',
															cond: {
																$and: [{ $gte: ['$$d', fromDate] }, { $lte: ['$$d', tillDate] }]
															}
														}
													}
												]
											}
										},
										0
									]
							  }
							: false,
						progressOK: {
							$gt: [
								{
									$size: {
										$filter: {
											input: { $ifNull: ['$progressDate', []] },
											as: 'd',
											cond: {
												$and: [{ $gte: ['$$d', fromDate] }, { $lte: ['$$d', tillDate] }]
											}
										}
									}
								},
								0
							]
						},
						vitalOK: includeVital
							? {
									$and: [
										{ $ne: ['$vitalDate', null] },
										{ $gte: ['$vitalDate', fromDate] },
										{ $lte: ['$vitalDate', tillDate] }
									]
							  }
							: false
					}
				},
				{
					$set: {
						validFollowup: {
							$or: ['$deathOK', '$therapyOK', '$progressOK', '$vitalOK']
						}
					}
				},
				// ignore future diagnosis years after 'till' year to keep buckets bounded
				{ $match: { diagyear: { $lte: +till.substring(0, 4) } } },
				// group by diagnosis year
				{
					$group: {
						_id: '$diagyear',
						denomSet: { $addToSet: '$tumorID' },
						numerSet: {
							$addToSet: {
								$cond: ['$validFollowup', '$tumorID', null]
							}
						}
					}
				},
				// remove nulls from numerSet
				{
					$project: {
						denomSet: 1,
						numerSet: {
							$filter: { input: '$numerSet', as: 't', cond: { $ne: ['$$t', null] } }
						}
					}
				},
				// convert sets to counts
				{
					$project: {
						_id: 1,
						denominator: { $size: '$denomSet' },
						numerator: { $size: '$numerSet' }
					}
				},
				{
					$project: {
						_id: 1,
						denominator: 1,
						numerator: 1,
						percentage: {
							$cond: [
								{ $gt: ['$denominator', 0] },
								{ $multiply: [{ $divide: ['$numerator', '$denominator'] }, 100] },
								0
							]
						}
					}
				},
				{ $sort: { _id: 1 } }
			];

			const rows = await col.aggregate(pipeline).toArray();

			// Prepare response structure compatible with existing client
			let res = { followup: [], year: [] };
			for (const r of rows) {
				res.year.push(r._id);
				res.followup.push({
					denominator: r.denominator,
					numerator: r.numerator,
					percentage: r.percentage
				});
			}

			// ---- Limit output to last 11 years without changing core logic ----
			try {
				const N_YEARS = 11;
				const yearsSortedAsc = Array.isArray(res.year) ? [...res.year].sort((a, b) => a - b) : [];
				const lastYears = yearsSortedAsc.slice(-N_YEARS);
				const lastSet = new Set(lastYears);
				if (Array.isArray(res.followup) && Array.isArray(res.year)) {
					const trimmedFollowup = res.followup.filter((_, i) => lastSet.has(res.year[i]));
					const trimmedYears = res.year.filter((y) => lastSet.has(y));
					res.followup = trimmedFollowup;
					res.year = trimmedYears;
				}
			} catch (e) {
				// no-op
			}
			// ---- End limit block ----

			return res;
		}
	}
};
