const { sortOrder } = require('../utils');
const { filter2match } = require('../astTranslator');

const aggregations = (
	groupIdDate = 'quarters',
	eventfiltering = 'all',
	label = 'TZV_G_GES',
	diff = false,
	collection = null
) => {
	const timeunit = groupIdDate.substring(0, groupIdDate.length - 1);
	const dateiff = diff ? '$progressTime' : '$date';

	// Prefer a direct field path over $getField where possible.
	// This is simpler and gives MongoDB a better chance to use indexes.
	const occurrenceField = collection ? `${collection}OccurrenceDate` : 'occurrenceDate';
	const occurrencePath = `$${occurrenceField}`;

	const aggregation = [
		{
			$set: {
				progressTime: {
					$dateDiff: {
						endDate: occurrencePath,
						startDate: '$diagnosisDate',
						unit: timeunit,
						startOfWeek: 'mon'
					}
				},
				collectionOccurrenceDate: occurrencePath,
				date: {
					$dateTrunc: {
						date: occurrencePath,
						unit: timeunit
					}
				}
			}
		},
		{
			$match: {
				progressTime: { $gte: 0 },
				[label]: { $exists: true, $nin: [null, 'X', ''] }
			}
		},
		{
			$group: {
				_id: {
					label: `$${label}`,
					date: dateiff
				},
				// Do not push tumorIDs for the normal chart response.
				// The frontend only needs label, date and count.
				// If tumorIDs are needed for drilldown later, create a separate lazy query.
				count: { $sum: 1 }
			}
		},
		{ $sort: { '_id.date': 1 } }
	];

	const pregroup = (age = 'newest') => [
		{
			$group: {
				_id: {
					tumor: '$tumorID',
					label: `$${label}`
				},
				progs: {
					$top: {
						output: '$$ROOT',
						sortBy: {
							collectionOccurrenceDate: sortOrder[age]
						}
					}
				}
			}
		},
		{
			$replaceRoot: {
				newRoot: '$progs'
			}
		}
	];

	// Insert extra grouping to select first/last occurrence per tumor and label.
	if (eventfiltering !== 'all') {
		aggregation.splice(2, 0, ...pregroup(eventfiltering));
	}

	// Avoid console.dir/log in production because large aggregations and resultsets are expensive.
	// console.dir(aggregation, { depth: null });

	return aggregation;
};

const Query = {
	getTimeChart: async (
		_parent,
		{ collection, timePeriod, group, eventsUsed, datediff, filter },
		context
	) => {
		const ccol = context.collections[collection];
		const agg = [];

		if (filter) {
			agg.push(...(await filter2match({ value: filter, column: ccol, db: context.db })));
		}

		agg.push(...aggregations(timePeriod, eventsUsed, group, datediff, collection));

		const result = await context.db.collection(ccol).aggregate(agg, {
			allowDiskUse: true
		}).toArray();

		// Return only the data the chart actually needs.
		return result.map((ele) => ({
			label: ele._id.label,
			date: ele._id.date,
			count: ele.count
		}));
	}
};

module.exports = { Query };
