import { writable } from 'svelte/store';
import { env } from '$env/dynamic/public';

const startLanguage = env.PUBLIC_SYSTEM_START_LANGUAGE?.trim() || 'en';

export const userStore = writable({
    currentUser: "",
    currentRole: "user",
    currentLanguage: startLanguage,
    currentTheme: false,
    primaryColorRGB: {},
    primaryColor: "#000000", //#29b8ff",
    colorPalette: [
        "#000000","#000000"],
    paletteName: "CCCMunich",
    darkMode: false,
    pseudonymization: false,
    currentFilter: ""
});


