import { writable } from 'svelte/store';


let filterActive;

export const filterActiveStore = writable({
    filterActive: true
});

