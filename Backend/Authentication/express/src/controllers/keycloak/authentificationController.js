/** Keycloak verifies credentials and token validity. Never log request bodies or tokens. */
const tokenEndpoint = () =>
	`${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect`;
const textField = (value, maxLength = 16384) =>
	typeof value === 'string' && value.length > 0 && value.length <= maxLength;
const clientCredentials = () => ({
	client_id: process.env.KEYCLOAK_CLIENT_ID,
	client_secret: process.env.KEYCLOAK_CLIENT_SECRET
});

const keycloakPostRequest = async (url, body, timeoutMs = 10000) => {
	const response = await fetch(url, {
		method: 'POST',
		body: new URLSearchParams(body),
		headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
		redirect: 'error',
		signal: AbortSignal.timeout(timeoutMs)
	});
	if (!response.ok) {
		const error = new Error('Keycloak request failed');
		error.status = response.status;
		throw error;
	}
	return response.status === 204 ? null : response.json();
};

export const getUserManagmentToken = async () => {
	const result = await keycloakPostRequest(`${tokenEndpoint()}/token`, {
		client_id: process.env.KEYCLOAK_ADMIN_CLIENT_ID,
		client_secret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET,
		grant_type: 'client_credentials'
	});
	if (!textField(result?.access_token)) throw new Error('Management authorization unavailable');
	return result.access_token;
};

const tokenFailure = (res, error) => {
	if (error.status === 400 || error.status === 401)
		return res.status(401).json({ error: 'Credentials or token are invalid or expired' });
	return res.status(503).json({ error: 'Authentication service unavailable' });
};

const login = async (req, res) => {
	if (!textField(req.body?.username, 320) || !textField(req.body?.password, 4096))
		return res.status(400).json({ error: 'Username and password are required' });
	try {
		// Allow slower LDAP authentication while keeping stalled logins bounded.
		const result = await keycloakPostRequest(
			`${tokenEndpoint()}/token`,
			{
				...clientCredentials(),
				grant_type: 'password',
				username: req.body.username,
				password: req.body.password,
				scope: 'openid profile email'
			},
			60000
		);
		return res.status(200).json({ ...result, timestamp: Date.now() });
	} catch (error) {
		return tokenFailure(res, error);
	}
};

const introspect = async (req, res) => {
	if (!textField(req.body?.token)) return res.status(400).json({ error: 'Token is required' });
	try {
		return res.status(200).json(
			await keycloakPostRequest(`${tokenEndpoint()}/token/introspect`, {
				...clientCredentials(),
				token: req.body.token
			})
		);
	} catch (error) {
		return tokenFailure(res, error);
	}
};

const refresh = async (req, res) => {
	if (!textField(req.body?.refresh_token))
		return res.status(400).json({ error: 'Refresh token is required' });
	try {
		const result = await keycloakPostRequest(`${tokenEndpoint()}/token`, {
			...clientCredentials(),
			grant_type: 'refresh_token',
			refresh_token: req.body.refresh_token
		});
		return res.status(200).json({ ...result, timestamp: Date.now() });
	} catch (error) {
		return tokenFailure(res, error);
	}
};

const logout = async (req, res) => {
	if (!textField(req.body?.refresh_token))
		return res.status(400).json({ error: 'Refresh token is required' });
	try {
		await keycloakPostRequest(`${tokenEndpoint()}/logout`, {
			...clientCredentials(),
			refresh_token: req.body.refresh_token
		});
		return res.status(200).json({ message: 'Logout successful' });
	} catch (error) {
		return tokenFailure(res, error);
	}
};

const userinfo = async (req, res) => {
	if (!textField(req.body?.token))
		return res.status(400).json({ error: 'Access token is required' });
	try {
		const response = await fetch(`${tokenEndpoint()}/userinfo`, {
			headers: { Authorization: `Bearer ${req.body.token}`, Accept: 'application/json' },
			redirect: 'error',
			signal: AbortSignal.timeout(10000)
		});
		if (!response.ok)
			return res
				.status(response.status === 401 ? 401 : 503)
				.json({ error: 'User information unavailable' });
		return res.status(200).json(await response.json());
	} catch {
		return res.status(503).json({ error: 'Authentication service unavailable' });
	}
};

const createUser = async (req, res) => {
	const input = req.body;
	const allowedFields = new Set([
		'username',
		'email',
		'firstName',
		'lastName',
		'enabled',
		'credentials'
	]);
	if (
		!input ||
		typeof input !== 'object' ||
		Array.isArray(input) ||
		Object.keys(input).some((key) => !allowedFields.has(key)) ||
		!textField(input.username, 320) ||
		['email', 'firstName', 'lastName'].some(
			(key) => input[key] !== undefined && !textField(input[key], 320)
		) ||
		(input.enabled !== undefined && typeof input.enabled !== 'boolean')
	) {
		return res
			.status(400)
			.json({ error: 'Invalid user fields; roles and custom attributes cannot be assigned here' });
	}
	const payload = {
		username: input.username,
		email: input.email,
		firstName: input.firstName,
		lastName: input.lastName,
		enabled: input.enabled ?? true,
		emailVerified: false
	};
	if (input.credentials !== undefined) {
		if (
			!Array.isArray(input.credentials) ||
			input.credentials.length !== 1 ||
			input.credentials[0]?.type !== 'password' ||
			!textField(input.credentials[0]?.value, 4096)
		) {
			return res.status(400).json({ error: 'A single password credential is supported' });
		}
		payload.credentials = [
			{ type: 'password', value: input.credentials[0].value, temporary: true }
		];
	}
	try {
		const token = await getUserManagmentToken();
		const response = await fetch(
			`${process.env.KEYCLOAK_URL}/admin/realms/${process.env.KEYCLOAK_REALM}/users`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify(payload),
				redirect: 'error',
				signal: AbortSignal.timeout(10000)
			}
		);
		if (!response.ok)
			return res
				.status(response.status === 409 ? 409 : 400)
				.json({ error: 'User could not be created' });
		return res.status(201).json({ message: 'User created successfully' });
	} catch {
		return res.status(503).json({ error: 'User management unavailable' });
	}
};

export { login, introspect, logout, refresh, userinfo, createUser };
