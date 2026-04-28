import { writable } from 'svelte/store';


let singlePatient = "";

export const singlePatientStore = writable({
    singlePatient: ""
});