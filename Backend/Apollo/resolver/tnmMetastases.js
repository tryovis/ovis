const { sortOrder } = require('../utils');
const { filter2match } = require('../astTranslator');

const genDetailLevel = (tnm) => {
	const gid = {
		T: '$T',
		N: '$N',
		M: '$M'
	};
	const filterNul = [];
	let match = null;
	Object.entries(tnm).forEach(([key, value]) => {
		if (value === 'hide') gid[key] = `$${key}hide`;
		if (value.startsWith('group')) gid[key] = `$${key}group`;

		if (value === 'detailnull') filterNul.push({ [key]: { $exists: true, $ne: null } });
		if (value === 'groupnull') filterNul.push({ [`${key}group`]: { $ne: '' } });
	});
	if (filterNul.length > 0) match = filterNul;
	console.dir(match, { depth: null });
	return { gid, match };
};

module.exports = {
	Query: {
		getTnmCount: async (
			_parent,
			{ group: { type, T, N, M, tnmOccurrenceDate }, filter },
			context
		) => {
			const colname = context.collections.tnm;

			const aggregation = [];

			if (type !== 'total') aggregation.push({ $match: { type } });
			if (tnmOccurrenceDate !== 'all') {
				aggregation.push({ $sort: { tnmOccurrenceDate: tnmOccurrenceDate === 'oldest' ? 1 : -1 } });
				aggregation.push(
					{
						$group: {
							_id: '$tumorID',
							latestEntry: { $first: '$$ROOT' }
						}
					},
					{ $replaceRoot: { newRoot: '$latestEntry' } }
				);
			}
			const tnmDetail = (key, value) => {
				if (value === 'detailnull' || value === 'groupnull') {
					return { [key]: { $nin: ['-', 'x', 'X'] } };
				}
				return {};
			};
			aggregation.push(
				{
					$project: {
						T: {
							$switch: {
								branches: [
									{
										case: { $or: [{ $eq: [T, 'group'] }, { $eq: [T, 'groupnull'] }] },
										then: { $ifNull: ['$TGroup', '-'] }
									},
									{ case: { $eq: [T, 'hide'] }, then: '*' }
								],
								default: { $ifNull: ['$T', '-'] }
							}
						},
						N: {
							$switch: {
								branches: [
									{
										case: { $or: [{ $eq: [N, 'group'] }, { $eq: [N, 'groupnull'] }] },
										then: { $ifNull: ['$NGroup', '-'] }
									},
									{ case: { $eq: [N, 'hide'] }, then: '*' }
								],
								default: { $ifNull: ['$N', '-'] }
							}
						},
						M: {
							$switch: {
								branches: [
									{
										case: { $or: [{ $eq: [M, 'group'] }, { $eq: [M, 'groupnull'] }] },
										then: { $ifNull: ['$MGroup', '-'] }
									},
									{ case: { $eq: [M, 'hide'] }, then: '*' }
								],
								default: { $ifNull: ['$M', '-'] }
							}
						}
					}
				},
				{
					$match: {
						...tnmDetail('T', T),
						...tnmDetail('N', N),
						...tnmDetail('M', M)
					}
				},
				{
					$group: {
						_id: { T: '$T', N: '$N', M: '$M' },
						count: { $sum: 1 }
					}
				},
				{
					$project: {
						T: '$_id.T',
						N: '$_id.N',
						M: '$_id.M',
						count: 1,
						_id: 0
					}
				}
			);
			if (filter)
				aggregation.unshift(
					...(await filter2match({ value: filter, column: colname, db: context.db }))
				);
			return context.db.collection(colname).aggregate(aggregation).toArray();
		},
		getTnmBodyMap: async (_parent, { art, filter }, context) => {
			const colname = context.collections.metastasis;
			let aggregation = [];
			if (filter)
				aggregation = await filter2match({ value: filter, column: colname, db: context.db });
			aggregation.push(
				{
					$group: {
						_id: { metastasis: '$metastasisLocation' },
						count: { $count: {} }
					}
				},
				{
					$project: {
						label: '$_id.metastasis',
						count: '$count'
					}
				}
			);
			const matchArt = {
				$match: {
					type: art
				}
			};
			if (art !== 'all') aggregation.splice(0, 0, matchArt);
			return context.db.collection(colname).aggregate(aggregation).toArray();
		}
	}
};
