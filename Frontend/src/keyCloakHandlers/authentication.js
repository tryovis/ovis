// @ts-check
/**
 * @typedef {Object} ProcessEnv
 * @property {string} VITE_EXPRESS_BASEURL
 * @property {string} VITE_EXPRESS_USERNAME  
 * @property {string} VITE_EXPRESS_PASSWORT
 */

/**
 * @typedef {Object} TokenData
 * @property {number} timestamp
 * @property {number} expires_in
 * @property {string} refresh_token
 * @property {string} access_token
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
 * Authenticates a user against Keycloak and returns the token object.
 *
 * @param {string} username       Username (email)
 * @param {string} password       User's password
 * @returns {Promise<Object>}     Promise that resolves to the JSON token object
 * @throws {AuthenticationError}  on HTTP 401 or 403
 * @throws {HttpError}            on other HTTP errors
 */
export async function login(username, password) {
  const url = `${BASE_URL}/api/keycloak/login`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Basic ${BEARER_TOKEN}`
    },
    body: JSON.stringify({ username, password })
  });

  if (response.status === 401) {
    throw new AuthenticationError('Invalid credentials', 401);
  }
  if (response.status === 403) {
    throw new AuthenticationError('Basic authentication failed', 403);
  }
  if (!response.ok) {
    throw new HttpError(`HTTP error: ${response.statusText}`, response.status);
  }

  return await response.json();
}

/**
 * Logs out a user by revoking their refresh token.
 *
 * @param {string} refreshToken   Valid refresh token
 * @returns {Promise<Object>}     Promise that resolves to the logout response
 * @throws {AuthenticationError}  on HTTP 401 or 403
 * @throws {HttpError}            on other HTTP errors
 */
export async function logout(refreshToken) {
  const url = `${BASE_URL}/api/keycloak/logout`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Basic ${BEARER_TOKEN}`
    },
    body: JSON.stringify({ refresh_token: refreshToken })
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
 * Refreshes an access token using a refresh token.
 *
 * @param {string} refreshToken   Valid refresh token
 * @returns {Promise<Object>}     Promise that resolves to the new token object
 * @throws {AuthenticationError}  on HTTP 401 or 403
 * @throws {HttpError}            on other HTTP errors
 */
export async function refreshToken(refreshToken) {
  const url = `${BASE_URL}/api/keycloak/refresh`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Basic ${BEARER_TOKEN}`
    },
    body: JSON.stringify({ refresh_token: refreshToken })
  });

  if (response.status === 400) {
    throw new AuthenticationError('Invalid refresh token', 400);
  }
  if (response.status === 401) {
    throw new AuthenticationError('Refresh token expired', 401);
  }
  if (response.status === 403) {
    throw new AuthenticationError('Basic authentication failed', 403);
  }
  if (!response.ok) {
    throw new HttpError(`HTTP error: ${response.statusText}`, response.status);
  }

  return await response.json();
}

/**
 * Introspects a token to check its validity.
 *
 * @param {string} token          Token to introspect
 * @returns {Promise<Object>}     Promise that resolves to the introspection result
 * @throws {AuthenticationError}  on HTTP 401 or 403
 * @throws {HttpError}            on other HTTP errors
 */
export async function introspectToken(token) {
  const url = `${BASE_URL}/api/keycloak/introspect`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Basic ${BEARER_TOKEN}`
    },
    body: JSON.stringify({ token })
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
      'Authorization': `Basic ${BEARER_TOKEN}`
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
      'Authorization': `Basic ${BEARER_TOKEN}`
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
 * Checks if a token is expired based on its timestamp and expires_in value.
 *
 * @param {TokenData|any} tokenData      Token data with timestamp and expires_in
 * @returns {boolean}             True if token is expired
 */
export function isTokenExpired(tokenData) {
  if (!tokenData || !tokenData.timestamp || !tokenData.expires_in) {
    return true;
  }
  
  const now = Date.now();
  const expiryTime = tokenData.timestamp + (tokenData.expires_in * 1000);
  
  // Consider token expired if it expires within the next 30 seconds
  return now >= (expiryTime - 30000);
}

/**
 * Utility function to automatically refresh token if needed.
 *
 * @param {TokenData|any} tokenData      Current token data
 * @returns {Promise<Object>}     Promise that resolves to valid token data
 */
export async function ensureValidToken(tokenData) {
  if (!tokenData) {
    throw new AuthenticationError('No token data provided', 401);
  }

  if (isTokenExpired(tokenData)) {
    if (!tokenData.refresh_token) {
      throw new AuthenticationError('Token expired and no refresh token available', 401);
    }
    
    return await refreshToken(tokenData.refresh_token);
  }
  
  return tokenData;
}

// Export functions and classes
export {
  User,
  AuthenticationError,
  HttpError
}; 