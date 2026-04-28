/**
 * @file Authentication API routes using Keycloak
 * @description Provides authentication functionalities such as login, token introspection, refresh, logout, user info retrieval, and user creation.
 */

/**
 * Extracts and validates Basic Authentication credentials from the request header.
 * @param {Object} req - Express request object
 * @returns {boolean} - Returns true if authentication is valid, false otherwise.
 */
const isAuthenticated = (req) => {
	const header_authorization = req.headers.authorization;
	if (!header_authorization) return false;

	const encoded = header_authorization.substring(6);
	const decoded = Buffer.from(encoded, 'base64').toString('ascii');
	const [basic_username, basic_password] = decoded.split(':');

	return (
		basic_username === process.env.BASIC_AUTH_USERNAME &&
		basic_password === process.env.BASIC_AUTH_PASSWORD
	);
};

/**
 * Gets token from user management account to be able to change userdata
 * @returns {json} - Returns user management token
 */
export const getUserManagmentToken = async () => {
	const url = `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`;
	const body = new URLSearchParams({
		client_id: process.env.KEYCLOAK_ADMIN_CLIENT_ID,
		client_secret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET,
		grant_type: 'client_credentials'
	});

	try {
		const json = await keycloakPostRequest(url, body);
		return json.access_token;
	} catch (error) {
		console.error('Error getting user management token:', error);
		throw new Error('Failed to get management token');
	}
};

/**
 * Makes a POST request to Keycloak with given parameters.
 * @param {string} url - Keycloak endpoint
 * @param {URLSearchParams} body - Form-encoded request body
 * @returns {Promise<Object>} - Returns Keycloak response as JSON
 */
const keycloakPostRequest = async (url, body) => {
	try {
		const header = {
			'Content-Type': 'application/x-www-form-urlencoded',
			Accepts: 'application/json'
		};

		console.log('--------------------------------');
		console.log('Keycloak url:', url);
		console.log('Keycloak body:', body);
		console.log('Keycloak header:', header);
		console.log('--------------------------------');

		const response = await fetch(url, {
			method: 'POST',
			body,
			headers: header
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('Keycloak error response:', errorText);
			throw new Error(`Keycloak request failed: ${response.status} ${response.statusText}`);
		}

		return response.json();
	} catch (error) {
		console.error('Keycloak request error:', error);
		throw error;
	}
};

/**
 * Login: Authenticates a user with Keycloak using username and password.
 * @async
 * @function login
 */
const login = async (req, res) => {
	if (!isAuthenticated(req)) return res.status(403).send({ message: 'forbidden' });

	console.log('Login attempt from:', req.body.username);

	const url = `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`;
	const body = new URLSearchParams({
		client_id: process.env.KEYCLOAK_CLIENT_ID,
		client_secret: process.env.KEYCLOAK_CLIENT_SECRET,
		grant_type: 'password',
		username: req.body.username,
		password: req.body.password,
		scope: 'openid profile email'
	});

	try {
		const json = await keycloakPostRequest(url, body);

		// Add custom expiry times for better tracking on the client
		json.timestamp = Date.now();

		res.status(200).json(json);
	} catch (error) {
		console.log('Login error:', error);

		// Return appropriate status code based on the error
		if (error.message.includes('401')) {
			return res.status(401).json({ error: 'Invalid username or password' });
		}

		if (error.message.includes('500')) {
			return res.status(500).json({ error: 'Authentication server error' });
		}

		res.status(400).json({ error: error.message });
	}
};

/**
 * Introspect: Checks the validity of an access token.
 * @async
 * @function introspect
 */
const introspect = async (req, res) => {
	if (!isAuthenticated(req)) return res.status(403).send({ message: 'forbidden' });

	if (!req.body.token) {
		return res.status(400).json({ error: 'Token is required' });
	}

	const url = `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token/introspect`;
	const body = new URLSearchParams({
		client_id: process.env.KEYCLOAK_CLIENT_ID,
		client_secret: process.env.KEYCLOAK_CLIENT_SECRET,
		token: req.body.token
	});

	try {
		const json = await keycloakPostRequest(url, body);
		res.status(200).json(json);
	} catch (error) {
		console.error('Introspect error:', error);
		res.status(400).json({ error: error.message });
	}
};

/**
 * Refresh: Refreshes an access token using a refresh token.
 * @async
 * @function refresh
 */
const refresh = async (req, res) => {
	if (!isAuthenticated(req)) return res.status(403).send({ message: 'forbidden' });

	if (!req.body.refresh_token) {
		return res.status(400).json({ error: 'Refresh token is required' });
	}

	console.log('Refresh attempt with token:', req.body.refresh_token.substring(0, 20) + '...');

	const url = `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`;
	const body = new URLSearchParams({
		client_id: process.env.KEYCLOAK_CLIENT_ID,
		client_secret: process.env.KEYCLOAK_CLIENT_SECRET,
		grant_type: 'refresh_token',
		refresh_token: req.body.refresh_token
	});

	try {
		const json = await keycloakPostRequest(url, body);
		console.log('Token refreshed successfully');

		// Add timestamp for client-side expiry tracking
		json.timestamp = Date.now();

		res.status(200).json(json);
	} catch (error) {
		console.log('Token refresh failed:', error);

		// Return appropriate status based on error
		if (error.message.includes('400')) {
			return res.status(400).json({ error: 'Invalid refresh token' });
		}

		if (error.message.includes('401')) {
			return res.status(401).json({ error: 'Refresh token expired' });
		}

		res.status(500).json({ error: error.message });
	}
};

/**
 * Logout: Revokes a refresh token, logging the user out.
 * @async
 * @function logout
 */
const logout = async (req, res) => {
	if (!isAuthenticated(req)) return res.status(403).send({ message: 'forbidden' });

	if (!req.body.refresh_token) {
		return res.status(400).json({ error: 'Refresh token is required' });
	}

	console.log(
		'Logout attempt with refresh token:',
		req.body.refresh_token.substring(0, 20) + '...'
	);

	const url = `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/logout`;
	const body = new URLSearchParams({
		client_id: process.env.KEYCLOAK_CLIENT_ID,
		client_secret: process.env.KEYCLOAK_CLIENT_SECRET,
		refresh_token: req.body.refresh_token
	});

	try {
		const response = await fetch(url, {
			method: 'POST',
			body,
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			}
		});

		// Log the complete response
		console.log('Logout Response:', {
			status: response.status,
			statusText: response.statusText,
			headers: Object.fromEntries(response.headers.entries()),
			url: response.url
		});

		// Also log the response body if possible
		const responseText = await response.text();
		console.log('Response body:', responseText);

		if (!response.ok) {
			throw new Error(`Logout failed with response: ${responseText}`);
		}

		res.status(200).json({ message: 'Logout successful' });
	} catch (error) {
		console.error('Logout error:', error);

		// Even if logout fails, we want to notify the client that they can consider themselves logged out
		// This is because the token might already be invalid
		res.status(200).json({ message: 'Logout processed', warning: error.message });
	}
};

