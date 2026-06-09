// @ts-check
/**
 * @typedef {Object} PasswordValidationResult
 * @property {boolean} isValid
 * @property {string[]} messages
 */

// Access environment variables using import.meta.env in SvelteKit
const VITE_EXPRESS_BASEURL = import.meta.env.VITE_EXPRESS_BASEURL;
const VITE_EXPRESS_USERNAME = import.meta.env.VITE_EXPRESS_USERNAME;
const VITE_EXPRESS_PASSWORT = import.meta.env.VITE_EXPRESS_PASSWORT;

if (!VITE_EXPRESS_BASEURL || !VITE_EXPRESS_USERNAME || !VITE_EXPRESS_PASSWORT) {
  throw new Error('Missing required environment variables: VITE_EXPRESS_BASEURL, VITE_EXPRESS_USERNAME, VITE_EXPRESS_PASSWORT');
}

// Base URL and Bearer token from environment variables
const BASE_URL = VITE_EXPRESS_BASEURL.replace(/\/+$/, '');

// Use Buffer if available (Node.js), otherwise use btoa (browser)
/** @type {string} */
let BEARER_TOKEN;
// @ts-ignore - Buffer may not be available in browser
if (typeof Buffer !== 'undefined') {
  // @ts-ignore
  BEARER_TOKEN = Buffer.from(`${VITE_EXPRESS_USERNAME}:${VITE_EXPRESS_PASSWORT}`).toString('base64');
} else {
  BEARER_TOKEN = btoa(`${VITE_EXPRESS_USERNAME}:${VITE_EXPRESS_PASSWORT}`);
}

/**
 * Specific exceptions for authentication and HTTP errors.
 */
class AuthenticationError extends Error {
  /**
   * @param {string} message 
   * @param {number} status 
   */
  constructor(message, status) {
    super(message);
    this.name = 'AuthenticationError';
    this.status = status;
  }
}

class HttpError extends Error {
  /**
   * @param {string} message 
   * @param {number} status 
   */
  constructor(message, status) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * Creates a password reset code for a user.
 *
 * @param {string} email          User's email address
 * @returns {Promise<Object>}     Promise that resolves to the reset code response
 * @throws {AuthenticationError}  on HTTP 401 or 403
 * @throws {HttpError}            on other HTTP errors
 */
export async function createResetCode(email) {
  const url = `${BASE_URL}/api/keycloak/create-reset-code`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${BEARER_TOKEN}`
    },
    body: JSON.stringify({ email })
  });

  if (response.status === 403) {
    throw new AuthenticationError('Basic authentication failed', 403);
  }
  if (response.status === 404) {
    throw new HttpError('User not found', 404);
  }
  if (!response.ok) {
    throw new HttpError(`HTTP error: ${response.statusText}`, response.status);
  }

  return await response.json();
}

/**
 * Checks if a password reset code is valid.
 *
 * @param {string} email          User's email address
 * @param {string} resetCode      Reset code to validate
 * @returns {Promise<Object>}     Promise that resolves to the validation response
 * @throws {AuthenticationError}  on HTTP 401 or 403
 * @throws {HttpError}            on other HTTP errors
 */
export async function checkResetCode(email, resetCode) {
  const url = `${BASE_URL}/api/keycloak/check-reset-code`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${BEARER_TOKEN}`
    },
    body: JSON.stringify({ email, resetCode })
  });

  if (response.status === 400) {
    throw new HttpError('Invalid or expired reset code', 400);
  }
  if (response.status === 403) {
    throw new AuthenticationError('Basic authentication failed', 403);
  }
  if (response.status === 404) {
    throw new HttpError('User not found', 404);
  }
  if (!response.ok) {
    throw new HttpError(`HTTP error: ${response.statusText}`, response.status);
  }

  return await response.json();
}

