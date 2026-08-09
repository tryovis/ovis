import { env } from '$env/dynamic/public';
import { get, writable } from 'svelte/store';
import { colorArrays } from '../components/ColorArray.js';
import {
	getPlatformConfiguration,
	type PlatformConfiguration,
	type PlatformDocumentType,
	type PlatformLanguage
} from '../graphQl/gql-platformCustomization';
import { apiPath, publicAssetPath } from '$lib/path-utils';
import { locale } from './languageStore';
import { userStore } from './userStore';

const normalizeLanguage = (value?: string): PlatformLanguage =>
	value?.trim().toLowerCase().startsWith('de') ? 'de' : 'en';

const environmentTheme = env.PUBLIC_SYSTEM_COLOR_THEME?.trim() || 'CCCMunich';
const environmentPaletteDefinition =
	colorArrays.find((palette) => palette.name === environmentTheme) ?? colorArrays[0];

export const environmentPlatformConfiguration: PlatformConfiguration = {
	colorTheme: environmentPaletteDefinition.name,
	colorPalette: [...environmentPaletteDefinition.colors],
	systemLanguage: normalizeLanguage(env.PUBLIC_SYSTEM_START_LANGUAGE),
	source: 'ENVIRONMENT',
	updatedAt: null,
	updatedBy: null,
	documents: []
};

export const platformConfigStore = writable<PlatformConfiguration>(
	environmentPlatformConfiguration
);

const withResolvedPalette = (configuration: PlatformConfiguration): PlatformConfiguration => {
	const builtInPalette = colorArrays.find(
		(palette) => palette.name === configuration.colorTheme
	)?.colors;
	const colors =
		configuration.colorPalette?.length >= 2 ? configuration.colorPalette : builtInPalette;
	return {
		...configuration,
		colorTheme: colors ? configuration.colorTheme : environmentPlatformConfiguration.colorTheme,
		colorPalette: [...(colors ?? environmentPlatformConfiguration.colorPalette)],
		systemLanguage: normalizeLanguage(configuration.systemLanguage),
		documents: configuration.documents ?? []
	};
};

type UserAppearancePreferences = {
	colorTheme?: string | null;
	colorPalette?: string[] | null;
	language?: string | null;
};

export type ResolvedUserAppearance = {
	paletteName: string;
	colorPalette: string[];
	primaryColor: string;
	primaryColorRGB: { r: number; g: number; b: number };
	currentLanguage: PlatformLanguage;
};

export function resolveUserAppearance(
	preferences: UserAppearancePreferences,
	configuration = get(platformConfigStore)
): ResolvedUserAppearance {
	const requestedTheme = preferences.colorTheme?.trim() || configuration.colorTheme;
	const storedPalette = Array.isArray(preferences.colorPalette)
		? preferences.colorPalette.filter((color) => /^#[0-9a-f]{6}$/i.test(color))
		: [];
	const builtInPalette = colorArrays.find((palette) => palette.name === requestedTheme)?.colors;
	const colors =
		storedPalette.length >= 2
			? storedPalette
			: builtInPalette?.length
				? builtInPalette
				: requestedTheme === configuration.colorTheme
					? configuration.colorPalette
					: environmentPlatformConfiguration.colorPalette;
	const paletteName =
		storedPalette.length >= 2 || builtInPalette?.length || requestedTheme === configuration.colorTheme
			? requestedTheme
			: environmentPlatformConfiguration.colorTheme;
	const primaryColor = colors[0] ?? '#000000';

	return {
		paletteName,
		colorPalette: [...colors],
		primaryColor,
		primaryColorRGB: hexToRgb(primaryColor),
		currentLanguage: preferences.language?.trim()
			? normalizeLanguage(preferences.language)
			: configuration.systemLanguage
	};
}

export function applyUserAppearance(
	preferences: UserAppearancePreferences,
	configuration = get(platformConfigStore)
) {
	const appearance = resolveUserAppearance(preferences, configuration);
	locale.set(appearance.currentLanguage);
	userStore.update((user) => ({ ...user, ...appearance }));

	if (typeof localStorage !== 'undefined') {
		const storedUser = localStorage.getItem('loggedInUser');
		if (storedUser) {
			try {
				localStorage.setItem(
					'loggedInUser',
					JSON.stringify({ ...JSON.parse(storedUser), ...appearance })
				);
			} catch (_error) {
				// A malformed login cache is handled by the existing token service.
			}
		}
	}

	return appearance;
}

export function applyPlatformConfiguration(configuration: PlatformConfiguration) {
	const resolved = withResolvedPalette(configuration);
	platformConfigStore.set(resolved);
	if (!get(userStore).currentUser) locale.set(resolved.systemLanguage);
	return resolved;
}

let loadPromise: Promise<PlatformConfiguration> | null = null;

export async function loadPlatformConfiguration(force = false): Promise<PlatformConfiguration> {
	if (loadPromise && !force) return loadPromise;
	loadPromise = getPlatformConfiguration()
		.then(applyPlatformConfiguration)
		.catch((error) => {
			console.warn(
				'Platform configuration could not be loaded; using environment defaults.',
				error
			);
			return force
				? get(platformConfigStore)
				: applyPlatformConfiguration(environmentPlatformConfiguration);
		})
		.finally(() => {
			loadPromise = null;
		});
	return loadPromise;
}

export function platformDocumentUrl(
	configuration: PlatformConfiguration,
	type: PlatformDocumentType,
	language: string
): string {
	const normalizedLanguage = normalizeLanguage(language);
	const hasOverride = configuration.documents.some(
		(document) => document.type === type && document.language === normalizedLanguage
	);
	if (hasOverride) {
		return apiPath(`platform-document/${type}/${normalizedLanguage}`);
	}

	const filename =
		type === 'USER_AGREEMENT'
			? `ovis_userAgreement_${normalizedLanguage}_template.pdf`
			: `ovis_authorization_${normalizedLanguage}_template.pdf`;
	return publicAssetPath(`/downloads/${filename}`);
}

export function currentPlatformConfiguration(): PlatformConfiguration {
	return get(platformConfigStore);
}

export function hexToRgb(hex: string) {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result
		? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
		: { r: 0, g: 0, b: 0 };
}
