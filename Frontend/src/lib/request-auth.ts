type AccessTokenProvider = () => Promise<string | null>;

let accessTokenProvider: AccessTokenProvider | null = null;
let sessionGeneration = 0;

export function invalidateAuthenticatedRequests(): void {
	sessionGeneration++;
}

// Registered by the browser token service; no credentials live in this module.
export function setAccessTokenProvider(provider: AccessTokenProvider): void {
	accessTokenProvider = provider;
}

export async function authenticatedFetch(url: string, init: RequestInit = {}): Promise<Response> {
	const generation = sessionGeneration;
	const headers = new Headers(init.headers);
	if (!headers.has('authorization') && accessTokenProvider) {
		const token = await accessTokenProvider();
		if (token) headers.set('authorization', `Bearer ${token}`);
	}
	if (generation !== sessionGeneration) throw new Error('Session changed');
	const response = await fetch(url, { ...init, headers, cache: 'no-store' });
	if (generation !== sessionGeneration) throw new Error('Session changed');
	return response;
}
