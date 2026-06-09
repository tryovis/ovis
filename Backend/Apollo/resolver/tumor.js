const { filter2match } = require('../astTranslator');
const projection = {
	ageAtDiagnosis: '$ageAtDiagnosis',
	ICD_ICD10_3: '$ICD.ICD10_3',
	ICD10_3Text: '$ICD.ICD10_3Text',
	ICD10Text: '$ICD.ICD10Text',
	ICD_ICD10: '$ICD.ICD10',
	ICD_ICD10Group: '$ICD.ICD10Group',
	ICD10_groupdetailed: '$ICD.ICD10GroupText',
	ICDO_localizationCode: '$ICDO.localizationCode',
	ICDO_localizationCodeText: '$ICDO.localizationCodeText',
	ICDO_histologyCode: '$ICDO.histologyCode',
	ICDO_histologyCodeText: '$ICDO.histologyCodeText',
	VitalState: '$vitalState',
	primaryCase: '$primaryCase',
	centerCase: '$centerCase',
	patientCase: '$patientCase',
	side: '$side',
	grading_first: '$grading_first',
	grading_highest: 'grading_highest',
	grading_last: 'grading_last',
	grading_lowest: 'grading_lowest',
	diagnosisAssurance: '$diagnosisAssurance',
	diagnosisReason: '$diagnosisReason',
	metastasis: '$metastasis',
	gender: '$gender',
	organizationalUnit: '$organizationalUnit',
	internal: '$internal',

	years: 1,
	quarters: {
		$concat: ['$years', '-', 'Q', '$quarters']
	},
	months: {
		$concat: [
			'$years',
			'-',
			{
				$cond: [{ $lt: [{ $month: '$diagnosisDate' }, 10] }, '0', '']
			},
			'$months'
		]
	},
	weeks: {
		$concat: [
			'$years',
			'-',
			'W',
			{
				$cond: [{ $lt: [{ $week: '$diagnosisDate' }, 10] }, '0', '']
			},
			'$weeks'
		]
	},
	previousTherapy_surgery: '$previousTherapy.surgery',
	previousTherapy_systemic: '$previousTherapy.systemic',
	previousTherapy_radiation: '$previousTherapy.radiation',
	previousConsultation_nutrition: '$previousConsultation.nutrition',
	previousConsultation_social: '$previousConsultation.social',
	previousConsultation_psycho: '$previousConsultation.psycho',
	previousConsultation_genetic: '$previousConsultation.genetic',
	previousDiagnostic_radiology: '$previousDiagnostic.radiology',
	previousTumorboard_any: '$previousTumorboard.any',
	previousTumorboard_prae: '$previousTumorboard.prae',
	previousTumorboard_post: '$previousTumorboard.post',
	previousTumorboard_mtb: '$previousTumorboard.mtb',
	recurrence: '$recurrence',
	distress: '$distress',

	ECOG_first: {
		$ifNull: [
			{ $arrayElemAt: ['$fECOG', 0] },
			{ $ifNull: [{ $first: '$xECOG' }, { $first: '$ECOG' }] }
		]
	},
	ECOG_last: {
		$ifNull: [
			{ $arrayElemAt: ['$fECOG', -1] },
			{ $ifNull: [{ $last: '$xECOG' }, { $last: '$ECOG' }] }
		]
	},
	ECOG_lowest: {
		$ifNull: [{ $min: '$fECOG' }, { $ifNull: [{ $min: '$xECOG' }, { $min: '$ECOG' }] }]
	},
	ECOG_highest: {
		$ifNull: [{ $max: '$fECOG' }, { $ifNull: [{ $max: '$xECOG' }, { $max: '$ECOG' }] }]
	},
	grading_first: { $first: '$icdograding' },
	grading_last: { $last: '$icdograding' },
	grading_lowest: {
		$arrayElemAt: [
			{
				$filter: {
					input: '$icdograding',
					as: 'item',
					cond: { $eq: ['$$item.ordinal', { $min: '$icdograding.ordinal' }] }
				}
			},
			0
		]
	},
	grading_highest: {
		$arrayElemAt: [
			{
				$filter: {
					input: '$icdograding',
					as: 'item',
					cond: { $eq: ['$$item.ordinal', { $max: '$icdograding.ordinal' }] }
				}
			},
			0
		]
	}
};

