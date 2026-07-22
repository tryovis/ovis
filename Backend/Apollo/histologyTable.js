const diagnosisHistologyRowStages = [
	{
		$unwind: {
			path: '$ICDO',
			includeArrayIndex: '__histologyIndex'
		}
	},
	{
		$project: {
			_id: 1,
			tumorID: 1,
			patID: 1,
			ICDO_histologyCode: '$ICDO.histologyCode',
			ICDO_histologyCodeText: '$ICDO.histologyCodeText',
			ICDO_histologyDate: '$ICDO.histologyDate',
			ICDO_source: '$ICDO.source',
			ICDO_mixedTumor: '$ICDO.mixedTumor',
			ICDO_grading: '$ICDO.grading',
			ICDO_Nb: '$ICDO.Nb',
			ICDO_Nu: '$ICDO.Nu',
			ICDO_sNb: '$ICDO.sNb',
			ICDO_sNu: '$ICDO.sNu',
			__histologyIndex: 1
		}
	}
];

module.exports = { diagnosisHistologyRowStages };
