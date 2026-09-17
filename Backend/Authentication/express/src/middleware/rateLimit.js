/** Small bounded per-process limit. Cluster deployments also need a shared ingress limit. */
export const createRateLimit = ({ limit, windowMs, key = (req) => req.ip, now = Date.now }) => {
	const buckets = new Map();
	return (req, res, next) => {
		const timestamp = now();
		for (const [bucketKey, bucket] of buckets) {
			if (bucket.expires <= timestamp) buckets.delete(bucketKey);
		}
		const bucketKey = key(req);
		const bucket = buckets.get(bucketKey);
		if (bucket && bucket.count >= limit) {
			res.set('Retry-After', String(Math.ceil((bucket.expires - timestamp) / 1000)));
			return res.status(429).json({ message: 'Too many requests; please try again later' });
		}
		if (!bucket && buckets.size >= 10000) {
			return res.status(429).json({ message: 'Too many requests; please try again later' });
		}
		buckets.set(bucketKey, {
			count: (bucket?.count || 0) + 1,
			expires: bucket?.expires || timestamp + windowMs
		});
		return next();
	};
};
