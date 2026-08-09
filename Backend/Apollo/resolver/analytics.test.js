const assert = require('node:assert/strict');
const test = require('node:test');
const analytics = require('./analytics');

test('normalizes bounded analytics events', () => {
	const event = analytics.normalizeEvent({
		type: 'SESSION_TIME',
		userId: ' user-1 ',
		timestamp: 1_700_000_000_000,
		module: ' progress:bar-chart ',
		targetType: 'CHART',
		durationSeconds: 999
	});

	assert.equal(event.userId, 'user-1');
	assert.equal(event.module, 'progress:bar-chart');
	assert.equal(event.targetType, 'CHART');
	assert.equal(event.durationSeconds, 300);
	assert.equal(event.createdAt.getTime(), 1_700_000_000_000);
	assert.equal(analytics.normalizeEvent({ type: 'INVALID', userId: 'user-1' }), null);
});

test('builds timeline aggregation for the selected metric and interval', () => {
	assert.deepEqual(analytics.buildTimelinePipeline('FILTER_ACTIONS', 'WEEK'), [
		{ $match: { type: 'FILTER_CHANGE' } },
		{
			$group: {
				_id: { $dateTrunc: { date: '$createdAt', unit: 'week' } },
				value: { $sum: 1 }
			}
		},
		{ $sort: { _id: 1 } }
	]);
});

test('records events and increments user totals per batch', async () => {
	let insertedDocuments = [];
	let userOperations = [];
	const usageCollection = {
		async insertMany(documents) {
			insertedDocuments = documents;
			return { acknowledged: true, insertedCount: documents.length };
		}
	};
	const userCollection = {
		async bulkWrite(operations) {
			userOperations = operations;
		}
	};
	const context = {
		collections: { usageEvent: 'usageEvent', usr: 'user' },
		db: {
			collection(name) {
				return name === 'usageEvent' ? usageCollection : userCollection;
			}
		}
	};

	const result = await analytics.Mutation.recordUsageEvents(
		null,
		{
			events: [
				{ type: 'SESSION_TIME', userId: 'user-1', durationSeconds: 30 },
				{ type: 'FILTER_CHANGE', userId: 'user-1' },
				{ type: 'FILTER_CHANGE', userId: 'user-1' },
				{ type: 'MODULE_INTERACTION', userId: 'user-2', module: 'study:bar-chart' }
			]
		},
		context
	);

	assert.equal(insertedDocuments.length, 4);
	assert.deepEqual(userOperations, [
		{
			updateOne: {
				filter: { _id: 'user-1' },
				update: { $inc: { timeOnline: 30, filterClicks: 2 } },
				upsert: false
			}
		}
	]);
	assert.deepEqual(result, { acknowledged: true, insertedCount: 4 });
});
