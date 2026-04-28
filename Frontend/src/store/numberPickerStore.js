import { writable } from 'svelte/store';

/** @typedef {{ show: boolean; selectedNumber: string | number | null; collection: string | null; fieldName: string | null; }} NumberPickerState */

/** @type {import('svelte/store').Writable<NumberPickerState>} */
export const numberPickerStore = writable({
	show: false,
	selectedNumber: null,
	collection: null,
	fieldName: null
});

/** @param {boolean} show */
export function toggleNumberPicker(show) {
	numberPickerStore.update((state) => ({
		...state,
		show
	}));
}
