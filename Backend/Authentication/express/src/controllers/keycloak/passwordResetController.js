import { createHash } from 'node:crypto';
import { getUserManagmentToken } from './authentificationController.js';

// Password proof, expiry and one-time consumption are handled by Keycloak itself.
// This endpoint never returns a reset code, token or user-existence result.
const requestedAccounts = new Map();
const genericMessage = {
	message: 'If the account can receive password recovery mail, a reset link will be sent.'
};

const createResetCode = async (req, res) => {
	const email = req.body?.email;
	if (
		typeof email !== 'string' ||
		email.length > 320 ||
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
	) {
		return res.status(400).json({ message: 'A valid email address is required' });
	}
	const normalizedEmail = email.trim().toLowerCase();
	const key = createHash('sha256').update(normalizedEmail).digest('hex');
	const now = Date.now();
	for (const [account, expiry] of requestedAccounts) {
		if (expiry <= now) requestedAccounts.delete(account);
	}
	if (requestedAccounts.has(key) || requestedAccounts.size >= 10000)
		return res.status(202).json(genericMessage);
	requestedAccounts.set(key, now + 60000);
	// Respond before the lookup/mail request so response timing does not reveal account existence.
	res.status(202).json(genericMessage);

	try {
		const managementToken = await getUserManagmentToken();
		const realmUrl = `${process.env.KEYCLOAK_URL}/admin/realms/${process.env.KEYCLOAK_REALM}`;
		const search = new URLSearchParams({ email: normalizedEmail, exact: 'true' });
		const headers = {
			Authorization: `Bearer ${managementToken}`,
			'Content-Type': 'application/json'
		};
		const response = await fetch(`${realmUrl}/users?${search}`, {
			headers,
			redirect: 'error',
			signal: AbortSignal.timeout(10000)
		});
		if (!response.ok) throw new Error('Recovery unavailable');
		const users = await response.json();
		const user =
			Array.isArray(users) &&
			users.find(
				(candidate) =>
					candidate.enabled !== false &&
					typeof candidate.id === 'string' &&
					typeof candidate.email === 'string' &&
					candidate.email.toLowerCase() === normalizedEmail
			);
		if (user) {
			const sent = await fetch(
				`${realmUrl}/users/${encodeURIComponent(user.id)}/execute-actions-email?lifespan=900`,
				{
					method: 'PUT',
					headers,
					body: JSON.stringify(['UPDATE_PASSWORD']),
					redirect: 'error',
					signal: AbortSignal.timeout(10000)
				}
			);
			if (!sent.ok) throw new Error('Recovery unavailable');
		}
	} catch {
		// No email addresses, Keycloak response bodies, credentials or reset links in logs.
		console.warn(
			'Password recovery unavailable: check Keycloak SMTP and service-account permissions.'
		);
	}
};

const retiredResetEndpoint = (_req, res) =>
	res.status(410).json({
		message:
			'Code-based password reset has been removed. Request a recovery email and follow its Keycloak link.'
	});

export {
	createResetCode,
	retiredResetEndpoint as checkResetCode,
	retiredResetEndpoint as resetPassword
};
