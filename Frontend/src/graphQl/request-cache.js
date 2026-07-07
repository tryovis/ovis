export function createCachedRequest(load) {
	const cache = new Map();

	return (key, ...args) => {
		const cachedRequest = cache.get(key);
		if (cachedRequest) {
			return cachedRequest;
		}

		const request = load(key, ...args).catch((error) => {
			cache.delete(key);
			throw error;
		});

		cache.set(key, request);
		return request;
	};
}
