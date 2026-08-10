export function createLatestRequest() {
	let currentRequest = 0;
	let active = true;

	return {
		start() {
			currentRequest += 1;
			return currentRequest;
		},
		isCurrent(request) {
			return active && request === currentRequest;
		},
		invalidate() {
			active = false;
			currentRequest += 1;
		}
	};
}
