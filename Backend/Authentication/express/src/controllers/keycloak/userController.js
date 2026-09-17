import { getUserManagmentToken } from './authentificationController.js';

// Authorization attributes (including ovisFilter) must never be self-editable.
const PROFILE_ATTRIBUTES = new Set([
	'firstName',
	'lastName',
	'phone',
	'organization',
	'department',
	'title',
	'locale'
]);

const updateUserAttributes = async (req, res) => {
	const attributes = req.body?.attributes;
	if (
		!attributes ||
		typeof attributes !== 'object' ||
		Array.isArray(attributes) ||
		Object.keys(attributes).length === 0 ||
		Object.entries(attributes).some(
			([name, value]) =>
				!PROFILE_ATTRIBUTES.has(name) ||
				!Array.isArray(value) ||
				value.length !== 1 ||
				typeof value[0] !== 'string' ||
				value[0].length > 320
		)
	) {
		return res.status(400).json({ message: 'Only supported profile attributes may be updated' });
	}
	try {
		const managementToken = await getUserManagmentToken();
		// Address the authenticated identity directly, never search for an attacker-selected email.
		const url = `${process.env.KEYCLOAK_URL}/admin/realms/${
			process.env.KEYCLOAK_REALM
		}/users/${encodeURIComponent(req.auth.sub)}`;
		const headers = {
			Authorization: `Bearer ${managementToken}`,
			'Content-Type': 'application/json'
		};
		const response = await fetch(url, {
			headers,
			redirect: 'error',
			signal: AbortSignal.timeout(10000)
		});
		if (!response.ok) return res.status(503).json({ message: 'User information unavailable' });
		const user = await response.json();
		if (
			user.id !== req.auth.sub ||
			typeof user.email !== 'string' ||
			user.email.toLowerCase() !== req.params.email.toLowerCase()
		) {
			return res.status(403).json({ message: 'Only your own profile may be updated' });
		}
		const updated = await fetch(url, {
			method: 'PUT',
			headers,
			body: JSON.stringify({ attributes: { ...user.attributes, ...attributes } }),
			redirect: 'error',
			signal: AbortSignal.timeout(10000)
		});
		if (!updated.ok) return res.status(400).json({ message: 'Profile update failed' });
		return res
			.status(200)
			.json({ message: 'User attributes updated successfully', updatedAttributes: attributes });
	} catch {
		return res.status(503).json({ message: 'User management unavailable' });
	}
};

export { updateUserAttributes };
