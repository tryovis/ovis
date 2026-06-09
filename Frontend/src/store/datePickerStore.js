import { writable } from 'svelte/store';

/** @typedef {{ show: boolean; selectedDate: string | null; collection: string | null; typeOfDate: string | null; }} DatePickerState */

/** @type {import('svelte/store').Writable<DatePickerState>} */
export const datePickerStore = writable({
	show: false,
	selectedDate: null,
	collection: null,
	typeOfDate: null
});

/** @param {boolean} show */
export function toggleDatePicker(show) {
	datePickerStore.update((state) => ({
		...state,
		show
	}));
}
