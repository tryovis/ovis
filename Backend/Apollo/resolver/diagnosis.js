const { aggregationArry } = require('../utils');
const { filter2match } = require('../astTranslator');

module.exports = {
	Query: {
		getPatientCohortAgeChart: async (_parent, { filter }, context) => {
			const colname = context.collections.diagnosis;
			let agg = [];
			if (filter) agg = await filter2match({ value: filter, column: colname, db: context.db });
			agg.push(
				{
					$match: {
						ageAtDiagnosis: { $ne: null }
					}
				},
				{
					$group: {
						_id: '$ageAtDiagnosis',
						count: { $count: {} }
					}
				},
				{
					$project: {
						_id: 0,
						ageAtDiagnosis: '$_id',
						count: 1
					}
				},
				{
					$sort: { ageAtDiagnosis: 1 }
				}
			);
			return await context.db.collection(colname).aggregate(agg).toArray();
		},

		getQuicktoolsBasicsIcd10: async (_parent, _args, context) =>
			(
				await context.db
					.collection(context.collections.diagnosis)
					.aggregate([
						{
							$match: {
								'ICD.ICD10': { $type: 'string' },
								'ICD.ICD10_3Text': { $type: 'string' },
								'ICD.ICD10_3': { $type: 'string' }
							}
						},
						{
							$group: {
								_id: null,
								icd10: { $addToSet: { $concat: ['$ICD.ICD10', ' → ', '$TZE_D_LOKT'] } },
								icd10_3: { $addToSet: { $concat: ['$ICD.ICD10_3', ' → ', '$ICD.ICD10_3Text'] } },
								icd10group: {
									$addToSet: { $concat: ['$ICD.ICD10Group', ' → ', '$ICD.ICD10GroupText'] }
								}
							}
						},
						{
							$project: {
								combinedICD: {
									$sortArray: {
										input: { $setUnion: ['$icd10', '$icd10_3', '$icd10group'] },
										sortBy: 1
									}
								}
							}
						},
						{
							$sort: { combinedICD: 1 }
						}
					])
					.toArray()
			)[0].combinedICD,

		getQuicktoolsBasicsHistology: async (_parent, _args, context) =>
			(
				await context.db
					.collection(context.collections.diagnosis)
					.aggregate([
						{
							$unwind: '$ICDO'
						},
						{
							$match: {
								'ICDO.histologyCodeText': { $type: 'string' },
								'ICDO.histologyCode': { $type: 'string' }
							}
						},
						{
							$group: {
								_id: null,
								histology: {
									$addToSet: { $concat: ['$ICDO.histologyCode', ' → ', '$ICDO.histologyCodeText'] }
								}
							}
						},
						{
							$project: {
								hist: {
									$sortArray: {
										input: '$histology',
										sortBy: 1
									}
								}
							}
						},
						{
							$sort: { hist: 1 }
						}
					])
					.next()
			).hist,

		getDiagnosisHistologyTable: async (_parent, args, context) => {
			const aggregation = await aggregationArry(
				{ ...args },
				context.collections.diagnosis,
				context.db
			);
			aggregation.push(
				{
					$unwind: '$ICDO'
				},
				{
					$project: {
						_id: 1,
						tumorID: 1,
						ICDO_histologyCode: '$ICDO.histologyCode',
						ICDO_histologyCodeText: '$ICDO.histologyCodeText',
						ICDO_histologyDate: '$ICDO.histologyDate',
						ICDO_source: '$ICDO.source',
						ICDO_mixedTumor: '$ICDO.mixedTumor',
						ICDO_grading: '$ICDO.grading',
						ICDO_Nb: '$ICDO.Nb',
						ICDO_Nu: '$ICDO.Nu',
						ICDO_sNb: '$ICDO.sNb',
						ICDO_sNu: '$ICDO.sNu'
					}
				}
			);
			return await context.db
				.collection(context.collections.diagnosis)
				.aggregate(aggregation)
				.toArray();
		},
		getPatientCohortHistoryTable: async (_parent, args, context) => {
			const aggregation = await aggregationArry(args, context.collections.diagnosis, context.db);
			aggregation.push({
				$project: {
					ICDO: {
						$first: {
							$filter: {
								input: '$ICDO',
								cond: { $eq: ['$$this.source', 'diagnosis'] }
							}
						}
					},
					_id: 1,
					tumorID: 1,
					patID: 1,
					reportID: 1,
					diagnosisDate: 1,
					source: 1,
					mixedTumor: 1,
					ICD: 1,
					ageAtDiagnosis: 1
				}
			});
			return await context.db
				.collection(context.collections.diagnosis)
				.aggregate(aggregation)
				.toArray();
		}
	}
};
