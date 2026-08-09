const EVENT_TYPES = new Set(['SESSION_TIME', 'FILTER_CHANGE', 'MODULE_INTERACTION']);
const TARGET_TYPES = new Set(['CHART', 'TABLE', 'VISUALIZATION']);
const INTERVAL_UNITS = {
	DAY: 'day',
	WEEK: 'week',
	MONTH: 'month'
};

const cleanText = (value, fallback = '') => {
	if (typeof value !== 'string') return fallback;
	return value.trim().slice(0, 160) || fallback;
};

const normalizeEvent = (event) => {
	const type = EVENT_TYPES.has(event?.type) ? event.type : null;
	const userId = cleanText(event?.userId);
	if (!type || !userId) return null;

	const timestamp = Number(event.timestamp);
	const createdAt = Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : new Date();
	const targetType = TARGET_TYPES.has(event.targetType) ? event.targetType : null;

	return {
		type,
		userId,
		createdAt,
		module: cleanText(event.module, 'unknown'),
		targetType,
		durationSeconds:
			type === 'SESSION_TIME' ? Math.max(0, Math.min(Number(event.durationSeconds) || 0, 300)) : 0
	};
};

const usageMetricConfig = (metric) => {
	switch (metric) {
		case 'ONLINE_TIME':
			return { type: 'SESSION_TIME', value: { $ifNull: ['$durationSeconds', 0] } };
		case 'FILTER_ACTIONS':
			return { type: 'FILTER_CHANGE', value: 1 };
		case 'MODULE_INTERACTIONS':
			return { type: 'MODULE_INTERACTION', value: 1 };
		default:
			throw new Error(`Unsupported usage metric: ${metric}`);
	}
};

const buildTimelinePipeline = (metric, interval) => {
	const metricConfig = usageMetricConfig(metric);
	const unit = INTERVAL_UNITS[interval];
	if (!unit) throw new Error(`Unsupported usage interval: ${interval}`);

	return [
		{ $match: { type: metricConfig.type } },
		{
			$group: {
				_id: { $dateTrunc: { date: '$createdAt', unit } },
				value: { $sum: metricConfig.value }
			}
		},
		{ $sort: { _id: 1 } }
	];
};

const resolvers = {
	Query: {
		getUsageByUser: async (_parent, _input, context) => {
			const users = await context.db
				.collection(context.collections.usr)
				.find({}, { projection: { _id: 1, timeOnline: 1, filterClicks: 1 } })
				.sort({ _id: 1 })
				.toArray();

			return users.map((user) => ({
				userId: String(user._id),
				timeOnline: Number(user.timeOnline) || 0,
				filterClicks: Number(user.filterClicks) || 0
			}));
		},

		getUsageTimeline: async (_parent, { metric, interval }, context) => {
			const rows = await context.db
				.collection(context.collections.usageEvent)
				.aggregate(buildTimelinePipeline(metric, interval))
				.toArray();

			return rows.map((row) => ({
				timestamp: row._id instanceof Date ? row._id.getTime() : new Date(row._id).getTime(),
				value: Number(row.value) || 0
			}));
		},

		getUsageByModule: async (_parent, { targetType }, context) => {
			const match = { type: 'MODULE_INTERACTION' };
			if (targetType && targetType !== 'ALL') match.targetType = targetType;

			const rows = await context.db
				.collection(context.collections.usageEvent)
				.aggregate([
					{ $match: match },
					{ $group: { _id: '$module', count: { $sum: 1 } } },
					{ $sort: { count: -1, _id: 1 } },
					{ $limit: 30 }
				])
				.toArray();

			return rows.map((row) => ({ module: row._id || 'unknown', count: row.count || 0 }));
		}
	},

	Mutation: {
		recordUsageEvents: async (_parent, { events }, context) => {
			const documents = (events ?? []).slice(0, 100).map(normalizeEvent).filter(Boolean);
			if (documents.length === 0) return { acknowledged: true, insertedCount: 0 };

			const incrementsByUser = new Map();
			for (const event of documents) {
				const increments = incrementsByUser.get(event.userId) ?? {
					timeOnline: 0,
					filterClicks: 0
				};
				if (event.type === 'SESSION_TIME') increments.timeOnline += event.durationSeconds;
				if (event.type === 'FILTER_CHANGE') increments.filterClicks += 1;
				incrementsByUser.set(event.userId, increments);
			}

			const userUpdates = [...incrementsByUser.entries()]
				.map(([userId, increments]) => {
					const $inc = {};
					if (increments.timeOnline) $inc.timeOnline = increments.timeOnline;
					if (increments.filterClicks) $inc.filterClicks = increments.filterClicks;
					return Object.keys($inc).length
						? { updateOne: { filter: { _id: userId }, update: { $inc }, upsert: false } }
						: null;
				})
				.filter(Boolean);

			const usageCollection = context.db.collection(context.collections.usageEvent);
			const insertResult = await usageCollection.insertMany(documents, { ordered: false });
			if (userUpdates.length > 0) {
				await context.db
					.collection(context.collections.usr)
					.bulkWrite(userUpdates, { ordered: false });
			}

			return {
				acknowledged: insertResult.acknowledged,
				insertedCount: insertResult.insertedCount
			};
		}
	}
};

Object.defineProperties(resolvers, {
	buildTimelinePipeline: { value: buildTimelinePipeline },
	normalizeEvent: { value: normalizeEvent }
});

module.exports = resolvers;
