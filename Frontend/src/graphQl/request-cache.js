let sessionGeneration = 0;

export function clearRequestCaches() {
	sessionGeneration++;
}

export function createCachedRequest(load) {
	const cache = new Map();
	let generation = sessionGeneration;

	return (key, ...args) => {
		if (generation !== sessionGeneration) {
			cache.clear();
			generation = sessionGeneration;
		}
		const cachedRequest = cache.get(key);
		if (cachedRequest) {
			return cachedRequest;
		}

		const requestGeneration = generation;
		const request = load(key, ...args).then((result) => {
			if (requestGeneration !== sessionGeneration) throw new Error('Session changed');
			return result;
		}).catch((error) => {
			if (cache.get(key) === request) cache.delete(key);
			throw error;
		});

		cache.set(key, request);
		return request;
	};
}
