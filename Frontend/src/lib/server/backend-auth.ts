const UPSTREAM =
	process.env.GRAPHQL_UPSTREAM_URL ||
	process.env.OVIS_GRAPHQL_UPSTREAM_URL ||
	'http://ovis-backend-apollo:4001/graphql';

export type BackendSession = {
	userId: string | null;
	sub: string | null;
	role: string;
	anonymous: boolean;
	cohortRestricted: boolean;
	pseudonymization: boolean;
};

/** Authorize at the same backend boundary as GraphQL before exposing local data. */
export async function getBackendSession(request: Request): Promise<BackendSession | Response> {
	const sessionUrl = new URL(UPSTREAM);
	sessionUrl.pathname = sessionUrl.pathname.replace(/\/graphql\/?$/, '') + '/auth/session';
	sessionUrl.search = '';
	const headers = new Headers({ accept: 'application/json' });
	const authorization = request.headers.get('authorization');
	if (authorization) headers.set('authorization', authorization);
	try {
		const response = await fetch(sessionUrl, {
			headers,
			redirect: 'error',
			signal: AbortSignal.timeout(10_000)
		});
		if (response.ok) {
			const session = await response.json();
			const authenticated = session.anonymous === false &&
				typeof session.userId === 'string' && session.userId &&
				typeof session.sub === 'string' && session.sub &&
				['user', 'manager', 'admin', 'super-admin'].includes(session.role);
			const demo = session.anonymous === true && session.role === 'demo' && session.userId === null;
			if ((authenticated || demo) && typeof session.cohortRestricted === 'boolean' &&
				typeof session.pseudonymization === 'boolean') return session;
			throw new Error('Invalid authorization response');
		}
		const status = [401, 403].includes(response.status) ? response.status : 503;
		return new Response(JSON.stringify({ error: 'Access denied' }), {
			status,
			headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
		});
	} catch {
		return new Response(JSON.stringify({ error: 'Authentication service unavailable' }), {
			status: 503,
			headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
		});
	}
}

export async function requireBackendSession(request: Request): Promise<Response | null> {
	const result = await getBackendSession(request);
	return result instanceof Response ? result : null;
}
