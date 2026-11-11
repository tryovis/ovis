const { GraphQLError } = require('graphql');
const { filteredTableStages } = require('../utils');
const { formattedColumnText, escapeRegex } = require('../tableColumnSearch');
const { hasTableColumn } = require('../tableColumns');
const { buildTherapyRadiationAggregation, flatRadiationField } = require('./therapyRadiationTable');
const { studyOverviewFilteredStages, studyPatientFilteredStages } = require('./studyPatientTable');

const suggestionLimit = 30;
const batchSize = 256;
const timeBudgetMs = 3000;

async function getTableColumnSuggestions(input, context) {
	const deadline = Date.now() + timeBudgetMs;
	const { collection, search, timeZone } = input;
	const normalizeField = collection === 'radiation' ? flatRadiationField : (field) => field;
	const field = normalizeField(input.field);
	const columnFilters = (input.columnFilters ?? []).map((entry) => ({
		...entry,
		field: normalizeField(entry.field)
	}));
	if (
		![field, ...columnFilters.map((entry) => entry.field)].every((name) =>
			hasTableColumn(collection, name)
		)
	) {
		throw new GraphQLError('These table columns are not available', {
			extensions: { code: 'BAD_USER_INPUT' }
		});
	}
	// The browser sends the other inputs. Two headers can use the same data
	// field (e.g. the CCP patient ID columns), so retain every sibling predicate.
	const args = { ...input, field, columnFilters };
	const { db, collections } = context;
	const colname =
		collection === 'radiation'
			? collections.therapy
			: collection === 'molecularMarker'
			? collections.molecularmarker
			: collections[collection];
	let stages;
	if (collection === 'radiation') {
		stages = await buildTherapyRadiationAggregation(args, context, { build: filteredTableStages });
	} else if (collection === 'studyPatient') {
		stages = await studyPatientFilteredStages(args, collections, db);
	} else if (collection === 'study') {
		stages = await studyOverviewFilteredStages(args, collections, db);
	} else {
		stages = await filteredTableStages(args, colname, db);
	}
	const value = formattedColumnText(collection, field, timeZone);
	const searchPattern = search.trim() === '' ? '\\S' : escapeRegex(search);
	stages.push({ $project: { _id: 0, value } });
	const suggestions = [];
	while (suggestions.length < suggestionLimit) {
		const remainingMs = deadline - Date.now();
		if (remainingMs <= 0) throw new GraphQLError('Table suggestion lookup timed out');
		const match = { $regex: searchPattern, $options: 'i' };
		if (suggestions.length) match.$nin = suggestions;
		// Group a bounded window. The next query excludes its distinct values,
		// so long runs of duplicates cannot hide values beyond this window.
		const result = await db
			.collection(colname)
			.aggregate(
				[
					...stages,
					{ $match: { value: match } },
					{ $limit: batchSize },
					{ $group: { _id: '$value', occurrences: { $sum: 1 } } },
					{ $sort: { _id: 1 } },
					{ $limit: suggestionLimit - suggestions.length }
				],
				{ maxTimeMS: remainingMs }
			)
			.toArray();
		suggestions.push(...result.map((row) => row._id));
		if (result.reduce((total, row) => total + row.occurrences, 0) < batchSize) break;
	}
	return suggestions.sort();
}

module.exports = { getTableColumnSuggestions };
