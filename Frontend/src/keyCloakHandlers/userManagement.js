// @ts-check
/**
 * @typedef {Object} UserData
 * @property {string} email
 * @property {string} username
 * @property {string} firstName
 * @property {string} lastName
 * @property {boolean} [enabled]
 * @property {boolean} [emailVerified]
 * @property {Object} [attributes]
 * @property {string} [password]
 * @property {boolean} [temporaryPassword]
 */

/**
 * @typedef {Object} UserUpdates
 * @property {string} [firstName]
 * @property {string} [lastName]
 * @property {string} [phone]
 * @property {string} [organization]
 * @property {string} [department]
 * @property {string} [title]
 * @property {Object} [customAttributes]
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
 * Represents a Keycloak user.
 */
class User {
  /**
   * @param {Object} userInfo
   * @param {string} userInfo.sub
   * @param {boolean} userInfo.email_verified
   * @param {string} userInfo.name
   * @param {string} userInfo.preferred_username
   * @param {string} userInfo.given_name
   * @param {string} userInfo.family_name
   * @param {string} userInfo.email
   * @param {any} userInfo.others
   */
  constructor({ sub, email_verified, name, preferred_username, given_name, family_name, email, ...others }) {
    this.id = sub;
    this.emailVerified = email_verified;
    this.fullName = name;
    this.username = preferred_username;
    this.firstName = given_name;
    this.lastName = family_name;
    this.email = email;
    this.otherClaims = others;
  }
}

/**
 * Gets user information from the Keycloak server and returns a User object.
 *
 * @param {string} accessToken    Valid access token of the user
 * @returns {Promise<User>}       Promise that resolves to a User object
 * @throws {AuthenticationError}  on HTTP 401 or 403
 * @throws {HttpError}            on other HTTP errors
 */
export async function getUserInfo(accessToken) {
  const url = `${BASE_URL}/api/keycloak/userinfo`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${BEARER_TOKEN}`
    },
    body: JSON.stringify({ token: accessToken })
  });

  if (response.status === 401) {
    throw new AuthenticationError('Token is invalid or expired', 401);
  }
  if (response.status === 403) {
    throw new AuthenticationError('Basic authentication failed', 403);
  }
  if (!response.ok) {
    throw new HttpError(`HTTP error: ${response.statusText}`, response.status);
  }

  const data = await response.json();
  return new User(data);
}

/**
 * Updates user attributes in Keycloak.
 *
 * @param {string} email          User's email address
 * @param {Object} attributes     Attributes to update
 * @returns {Promise<Object>}     Promise that resolves to the update response
 * @throws {AuthenticationError}  on HTTP 401 or 403
 * @throws {HttpError}            on other HTTP errors
 */
export async function updateUserAttributes(email, attributes) {
  const url = `${BASE_URL}/api/keycloak/user/${encodeURIComponent(email)}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${BEARER_TOKEN}`
    },
    body: JSON.stringify({ attributes })
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
 * Creates a new user in Keycloak.
 *
 * @param {Object} userData       User data object for creation
 * @returns {Promise<Object>}     Promise that resolves to the creation response
 * @throws {AuthenticationError}  on HTTP 401 or 403
 * @throws {HttpError}            on other HTTP errors
 */
export async function createUser(userData) {
  const url = `${BASE_URL}/api/keycloak/createuser`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${BEARER_TOKEN}`
    },
    body: JSON.stringify(userData)
  });

  if (response.status === 403) {
    throw new AuthenticationError('Basic authentication failed', 403);
  }
  if (!response.ok) {
    throw new HttpError(`HTTP error: ${response.statusText}`, response.status);
  }

  return await response.json();
}

/**
 * Helper function to update specific user attributes easily.
 * 
 * @param {string} email          User's email address
 * @param {UserUpdates} updates   Object with attribute names and values to update
 * @returns {Promise<Object>}     Promise that resolves to the update response
 */
export async function updateUserProfile(email, updates) {
  /** @type {Object<string, string[]>} */
  const attributes = {};
  
  // Convert common profile fields to Keycloak attribute format
  if (updates.firstName) attributes.firstName = [updates.firstName];
  if (updates.lastName) attributes.lastName = [updates.lastName];
  if (updates.phone) attributes.phone = [updates.phone];
  if (updates.organization) attributes.organization = [updates.organization];
  if (updates.department) attributes.department = [updates.department];
  if (updates.title) attributes.title = [updates.title];
  
  // Add any custom attributes directly
  if (updates.customAttributes) {
    Object.assign(attributes, updates.customAttributes);
  }
  
  return await updateUserAttributes(email, attributes);
}

/**
 * Helper function to get user information with better error handling.
 *
 * @param {string} accessToken    Valid access token
 * @param {boolean} [retryOnce=false]     Whether to retry once on token error
 * @returns {Promise<User>}       Promise that resolves to a User object
 */
export async function getUserProfile(accessToken, retryOnce = false) {
  try {
    return await getUserInfo(accessToken);
  } catch (error) {
    // @ts-ignore - error object type checking
    if (error && error.status === 401 && retryOnce) {
      // Token might be expired, caller should handle refresh
      throw new AuthenticationError('Token expired, refresh required', 401);
    }
    throw error;
  }
}

/**
 * Utility function to validate user data before creation.
 *
 * @param {UserData} userData     User data to validate
 * @returns {boolean}             True if valid
 * @throws {Error}                If validation fails
 */
export function validateUserData(userData) {
  if (!userData.email) {
    throw new Error('Email is required');
  }
  
  if (!userData.username) {
    throw new Error('Username is required');
  }
  
  if (!userData.firstName) {
    throw new Error('First name is required');
  }
  
  if (!userData.lastName) {
    throw new Error('Last name is required');
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(userData.email)) {
    throw new Error('Invalid email format');
  }
  
  return true;
}

/**
 * Helper function to format user data for Keycloak creation.
 *
 * @param {UserData} userData     Raw user data
 * @returns {Object}              Formatted user data for Keycloak
 */
export function formatUserDataForCreation(userData) {
  /** @type {any} */
  const formatted = {
    email: userData.email,
    username: userData.username || userData.email,
    firstName: userData.firstName,
    lastName: userData.lastName,
    enabled: userData.enabled !== undefined ? userData.enabled : true,
    emailVerified: userData.emailVerified !== undefined ? userData.emailVerified : false,
    attributes: userData.attributes || {}
  };
  
  // Add temporary password if provided
  if (userData.password) {
    formatted.credentials = [{
      type: 'password',
      value: userData.password,
      temporary: userData.temporaryPassword !== undefined ? userData.temporaryPassword : true
    }];
  }
  
  return formatted;
}

// Export functions and classes
export {
  User,
  AuthenticationError,
  HttpError
}; 