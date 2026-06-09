const { ObjectId } = require('bson');
const { filter2match } = require('../Apollo/astTranslator');

const sortOrder = { newest: -1, oldest: 1 };

const Skip = (id) => ({
	$match: {
		_id: {
			$lt: new ObjectId(id)
		}
	}
});
const Limit = (limit) => ({ $limit: limit });
const SORT = { $sort: { _id: sortOrder.newest } };

const Match = (fArray) => ({
	$match: Object.assign({}, ...fArray)
});

const aggregationArry = async ({ limit, continueFromID: skip, filter, project }, colname, db) => {
	console.log('things:', limit, skip, filter, colname);
	let aggArry = [];
	if (filter) aggArry.push(...(await filter2match({ value: filter, column: colname, db })));
	if (project) aggArry.push(...project);
	aggArry.push(SORT);
	if (skip) aggArry.push(Skip(skip));
	if (limit) aggArry.push(Limit(limit));
	console.log(JSON.stringify(aggArry), 'aggArry');
	return aggArry;
};

module.exports = {
	Skip,
	Limit,
	Match,
	SORT,
	sortOrder,
	aggregationArry
};
