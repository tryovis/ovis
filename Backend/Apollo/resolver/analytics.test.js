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

test('summarizes filter-independent usage report metrics', () => {
	const report = analytics.summarizeUsageReport(
		[
			{ _id: 'user-1', firstLogin: new Date('2026-01-02'), timeOnline: 3600 },
			{ _id: 'user-2', firstLogin: new Date('2026-02-02'), timeOnline: 1800 },
			{ _id: 'user-3', firstLogin: null, timeOnline: 0 }
		],
		{
			daily: [{ activeUsers: 1 }, { activeUsers: 2 }],
			monthly: [{ activeUsers: 2 }, { activeUsers: 1 }],
			quarterly: [{ activeUsers: 2 }],
			yearly: [{ activeUsers: 2 }],
			tracking: [
				{
					trackingStart: new Date('2026-01-01T00:00:00.000Z'),
					activeUsersSinceStart: 2
				}
			]
		}
	);

	assert.equal(report.registeredUsers, 3);
	assert.equal(report.activatedUsers, 2);
	assert.ok(Math.abs(report.activationRate - 200 / 3) < Number.EPSILON * 100);
	assert.equal(report.averageActiveUsersPerMonth, 1.5);
	assert.equal(report.averageActiveUsersPerQuarter, 2);
	assert.equal(report.averageActiveUsersPerYear, 2);
	assert.equal(report.averageActiveUsersSinceStart, 1.5);
	assert.equal(report.activeUsersSinceStart, 2);
	assert.equal(report.totalTimeOnline, 5400);
	assert.equal(report.averageTimeOnlinePerUser, 1800);
	assert.equal(report.medianTimeOnlinePerUser, 1800);
	assert.equal(report.trackingStart, Date.parse('2026-01-01T00:00:00.000Z'));
});

test('returns zero-safe usage report metrics without users or activity', () => {
	assert.deepEqual(analytics.summarizeUsageReport([], {}), {
		registeredUsers: 0,
		activatedUsers: 0,
		activationRate: 0,
		averageActiveUsersPerMonth: 0,
		averageActiveUsersPerQuarter: 0,
		averageActiveUsersPerYear: 0,
		averageActiveUsersSinceStart: 0,
		activeUsersSinceStart: 0,
		totalTimeOnline: 0,
		averageTimeOnlinePerUser: 0,
		medianTimeOnlinePerUser: 0,
		trackingStart: null
	});
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
