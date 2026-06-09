import { writable } from 'svelte/store';

/** @typedef {{ show: boolean; selectedTNM: string | null; collection: string | null; typeOfTNM: string | null; }} TNMPickerState */

/** @type {import('svelte/store').Writable<TNMPickerState>} */
export const TNMPickerStore = writable({
	show: false,
	selectedTNM: null,
	collection: null,
	typeOfTNM: null // "T" | "N" | "M"
});

/** @param {boolean} show */
export function toggleTNMPicker(show) {
	TNMPickerStore.update((state) => ({
		...state,
		show
	}));
}