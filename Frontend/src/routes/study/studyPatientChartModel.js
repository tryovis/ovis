export function buildStudyChartRows(studies) {
	return (studies ?? [])
		.filter((study) => study && typeof study.shortname === 'string')
		.map((study) => ({
			shortname: study.shortname,
			displayShortname:
				study.shortname.length > 20 ? `${study.shortname.substring(0, 16)}[...]` : study.shortname,
			studyPatients: Array.isArray(study.studyPatients)
				? study.studyPatients.length
				: Number(study.studyPatients) || 0
		}))
		.sort(
			(left, right) =>
				left.studyPatients - right.studyPatients || left.shortname.localeCompare(right.shortname)
		);
}

export function createStudyShortnameQueryItem(study) {
	return {
		id: '-',
		key: 'shortname',
		name: '-',
		type: 'EQUALS',
		system: 'study',
		values: [
			{
				name: study.shortname,
				value: study.shortname,
				queryBindId: '-'
			}
		]
	};
}