/**
 * Resets a user's password using a valid reset code.
 *
 * @param {string} email          User's email address
 * @param {string} resetCode      Valid reset code
 * @param {string} newPassword    New password
 * @returns {Promise<Object>}     Promise that resolves to the reset response
 * @throws {AuthenticationError}  on HTTP 401 or 403
 * @throws {HttpError}            on other HTTP errors
 */
export async function resetPassword(email, resetCode, newPassword) {
  const url = `${BASE_URL}/api/keycloak/reset-password`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${BEARER_TOKEN}`
    },
    body: JSON.stringify({ 
      email, 
      resetCode, 
      newPassword 
    })
  });

  if (response.status === 400) {
    throw new HttpError('Invalid or expired reset code', 400);
  }
  if (response.status === 403) {
    throw new AuthenticationError('Basic authentication failed', 403);
  }
  if (response.status === 404) {
    throw new HttpError('User not found', 404);
  }
  if (!response.ok) {
    throw new HttpError(`HTTP error: ${response.statusText}`, response.status);
  }

  return await response.json();
}

/**
 * Complete password reset flow - creates code, validates it, and resets password.
 *
 * @param {string} email          User's email address
 * @param {string} resetCode      Reset code received by user
 * @param {string} newPassword    New password
 * @returns {Promise<Object>}     Promise that resolves to the reset response
 */
export async function completePasswordReset(email, resetCode, newPassword) {
  // First validate the reset code
  await checkResetCode(email, resetCode);
  
  // If valid, proceed with password reset
  return await resetPassword(email, resetCode, newPassword);
}

/**
 * Initiates password reset process by creating a reset code.
 *
 * @param {string} email          User's email address
 * @returns {Promise<Object>}     Promise that resolves to success message
 */
export async function initiatePasswordReset(email) {
  if (!email) {
    throw new Error('Email is required');
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Invalid email format');
  }
  
  return await createResetCode(email);
}

/**
 * Validates password strength.
 *
 * @param {string} password       Password to validate
 * @returns {PasswordValidationResult}  Validation result with isValid and messages
 */
export function validatePassword(password) {
  /** @type {PasswordValidationResult} */
  const result = {
    isValid: true,
    messages: []
  };
  
  if (!password || password.length < 8) {
    result.isValid = false;
    result.messages.push('Password must be at least 8 characters long');
  }
  
  if (!/(?=.*[a-z])/.test(password)) {
    result.isValid = false;
    result.messages.push('Password must contain at least one lowercase letter');
  }
  
  if (!/(?=.*[A-Z])/.test(password)) {
    result.isValid = false;
    result.messages.push('Password must contain at least one uppercase letter');
  }
  
  if (!/(?=.*\d)/.test(password)) {
    result.isValid = false;
    result.messages.push('Password must contain at least one number');
  }
  
  if (!/(?=.*[@$!%*?&])/.test(password)) {
    result.isValid = false;
    result.messages.push('Password must contain at least one special character (@$!%*?&)');
  }
  
  return result;
}

/**
 * Helper function for the complete password reset with validation.
 *
 * @param {string} email          User's email address
 * @param {string} resetCode      Reset code received by user
 * @param {string} newPassword    New password
 * @param {string} confirmPassword Confirmation password
 * @returns {Promise<Object>}     Promise that resolves to the reset response
 */
export async function validateAndResetPassword(email, resetCode, newPassword, confirmPassword) {
  // Validate inputs
  if (!email || !resetCode || !newPassword || !confirmPassword) {
    throw new Error('All fields are required');
  }
  
  // Check if passwords match
  if (newPassword !== confirmPassword) {
    throw new Error('Passwords do not match');
  }
  
  // Validate password strength
  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.isValid) {
    throw new Error(`Password validation failed: ${passwordValidation.messages.join(', ')}`);
  }
  
  // Proceed with password reset
  return await completePasswordReset(email, resetCode, newPassword);
}

// Export functions and classes
export {
  AuthenticationError,
  HttpError
}; 