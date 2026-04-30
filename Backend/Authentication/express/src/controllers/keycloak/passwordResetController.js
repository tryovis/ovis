import { authenticateRequest } from '../component/getAuthentification.js';
import { getUserManagmentToken } from './authentificationController.js';

// In-memory store for password reset codes
const resetCodes = new Map();

/**
 * Generates a random 6-digit code
 * @returns {string} 6-digit code
 */
const generateVerificationCode = () => {
	return Math.floor(100000 + Math.random() * 900000).toString();
};

const userExistsInKeycloak = async (email) => {
	const managementToken = await getUserManagmentToken();

	const url = `${process.env.KEYCLOAK_URL}/admin/realms/${process.env.KEYCLOAK_REALM}/users?username=${email}`;

	const response = await fetch(url, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${managementToken}`,
			'Content-Type': 'application/json'
		}
	});

	if (!response.ok) {
		throw new Error(`Error fetching user from Keycloak: ${response.statusText}`);
	}

	const users = await response.json();
	return users.length > 0; // Return true if user exists
};

/**
 * Creates or updates a password reset code for a given email
 * @async
 * @function createResetCode
 */
const createResetCode = async (req, res) => {
	try {
		authenticateRequest(req);

		const { email } = req.body;

		if (!email) {
			return res.status(400).json({
				message: 'Email is required'
			});
		}

		// Check if the user exists in Keycloak
		const userExists = await userExistsInKeycloak(email);
		if (!userExists) {
			return res.status(404).json({
				message: 'User does not exist'
			});
		}

		const resetCode = generateVerificationCode();

		// Store in memory
		resetCodes.set(email, {
			reset_code: resetCode,
			verified: false,
			created_at: new Date()
		});

		res.status(200).json({
			message: 'Reset code generated successfully',
			reset_code: resetCode
		});
	} catch (error) {
		console.error('Reset code generation error:', error);
		res.status(error.status || 500).json({
			message: error.message || 'Failed to generate reset code'
		});
	}
};

/**
 * Checks if the provided reset code matches the one stored in the database for the given email
 * @async
 * @function checkResetCode
 */
const checkResetCode = async (req, res) => {
	try {
		const { email, reset_code } = req.body;

		if (!email || !reset_code) {
			return res.status(400).json({
				message: 'Email and reset code are required'
			});
		}

		const record = resetCodes.get(email);

		if (!record) {
			return res.status(404).json({
				message: 'No reset code found for this email'
			});
		}

		// Check if the reset code matches
		const isCodeValid = record.reset_code === reset_code;

		// Update the verified field based on the code validity
		record.verified = isCodeValid;
		resetCodes.set(email, record);

		res.status(200).json({
			valid: isCodeValid
		});
	} catch (error) {
		console.error('Error checking reset code:', error);
		res.status(error.status || 500).json({
			message: error.message || 'Failed to check reset code'
		});
	}
};

/**
 * Resets a user's password in Keycloak
 * @async
 * @function resetPassword
 */
const resetPassword = async (req, res) => {
	try {
		authenticateRequest(req);

		const { email, newpassword } = req.body;

		if (!email || !newpassword) {
			return res.status(400).json({
				message: 'Email and new password are required'
			});
		}

		// Check if there's a valid reset code for this email
		const resetCodeRecord = resetCodes.get(email);

		if (!resetCodeRecord) {
			return res.status(404).json({
				message: 'Password reset code not found or has expired'
			});
		}

		if (!resetCodeRecord.verified) {
			return res.status(403).json({
				message: 'Password reset code has not been verified'
			});
		}

		// Get management token first
		const managementToken = await getUserManagmentToken();
		if (!managementToken) {
			return res.status(500).json({
				message: 'Failed to obtain management token'
			});
		}

		// First, get the user ID from Keycloak using the email
		const userSearchUrl = `${process.env.KEYCLOAK_URL}/admin/realms/${process.env.KEYCLOAK_REALM}/users?username=${email}`;
		const userSearchResponse = await fetch(userSearchUrl, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${managementToken}`,
				'Content-Type': 'application/json'
			}
		});

		if (!userSearchResponse.ok) {
			throw new Error(`Error fetching user from Keycloak: ${userSearchResponse.statusText}`);
		}

		const users = await userSearchResponse.json();
		if (!users || users.length === 0) {
			return res.status(404).json({
				message: 'User not found in Keycloak'
			});
		}

		const userId = users[0].id; // Get the ID of the first matching user

		// Now reset the password using the obtained user ID
		const resetUrl = `${process.env.KEYCLOAK_URL}/admin/realms/${process.env.KEYCLOAK_REALM}/users/${userId}/reset-password`;

		const resetResponse = await fetch(resetUrl, {
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${managementToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				type: 'password',
				value: newpassword,
				temporary: false
			})
		});

		if (!resetResponse.ok) {
			const errorData = await resetResponse.json().catch(() => ({
				error: `HTTP error! status: ${resetResponse.status}`
			}));
			throw new Error(errorData.error || 'Password reset failed');
		}

		// After successful password reset, delete the reset code record
		resetCodes.delete(email);

		res.status(204).send();
	} catch (error) {
		console.error('Password reset error:', error);
		res.status(error.status || 500).json({
			message: error.message || 'Failed to reset password'
		});
	}
};

export { createResetCode, checkResetCode, resetPassword };
