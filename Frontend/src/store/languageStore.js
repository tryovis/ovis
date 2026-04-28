import { derived, writable } from 'svelte/store';
import translations from './translations';

/** @typedef {keyof typeof translations} TranslationLocale */
/** @typedef {Record<string, string | number>} TranslationVars */

export const locale = writable(/** @type {TranslationLocale} */ ('de'));
export const locales = /** @type {TranslationLocale[]} */ (Object.keys(translations));

/**
 * @param {TranslationLocale} currentLocale
 * @param {string} key
 * @param {TranslationVars} [vars]
 */
function translate(currentLocale, key, vars = {}) {
	// Let's throw some errors if we're trying to use keys/locales that don't exist.
	// We could improve this by using Typescript and/or fallback values.
	if (!key) throw new Error('no key provided to $t()');
	if (!currentLocale) throw new Error(`no translation for key "${key}"`);

	// Grab the translation from the translations object.
	const messages = /** @type {Record<string, string>} */ (translations[currentLocale]);
	let text = messages[key];

	if (!text) throw new Error(`no translation found for ${currentLocale}.${key}`);

	// Replace any passed in variables in the translation string.
	Object.keys(vars).forEach((variableKey) => {
		const regex = new RegExp(`{{${variableKey}}}`, 'g');
		text = text.replace(regex, String(vars[variableKey]));
	});

	return text;
}

export const t = derived(locale, ($locale) => (key, vars = {}) =>
	translate($locale, key, /** @type {TranslationVars} */ (vars))
);
