const { filter2match } = require('./astTranslator');
module.exports.agg = [
	{
		$group: {
			_id: { complication: '$type', label: '$status' },
			count: { $count: {} }
		}
	},
	{
		$sort: { count: -1 }
	},
	{
		$group: {
			_id: '$_id.complication',
			com: { $push: { grade: '$_id.label', count: '$count' } },
			sum: { $sum: '$count' }
		}
	},
	{
		$sort: { sum: -1 }
	}
];

const genCategoryGroupedResult = (raw = []) => {
	const category = new Array(raw.length);
	const groupLabels = [];
	const groupIndexByLabel = new Map();

	for (let categoryIndex = 0; categoryIndex < raw.length; categoryIndex++) {
		const item = raw[categoryIndex];
		category[categoryIndex] = item._id;

		for (const groupedCount of item.com ?? []) {
			if (!groupIndexByLabel.has(groupedCount.grade)) {
				groupIndexByLabel.set(groupedCount.grade, groupLabels.length);
				groupLabels.push(groupedCount.grade);
			}
		}
	}

	const groups = groupLabels.map((label) => ({
		count: Array(raw.length).fill(0),
		label
	}));

	for (let categoryIndex = 0; categoryIndex < raw.length; categoryIndex++) {
		for (const groupedCount of raw[categoryIndex].com ?? []) {
			const groupIndex = groupIndexByLabel.get(groupedCount.grade);
			groups[groupIndex].count[categoryIndex] = groupedCount.count;
		}
	}

	return { category, groups };
};

module.exports.genCategoryGroupedResult = genCategoryGroupedResult;

module.exports.getCategoryGroupedRes = async (db, col, filter) => {
	let agg = [];
	if (filter) agg = await filter2match({ value: filter, column: col, db });
	agg.push(...this.agg);
	let res = await db.collection(col).aggregate(agg).toArray();
	return genCategoryGroupedResult(res);
};
