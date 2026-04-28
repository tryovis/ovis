const { filter2match } = require('../astTranslator');

const genPatQuery = (collection, patID, fields) => {
	console.log(`${patID}, ${fields}`);
	const agg = [
		{
			$match: patID
		},
		{
			$project: {
				_id: 0,
				...fields
			}
		}
	];
	console.dir(agg, { depth: null });
	const res = collection.aggregate(agg).toArray();
	return res;
};

const genAggregatedRes = (raw) => {
	const label = [],
		count = [];
	raw.forEach((element) => {
		label.push(element._id);
		count.push(element.count);
	});
	return { label, count };
};

module.exports = {
	Query: {
		getPatientCohortGenderChart: async (_parent, { filter }, context) => {
			const colname = context.collections.patient;
			let agg = [];
			if (filter) agg = await filter2match({ value: filter, column: colname, db: context.db });
			agg.push(
				{
					$group: {
						_id: '$gender',
						count: { $count: {} }
					}
				},
				{ $sort: { count: -1 } }
			);
			const res = await context.db.collection(colname).aggregate(agg).toArray();
			return genAggregatedRes(res);
		},

		getPatientCohortDeathChart: async (_parent, { filter }, context) => {
			const colname = context.collections.patient;
			let agg = [];
			if (filter) agg = await filter2match({ value: filter, column: colname, db: context.db });
			agg.push(
				{
					$group: {
						_id: '$vitalState',
						count: { $count: {} }
					}
				},
				{ $sort: { count: -1 } }
			);
			const res = await context.db.collection(colname).aggregate(agg).toArray();
			return genAggregatedRes(res);
		},

		getPatientCohortMapChart: async (_parent, { level, filter }, context) => {
			const colname = context.collections.patient;
			const group = {
				_id: `$${level}`,
				count: { $count: {} }
			};
			let agg = [];
			if (level === 'postalCode') group.description = { $first: '$district' };
			if (level === 'countryCode') group.description = { $first: '$countryName' };
			if (filter) agg = await filter2match({ value: filter, column: colname, db: context.db });
			agg.push(
				{
					$set: {
						desc: '$postalCode',
						countryCode: '$countryCode',
						county: '$county',
						postalCode: '$postalCode'
					}
				},
				{
					$group: group
				},
				{ $sort: { count: -1 } },
				{
					$project: {
						label: '$_id',
						description: 1,
						count: 1
					}
				}
			);
			return await context.db.collection(colname).aggregate(agg).toArray();
		},

		getPatientSingleHeader: async (_parent, { patID }, context) => {
			const res = (
				await context.db
					.collection(context.collections.patient)
					.aggregate([
						{
							$match: { patID }
						},
						{
							$lookup: {
								from: context.collections.diagnosis,
								localField: 'patID',
								foreignField: 'patID',
								as: 'fstAss',
								pipeline: [
									{
										$project: {
											_id: 0,
											icd10: '$ICD.ICD10',
											diagnosisDate: 1,
											ageAtDiagnosis: 1
										}
									},
									{
										$sort: {
											diagnosisDate: 1
										}
									}
								]
							}
						},
						{
							$set: {
								diagnosis: { $setUnion: [[], '$fstAss.icd10'] },
								ageAtDiagnosis: { $min: '$fstAss.ageAtDiagnosis' }
							}
						}
					])
					.toArray()
			)[0];
			res.diagnosis = res.diagnosis.join(', ');
			return res;
		},
		getPatientOverview: async (_parent, { patID }, context) => {
			const diag = genPatQuery(
				context.db.collection(context.collections.diagnosis),
				{ patID },
				{
					x: '$diagnosisDate',
					y: 'Diagnose',
					label: '$ICD.ICD10'
				}
			);

			const hstl = genPatQuery(
				context.db.collection(context.collections.diagnosis),
				{ patID },
				{
					x: '$diagnosisDate',
					y: 'Histology',
					label: {
						$reduce: {
							input: '$ICDO',
							initialValue: '',
							in: {
								$concat: [
									'$$value',
									{ $cond: { if: { $eq: ['$$value', ''] }, then: '', else: ';' } },
									'$$this.histologyCode'
								]
							}
						}
					}
				}
			);

			const dstc = genPatQuery(
				context.db.collection(context.collections.diagnostic),
				{ patID },
				{
					x: '$diagnosticOccurrenceDate',
					y: 'Diagnostik',
					label: '$investigationMethod'
				}
			);

			const curs = genPatQuery(
				context.db.collection(context.collections.progress),
				{ patID },
				{
					x: '$progressOccurrenceDate',
					y: 'Krankheitsverlauf',
					label: '$overallAssessment'
				}
			);

			const thpy = genPatQuery(
				context.db.collection(context.collections.therapy),
				{ patID },
				{
					x: '$therapyOccurrenceDate',
					y: {
						$switch: {
							branches: [
								{
									case: { $eq: ['$generalType', 'operation'] },
									then: 'Operation'
								},
								{
									case: { $eq: ['$generalType', 'radiation'] },
									then: 'Bestrahlung'
								},
								{
									case: { $eq: ['$generalType', 'systemic'] },
									then: 'Syst. Therapy'
								}
							],
							default: 'Sonstige Therapie'
						}
					},
					label: {
						$switch: {
							branches: [
								{
									case: { $eq: ['$generalType', 'operation'] },
									then: {
										$reduce: {
											input: '$ops',
											initialValue: '',
											in: {
												$concat: [
													'$$value',
													{ $cond: { if: { $eq: ['$$value', ''] }, then: '', else: ';' } },
													'$$this.code'
												]
											}
										}
									}
								},
								{
									case: { $eq: ['$generalType', 'radiation'] },
									then: {
										$reduce: {
											input: '$radiation',
											initialValue: '',
											in: {
												$concat: [
													'$$value',
													{ $cond: { if: { $eq: ['$$value', ''] }, then: '', else: ';' } },
													'$$this.type'
												]
											}
										}
									}
								},
								{
									case: { $eq: ['$generalType', 'systemic'] },
									then: '$subType'
								}
							],
							default: '$subType'
						}
					}
				}
			);

			// const tnm = genPatQuery(context.db.collection(context.collections.tnm), { patID }, {
			//     x: "$progressOccurrenceDate",
			//     y: "tnm",
			//     label: "$investigationMethod"
			// })

			const csltn = genPatQuery(
				context.db.collection(context.collections.consultation),
				{ patID },
				{
					x: '$consultationOccurrenceDate',
					y: 'Consultation',
					label: '$type'
				}
			);

			const tb = genPatQuery(
				context.db.collection(context.collections.tumorBoard),
				{ patID },
				{
					x: '$tumorBoardOccurrenceDate',
					y: 'Tumor-Board',
					label: '$type'
				}
			);

			const bmtr = genPatQuery(
				context.db.collection(context.collections.bioMaterial),
				{ patID },
				{
					x: '$bioMaterialOccurrenceDate',
					y: 'Bio Material',
					label: '$type'
				}
			);

			const mlmk = genPatQuery(
				context.db.collection(context.collections.molecularmarker),
				{ patID },
				{
					x: '$molecularMarkerOccurrenceDate',
					y: 'Molecular Marker',
					label: '$type'
				}
			);

			const stat = genPatQuery(
				context.db.collection(context.collections.status),
				{ patID },
				{
					x: '$statusOccurrenceDate',
					y: 'Status',
					label: '$type'
				}
			);

			const splm = genPatQuery(
				context.db.collection(context.collections.supplementary),
				{ patID },
				{
					x: '$supplementaryOccurrenceDate',
					y: 'Supplementary',
					label: '$type'
				}
			);

			const mtas = genPatQuery(
				context.db.collection(context.collections.metastasis),
				{ patID },
				{
					x: '$metastasisDate',
					y: 'Metastasis',
					label: '$metastasisLocation'
				}
			);

			const stdy = genPatQuery(
				context.db.collection(context.collections.study),
				{ 'studyPatients.patID': patID },
				{
					x: {
						$arrayElemAt: [
							{
								$map: {
									input: {
										$filter: {
											input: '$studyPatients',
											as: 'spat',
											cond: { $eq: ['$$spat.patID', patID] }
										}
									},
									as: 'it',
									in: '$$it.recruitmentDate'
								}
							},
							0
						]
					},
					y: 'Study',
					label: '$shortname'
				}
			);
			const res = await Promise.all([
				diag,
				dstc,
				curs,
				thpy,
				csltn,
				tb,
				bmtr,
				mlmk,
				stat,
				splm,
				stdy,
				mtas,
				hstl
			]);
			return res.reduce((acc, it) => acc.concat(it));
		}
	}
};
