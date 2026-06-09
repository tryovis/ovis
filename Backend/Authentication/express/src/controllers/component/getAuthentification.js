export const authenticateRequest = (req) => {
	const headerAuthorization = req.headers.authorization;

	if (!headerAuthorization) {
		throw { status: 403, message: 'Forbidden: Missing authorization header' };
	}

	const encoded = headerAuthorization.substring(6); // Extract base64 part
	const decoded = Buffer.from(encoded, 'base64').toString('ascii');
	const [basicUsername, basicPassword] = decoded.split(':');

	if (
		basicUsername !== process.env.BASIC_AUTH_USERNAME ||
		basicPassword !== process.env.BASIC_AUTH_PASSWORD
	) {
		throw { status: 403, message: 'Forbidden: Invalid credentials' };
	}
};
