import { writable } from 'svelte/store';

export const filterSaveStore = writable({
    currentIndex: 0,
    filterSaveArray: ["{\"operand\":\"OR\",\"children\":[]}"]
});



