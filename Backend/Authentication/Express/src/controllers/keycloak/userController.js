import { getUserManagmentToken } from './authentificationController.js';

/**
 * Updates user attributes in Keycloak
 * @async
 * @function updateUserAttributes
 */
const updateUserAttributes = async (req, res) => {
	const email = req.params.email; // Get email from URL parameter
	const attributesToUpdate = req.body.attributes; // Get attributes from request body

	console.log('Updating attributes for user:', email);
	console.log('Attributes to update:', attributesToUpdate);

	if (!email || !attributesToUpdate) {
		return res.status(400).json({ message: 'Email and attributes are required' });
	}

	try {
		// Get management token
		const managementToken = await getUserManagmentToken();
		if (!managementToken) {
			return res.status(500).json({ message: 'Failed to obtain management token' });
		}

		// First, get the user from Keycloak
		const userSearchUrl = `${process.env.KEYCLOAK_URL}/admin/realms/${process.env.KEYCLOAK_REALM}/users?email=${email}`;
		const userResponse = await fetch(userSearchUrl, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${managementToken}`,
				'Content-Type': 'application/json'
			}
		});

		if (!userResponse.ok) {
			console.error('Failed to fetch user:', await userResponse.text());
			return res.status(404).json({ message: 'User not found' });
		}

		const users = await userResponse.json();
		if (!users || users.length === 0) {
			return res.status(404).json({ message: 'User not found' });
		}

		const user = users[0];
		const userId = user.id;

		// Prepare the update payload
		const updatePayload = {
			...user,
			attributes: {
				...user.attributes,
				...attributesToUpdate
			}
		};

		//console.log('Update payload:', updatePayload);

		// Update the user in Keycloak
		const updateUrl = `${process.env.KEYCLOAK_URL}/admin/realms/${process.env.KEYCLOAK_REALM}/users/${userId}`;
		const updateResponse = await fetch(updateUrl, {
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${managementToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(updatePayload)
		});

		if (!updateResponse.ok) {
			console.error('Failed to update user:', await updateResponse.text());
			return res.status(500).json({ message: 'Failed to update user attributes' });
		}

		res.status(200).json({
			message: 'User attributes updated successfully',
			updatedAttributes: attributesToUpdate
		});
	} catch (error) {
		console.error('Error updating user attributes:', error);
		res.status(500).json({ message: error.message || 'Failed to update user attributes' });
	}
};

export { updateUserAttributes }; // Export the updated method