/**
 * Userinfo: Retrieves user information from Keycloak.
 * @async
 * @function userinfo
 */
const userinfo = async (req, res) => {
	if (!isAuthenticated(req)) return res.status(403).send({ message: 'forbidden' });

	if (!req.body.token) {
		return res.status(400).json({ error: 'Access token is required' });
	}

	const url = `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/userinfo`;
	const header = { Authorization: `Bearer ${req.body.token}`, Accepts: 'application/json' };

	try {
		const response = await fetch(url, { method: 'GET', headers: header });

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`Failed to get user info: ${response.status} ${response.statusText} - ${errorText}`
			);
		}

		const json = await response.json();
		res.status(200).json(json);
	} catch (error) {
		console.error('User info error:', error);

		if (error.message.includes('401')) {
			return res.status(401).json({ error: 'Unauthorized: Token is invalid or expired' });
		}

		res.status(400).json({ error: error.message });
	}
};

/**
 * CreateUser: Creates a new user in Keycloak.
 * @async
 * @function createUser
 */
const createUser = async (req, res) => {
	if (!isAuthenticated(req)) return res.status(403).send({ message: 'forbidden' });

	try {
		const token = await getUserManagmentToken();

		console.log('create user info', req.body);

		const url = `${process.env.KEYCLOAK_URL}/admin/realms/${process.env.KEYCLOAK_REALM}/users`;
		const header = {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
			Accepts: 'application/json'
		};

		const response = await fetch(url, {
			method: 'POST',
			headers: header,
			body: JSON.stringify(req.body)
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`Failed to create user: ${response.status} ${response.statusText} - ${errorText}`
			);
		}

		res.status(201).json({ message: 'User created successfully' });
	} catch (error) {
		console.error('Create user error:', error);
		res.status(400).json({ error: error.message });
	}
};

export { login, introspect, logout, refresh, userinfo, createUser };
