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

	// Resolve collection-specific OccurrenceDate field once (expression or path)
	const collectionOccurrenceDate = collection
		? {
				$getField: {
					field: { $concat: [collection, 'OccurrenceDate'] },
					input: '$$ROOT'
				}
		  }
		: '$occurrenceDate';

	const aggregation = [
		{
			$set: {
				progressTime: {
					$dateDiff: {
						endDate: collectionOccurrenceDate,
						startDate: '$diagnosisDate',
						unit: timeunit,
						startOfWeek: 'mon'
					}
				},
				collectionOccurrenceDate: collectionOccurrenceDate,
				date: { $dateTrunc: { date: collectionOccurrenceDate, unit: timeunit } }
			}
		},
		// /* DEBUG: expose resolved endDate for troubleshooting */
		// , { $set: { _debug_endDate: "$collectionOccurrenceDate" } }
		{
			$match: {
				progressTime: { $gte: 0 },
				[label]: { $exists: true, $nin: [null, 'X'] }
			}
		},
		{
			$group: {
				_id: { label: '$' + label, date: dateiff },
				tumors: { $push: { tumorID: '$tumorID' } },
				count: { $count: {} }
			}
		},
		{ $sort: { '_id.date': 1 } }
	];

	const pregroup = (age = 'newest') => {
		const filter = [
			{
				$group: {
					_id: { tumor: '$tumorID', label: '$' + label },
					progs: {
						$top: {
							output: '$$ROOT',
							sortBy: { collectionOccurrenceDate: sortOrder[age] }
						}
					}
				}
			},
			{
				$replaceRoot: { newRoot: '$progs' }
			}
		];
		return filter;
	};

	//insert extra grouping >> filter the highest | lowest date
	if (eventfiltering !== 'all') aggregation.splice(2, 0, ...pregroup(eventfiltering));

	//insert match -> remove empty label field
	//aggregation[1].$match[label] = { $exists: true, $nin: [null, "X"] }

	console.dir(aggregation, { depth: null });
	console.log('agg');
	return aggregation;
};

const Query = {
	getTimeChart: async (
		_parent,
		{ collection, timePeriod, group, eventsUsed, datediff, filter },
		context
	) => {
		const ccol = context.collections[collection];
		let agg = [];
		if (filter) agg = await filter2match({ value: filter, column: ccol, db: context.db });
		agg.push(...aggregations(timePeriod, eventsUsed, group, datediff, collection));
		let result = await context.db.collection(ccol).aggregate(agg).toArray();
		console.dir(result, { depth: null });
		return result.map((ele) => ({
			label: ele._id.label,
			date: ele._id.date,
			tumorid: ele.tumors.map((t) => t.tumorID),
			count: ele.count
		}));
	}
};
module.exports = { Query };
