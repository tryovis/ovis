import { dataUrl, graphqlFetch } from './gql-url';

export type UsageEventType = 'SESSION_TIME' | 'FILTER_CHANGE' | 'MODULE_INTERACTION';
export type UsageMetric = 'ONLINE_TIME' | 'FILTER_ACTIONS' | 'MODULE_INTERACTIONS';
export type UsageInterval = 'DAY' | 'WEEK' | 'MONTH';
export type UsageTargetType = 'ALL' | 'CHART' | 'TABLE' | 'VISUALIZATION';

export type UsageEventInput = {
	type: UsageEventType;
	userId: string;
	timestamp: number;
	module?: string;
	targetType?: Exclude<UsageTargetType, 'ALL'>;
	durationSeconds?: number;
};

export type UsageByUser = {
	userId: string;
	timeOnline: number;
	filterClicks: number;
};

export type UsageTimelinePoint = { timestamp: number; value: number };
export type UsageByModule = { module: string; count: number };
export type UsageReport = {
	registeredUsers: number;
	activatedUsers: number;
	activationRate: number;
	averageActiveUsersPerMonth: number;
	averageActiveUsersPerQuarter: number;
	averageActiveUsersPerYear: number;
	averageActiveUsersSinceStart: number;
	activeUsersSinceStart: number;
	totalTimeOnline: number;
	averageTimeOnlinePerUser: number;
	medianTimeOnlinePerUser: number;
	trackingStart: number | null;
};

async function analyticsQuery<T>(query: string, variables: Record<string, unknown>): Promise<T> {
	const response = await graphqlFetch(dataUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ query, variables })
	});
	const result = await response.json();
	if (result.errors?.length) throw new Error(result.errors[0].message);
	return result.data;
}

export async function recordUsageEvents(events: UsageEventInput[], keepalive = false) {
	if (events.length === 0) return { acknowledged: true, insertedCount: 0 };

	const response = await graphqlFetch(dataUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		keepalive,
		body: JSON.stringify({
			query: `
				mutation recordUsageEvents($events: [UsageEventInput!]!) {
					recordUsageEvents(events: $events) { acknowledged insertedCount }
				}
			`,
			variables: { events }
		})
	});
	const result = await response.json();
	if (result.errors?.length) throw new Error(result.errors[0].message);
	return result.data.recordUsageEvents as { acknowledged: boolean; insertedCount: number };
}

export async function getUsageByUser(): Promise<UsageByUser[]> {
	const data = await analyticsQuery<{ getUsageByUser: UsageByUser[] }>(
		`query getUsageByUser { getUsageByUser { userId timeOnline filterClicks } }`,
		{}
	);
	return data.getUsageByUser;
}

export async function getUsageTimeline(
	metric: UsageMetric,
	interval: UsageInterval
): Promise<UsageTimelinePoint[]> {
	const data = await analyticsQuery<{ getUsageTimeline: UsageTimelinePoint[] }>(
		`query getUsageTimeline($metric: UsageMetric!, $interval: UsageInterval!) {
			getUsageTimeline(metric: $metric, interval: $interval) { timestamp value }
		}`,
		{ metric, interval }
	);
	return data.getUsageTimeline;
}

export async function getUsageByModule(targetType: UsageTargetType): Promise<UsageByModule[]> {
	const data = await analyticsQuery<{ getUsageByModule: UsageByModule[] }>(
		`query getUsageByModule($targetType: UsageTargetType) {
			getUsageByModule(targetType: $targetType) { module count }
		}`,
		{ targetType }
	);
	return data.getUsageByModule;
}

export async function getUsageReport(): Promise<UsageReport> {
	const data = await analyticsQuery<{ getUsageReport: UsageReport }>(
		`query getUsageReport {
			getUsageReport {
				registeredUsers
				activatedUsers
				activationRate
				averageActiveUsersPerMonth
				averageActiveUsersPerQuarter
				averageActiveUsersPerYear
				averageActiveUsersSinceStart
				activeUsersSinceStart
				totalTimeOnline
				averageTimeOnlinePerUser
				medianTimeOnlinePerUser
				trackingStart
			}
		}`,
		{}
	);
	return data.getUsageReport;
}
