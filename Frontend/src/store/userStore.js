import { writable } from 'svelte/store';
import { env } from '$env/dynamic/public';
import { colorArrays } from '../components/ColorArray.js';

const startLanguage = env.PUBLIC_SYSTEM_START_LANGUAGE?.trim() || 'en';
const startTheme = env.PUBLIC_SYSTEM_COLOR_THEME?.trim() || 'CCCMunich';
const startPaletteDefinition = colorArrays.find(({ name }) => name === startTheme) ?? colorArrays[0];
const startPrimaryColor = startPaletteDefinition.colors[0] ?? '#000000';
const startPrimaryColorRGB = {
    r: Number.parseInt(startPrimaryColor.slice(1, 3), 16),
    g: Number.parseInt(startPrimaryColor.slice(3, 5), 16),
    b: Number.parseInt(startPrimaryColor.slice(5, 7), 16)
};

export const userStore = writable({
    currentUser: "",
    currentRole: "user",
    currentLanguage: startLanguage,
    currentTheme: false,
    primaryColorRGB: startPrimaryColorRGB,
    primaryColor: startPrimaryColor,
    colorPalette: startPaletteDefinition.colors,
    paletteName: startPaletteDefinition.name,
    darkMode: false,
    chartShowTop5: true,
    chartHideNullValues: true,
    pseudonymization: false,
    currentFilter: ""
});

