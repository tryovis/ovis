const { ObjectId } = require('bson');
const { filter2match } = require('./astTranslator');

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

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeColumnFilters = (columnFilters) =>
	Array.isArray(columnFilters)
		? columnFilters.filter(({ field, value }) => field && String(value ?? '').trim() !== '')
		: [];

const columnFilterStages = (columnFilters) =>
	normalizeColumnFilters(columnFilters).map(({ field, value }) => ({
		$match: {
			[field]: {
				$regex: escapeRegex(value),
				$options: 'i'
			}
		}
	}));

const sortStage = ({ sortField, sortDirection }) => {
	const direction = tableSortOrder[sortDirection] ?? sortOrder.newest;
	if (!sortField) return SORT;
	return { $sort: { [sortField]: direction, _id: sortOrder.newest } };
};

const aggregationArry = async (
	{ limit, continueFromID: skip, filter, project, offset, sortField, sortDirection, columnFilters },
	colname,
	db
) => {
	//console.log("things:",limit, skip, filter, colname)
	let aggArry = [];
	if (filter) aggArry.push(...(await filter2match({ value: filter, column: colname, db })));
	if (project) aggArry.push(...project);
	aggArry.push(...columnFilterStages(columnFilters));
	aggArry.push(sortStage({ sortField, sortDirection }));
	if (skip) aggArry.push(Skip(skip));
	if (offset) aggArry.push(Offset(offset));
	if (limit) aggArry.push(Limit(limit));
	//console.log(JSON.stringify(aggArry),"aggArry")
	return aggArry;
};

const countAggregationArry = async ({ filter, project, columnFilters }, colname, db) => {
	const aggArry = [];
	if (filter) aggArry.push(...(await filter2match({ value: filter, column: colname, db })));
	if (project) aggArry.push(...project);
	aggArry.push(...columnFilterStages(columnFilters));
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
