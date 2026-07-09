import { writable } from 'svelte/store';
import { env } from '$env/dynamic/public';

// Read runtime public environment variables
// This allows the same image to work across different import modes
const PUBLIC_IMPORT_MODE = env.PUBLIC_IMPORT_MODE;
const PUBLIC_LOGIN_ENABLED = env.PUBLIC_LOGIN_ENABLED;
const normalizedImportMode = PUBLIC_IMPORT_MODE?.trim().toLowerCase() || 'ovis';

// Convert string env variables to boolean with safe defaults
// Handle edge cases where env variables might be undefined, null, or empty
const isCCP = normalizedImportMode === 'ccp';
const loginEnabled = PUBLIC_LOGIN_ENABLED && PUBLIC_LOGIN_ENABLED.trim().toLowerCase() === 'true';

export const variantStore = writable({
	importMode: normalizedImportMode,
	isCCP: isCCP,
	loginEnabled: loginEnabled
});