const Query = {
	getTumors: async (
		_parent,
		{ groupedBy: { group, genderWise, abscissa, from, until }, filter },
		context
	) => {
		let _id = { label: `$${group}`, sum: '$sum', labelOrder: '$icd10Order' };
		let $project = {};
		let aggregations = [];
		let $match = { months: {} };
		if (filter)
			aggregations = await filter2match({
				value: filter,
				column: context.collections.diagnosis,
				db: context.db
			});
		aggregations.push(
			{
				$set: {
					years: { $toString: { $year: '$diagnosisDate' } },
					months: { $toString: { $month: '$diagnosisDate' } },
					weeks: { $toString: { $week: '$diagnosisDate' } },
					quarters: {
						$toString: {
							$ceil: {
								$divide: [{ $month: '$diagnosisDate' }, 3]
							}
						}
					},
					ICDO: {
						$first: {
							$filter: {
								input: '$ICDO',
								cond: { $eq: ['$$this.source', 'diagnosis'] }
							}
						}
					},
					fECOG: {
						$filter: { input: '$ECOG', as: 'e', cond: { $in: ['$$e', ['0', '1', '2', '3', '4']] } }
					},
					xECOG: { $filter: { input: '$ECOG', as: 'e', cond: { $in: ['$$e', ['X']] } } },
					icdograding: {
						$map: {
							input: '$ICDO.grading',
							as: 'it',
							in: {
								grading: '$$it',
								ordinal: {
									$switch: {
										branches: [
											{ case: { $eq: ['$$it', 'unbekannt'] }, then: -2 },
											{ case: { $eq: ['$$it', 'Trifft nicht zu'] }, then: -1 },
											{ case: { $eq: ['$$it', 'Differenzierungsgrad nicht bestimmbar'] }, then: 0 },
											{ case: { $eq: ['$$it', '0'] }, then: 1 },
											{ case: { $eq: ['$$it', '1'] }, then: 2 },
											{
												case: {
													$regexMatch: { input: '$$it', regex: '^niedriggradig', options: 'i' }
												},
												then: 3
											},
											{ case: { $eq: ['$$it', '2'] }, then: 4 },
											{
												case: {
													$regexMatch: {
														input: '$$it',
														regex: '^mittelgradig maligne',
														options: 'i'
													}
												},
												then: 5
											},
											{ case: { $eq: ['$$it', '3'] }, then: 6 },
											{
												case: {
													$regexMatch: { input: '$$it', regex: '^hochgradig', options: 'i' }
												},
												then: 7
											},
											{ case: { $eq: ['$$it', '4'] }, then: 8 }
										],
										default: -3
									}
								}
							}
						}
					}
				}
			},
			{
				$project
			},
			{
				$set: {
					grading_first: '$grading_first.grading',
					grading_last: '$grading_last.grading',
					grading_lowest: '$grading_lowest.grading',
					grading_highest: '$grading_highest.grading'
				}
			},
			{
				$match
			},
			{
				$group: {
					_id: { label: `$${group}` },
					pre: { $push: '$$ROOT' },
					sum: { $count: {} }
				}
			},
			{
				$unwind: '$pre'
			},
			{
				$sort: { sum: -1 }
			},
			{
				$replaceRoot: { newRoot: { $mergeObjects: ['$pre', { sum: '$sum' }] } }
			},
			{
				$group: {
					_id,
					extra: { $first: '$ICD10Text' },
					//extra: { $addToSet: "$ICD10Text" },
					count: { $count: {} }
				}
			},
			{
				$sort: { '_id.sum': -1, '_id.label': 1, '_id.gender': 1 }
			}
		);

		if (genderWise) {
			_id.gender = '$gender';
			$project.gender = projection.gender;
		}

		if (abscissa !== 'none') {
			_id.abscissa = `$${abscissa}`;
			$project[abscissa] = projection[abscissa];
		}

		switch (group) {
			case 'ICD_ICD10_3':
				$project.ICD_ICD10_3 = projection.ICD_ICD10_3;
				$project.ICD10Text = projection.ICD10_3Text;
				break;
			case 'ICD_ICD10':
				$project.ICD_ICD10 = projection.ICD_ICD10;
				$project.ICD10Text = projection.ICD10Text;
				break;
			case 'ICD_ICD10Group':
				$project.ICD_ICD10Group = projection.ICD_ICD10Group;
				$project.ICD10Text = projection.ICD10_groupdetailed;
				break;
			case 'ICDO_localizationCode':
				$project.ICDO_localizationCode = projection.ICDO_localizationCode;
				$project.ICD10Text = projection.ICDO_localizationCodeText;
				break;
			case 'ICDO_histologyCode':
				$project.ICDO_histologyCode = projection.ICDO_histologyCode;
				$project.ICD10Text = projection.ICDO_histologyCodeText;
				break;
			default:
				$project[group] = projection[group];
				break;
		}

		if (from) {
			$match.months.$gte = from;
			$project.months = projection.months;
		}
		if (until) {
			$match.months.$lte = until;
			$project.months = projection.months;
		}

		if (group === 'ageAtDiagnosis') {
			const ageGroup = [
				{
					$bucket: {
						groupBy: '$ageAtDiagnosis',
						boundaries: [0, 18, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110],
						default: 'Other',
						output: {
							props: {
								$push: {
									[`${abscissa}`]: `$${abscissa}`,
									gender: '$gender',
									icd10Order: '$icd10Order'
								}
							}
						}
					}
				},
				{
					$unwind: '$props'
				},
				{
					$replaceRoot: { newRoot: { $mergeObjects: ['$props', { ageAtDiagnosis: '$_id' }] } }
				}
			];
			aggregations.splice(4, 0, ...ageGroup);
		}

		if (abscissa === 'ICD_ICD10_3') {
			const abscissaAgg = [
				{
					$group: {
						_id: '$ICD_ICD10_3',
						count: { $count: {} },
						props: {
							$push: {
								gender: '$gender',
								//   ICD_ICD10: '$icd10',
								ICD10Text: '$ICD10Text',
								[`${group}`]: `$${group}`
							}
						}
					}
				},
				{
					$unwind: '$props'
				},
				{
					$replaceRoot: {
						newRoot: { $mergeObjects: ['$props', { ICD_ICD10_3: '$_id', icd10Order: '$count' }] }
					}
				}
			];
			aggregations.splice(4, 0, ...abscissaAgg);
		}

		if (Object.keys($match.months).length === 0) delete $match.months;
		let result = await context.db
			.collection(context.collections.diagnosis)
			.aggregate(aggregations)
			.toArray();

		let TumorsGrouped = { category: [], groups: [] };
		let category = new Set();
		let categoryOrder = [];

		result.forEach((it) => {
			const initCategorySize = category.size;
			category.add(it._id.abscissa);
			if (category.size > initCategorySize) categoryOrder.push(it._id.labelOrder);
		});

		TumorsGrouped.category.push(...category);
		if (abscissa !== 'ICD_ICD10_3') TumorsGrouped.category.sort();
		else
			TumorsGrouped.category.sort((a, b) => {
				const aIndex = TumorsGrouped.category.indexOf(a);
				const bIndex = TumorsGrouped.category.indexOf(b);
				return categoryOrder[aIndex] - categoryOrder[bIndex];
			});

		result.forEach((it) => {
			let found = TumorsGrouped.groups.find(
				({ label, gender }) => it._id.label == label && it._id.gender == gender
			);
			if (!found) {
				const entry = {
					label: it._id.label,
					gender: it._id.gender,
					count: Array(TumorsGrouped.category.length).fill(0),
					description: it.extra
				};
				TumorsGrouped.groups.push(entry);
				found = entry;
			}
			const categoryIndex = TumorsGrouped.category.indexOf(it._id.abscissa);
			found.count[categoryIndex] = it.count;
		});
		return TumorsGrouped;
	}
};

module.exports = { Query };
