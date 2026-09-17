const ADMIN_ROLES = new Set(['admin', 'super-admin']);

/** Ask the internal application API for the verified, active application user. */
export const requireUser = async (req, res, next) => {
	const authorization = req.headers.authorization;
	if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/i.test(authorization)) {
		return res.status(401).json({ message: 'A valid access token is required' });
	}

	try {
		const response = await fetch(
			process.env.OVIS_AUTH_SESSION_URL || 'http://ovis-backend-apollo:4001/auth/session',
			{
				headers: { Authorization: authorization, Accept: 'application/json' },
				redirect: 'error',
				signal: AbortSignal.timeout(5000)
			}
		);
		if (!response.ok) {
			const status = response.status === 401 || response.status === 403 ? response.status : 503;
			return res.status(status).json({ message: 'Authorization could not be verified' });
		}
		const session = await response.json();
		if (
			session.anonymous !== false ||
			typeof session.sub !== 'string' ||
			!session.sub ||
			typeof session.userId !== 'string' ||
			!session.userId
		) {
			return res.status(403).json({ message: 'An active user account is required' });
		}
		req.auth = session;
		return next();
	} catch {
		return res.status(503).json({ message: 'Authorization service unavailable' });
	}
};

export const requireAdmin = (req, res, next) => {
	if (!req.auth || !ADMIN_ROLES.has(req.auth.role)) {
		return res.status(403).json({ message: 'Administrator access is required' });
	}
	return next();
};
