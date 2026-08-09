import { get } from 'svelte/store';
import { recordUsageEvents, type UsageEventInput } from '../graphQl/gql-analytics';
import { userStore } from '../store/userStore';

type TrackableEvent = Omit<UsageEventInput, 'userId' | 'timestamp'>;

const MAX_BATCH_SIZE = 20;
const MAX_QUEUE_SIZE = 500;
let queue: UsageEventInput[] = [];
let flushPromise: Promise<void> | null = null;
let flushTimer: ReturnType<typeof setInterval> | undefined;

const currentModule = () => {
	if (typeof window === 'undefined') return 'unknown';
	return window.location.pathname.replace(/^\/+|\/+$/g, '') || 'home';
};

const ensureFlushTimer = () => {
	if (flushTimer || typeof window === 'undefined') return;
	flushTimer = setInterval(() => void flushUsageEvents(), 10_000);
};

export function trackUsageEvent(event: TrackableEvent) {
	const userId = get(userStore).currentUser?.trim();
	if (!userId) return;

	queue.push({
		...event,
		userId,
		timestamp: Date.now(),
		module: event.module || currentModule()
	});

	if (queue.length > MAX_QUEUE_SIZE) queue = queue.slice(-MAX_QUEUE_SIZE);
	ensureFlushTimer();
	if (queue.length >= MAX_BATCH_SIZE) void flushUsageEvents();
}

export async function flushUsageEvents(keepalive = false) {
	if (flushPromise) await flushPromise;
	if (queue.length === 0) return;
	const batch = queue.splice(0, MAX_BATCH_SIZE);

	flushPromise = (async () => {
		try {
			await recordUsageEvents(batch, keepalive);
			if (typeof window !== 'undefined') {
				window.dispatchEvent(
					new CustomEvent('ovis-usage-events-recorded', {
						detail: {
							types: [...new Set(batch.map((event) => event.type))],
							userIds: [...new Set(batch.map((event) => event.userId))]
						}
					})
				);
			}
		} catch (error) {
			queue = [...batch, ...queue].slice(0, MAX_QUEUE_SIZE);
			console.error('Usage events could not be recorded:', error);
		}
	})();
	await flushPromise;
	flushPromise = null;

	if (queue.length > 0 && (keepalive || queue.length >= MAX_BATCH_SIZE)) {
		await flushUsageEvents(keepalive);
	}
}

export function stopUsageTracking() {
	if (flushTimer) clearInterval(flushTimer);
	flushTimer = undefined;
}
