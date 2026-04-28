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

module.exports.genCategoryGroupedResult = (raw) => {
	let res = { category: [], groups: [] };
	let grades = new Set();
	raw.forEach((it) => {
		res.category.push(it._id);
		it.com.forEach((co) => grades.add(co.grade));
	});

	grades.forEach((it) =>
		res.groups.push({
			count: Array(res.category.length).fill(0),
			label: it
		})
	);

	raw.forEach((it) => {
		categoryIndex = res.category.indexOf(it._id);
		it.com.forEach((co) => {
			const found = res.groups.find(({ label }) => co.grade === label);
			found.count[categoryIndex] = co.count;
		});
	});
	return res;
};

module.exports.getCategoryGroupedRes = async (db, col, filter) => {
	let agg = [];
	if (filter) agg = await filter2match({ value: filter, column: col, db });
	agg.push(...this.agg);
	let res = await db.collection(col).aggregate(agg).toArray();
	return this.genCategoryGroupedResult(res);
};
