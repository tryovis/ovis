const { ObjectId } = require('bson');
const { filter2match } = require('./astTranslator');
const { columnFilterStages } = require('./tableColumnSearch');

const sortOrder = { newest: -1, oldest: 1 };
const tableSortOrder = { asc: 1, desc: -1 };

const Skip = (id) => ({
	$match: {
		_id: {
			$lt: new ObjectId(id)
		}
	}
});
const Limit = (limit) => ({ $limit: limit });
const Offset = (offset) => ({ $skip: offset });
const SORT = { $sort: { _id: sortOrder.newest } };

const Match = (fArray) => ({
	$match: Object.assign({}, ...fArray)
});

const sortStage = ({ sortField, sortDirection }, stableSortFields = {}) => {
	const direction = tableSortOrder[sortDirection] ?? sortOrder.newest;
	if (!sortField) return { $sort: { ...SORT.$sort, ...stableSortFields } };
	return { $sort: { [sortField]: direction, _id: sortOrder.newest, ...stableSortFields } };
};

const aggregationArry = async (
	{ limit, continueFromID: skip, filter, project, offset, sortField, sortDirection, columnFilters },
	colname,
	db,
	{ rowStages = [], stableSortFields = {} } = {}
) => {
	//console.log("things:",limit, skip, filter, colname)
	let aggArry = [];
	if (filter) aggArry.push(...(await filter2match({ value: filter, column: colname, db })));
	if (project) aggArry.push(...project);
	aggArry.push(...rowStages);
	aggArry.push(...columnFilterStages(columnFilters, colname));
	aggArry.push(sortStage({ sortField, sortDirection }, stableSortFields));
	if (skip) aggArry.push(Skip(skip));
	if (offset) aggArry.push(Offset(offset));
	if (limit) aggArry.push(Limit(limit));
	//console.log(JSON.stringify(aggArry),"aggArry")
	return aggArry;
};

const countAggregationArry = async (
	{ filter, project, columnFilters },
	colname,
	db,
	{ rowStages = [] } = {}
) => {
	const aggArry = [];
	if (filter) aggArry.push(...(await filter2match({ value: filter, column: colname, db })));
	if (project) aggArry.push(...project);
	aggArry.push(...rowStages);
	aggArry.push(...columnFilterStages(columnFilters, colname));
	aggArry.push({ $count: 'count' });
	return aggArry;
};

module.exports = {
	Skip,
	Limit,
	Offset,
	Match,
	SORT,
	sortOrder,
	aggregationArry,
	countAggregationArry
};
