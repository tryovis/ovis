import { writable } from "svelte/store";
import { filterActiveStore } from './filterActiveStore.js';

export const reloadStore = writable(true);
export const reloadFilter = writable(true);

// Lokale Variable für filterActive
let filterActive = true;

// Abonnieren des filterActiveStore und den Wert aktualisieren
filterActiveStore.subscribe((value) => {
  filterActive = value.filterActive; // Hier den Wert direkt zuweisen
});

export function reloadOnly() {
  if (filterActive) {
    console.log("TEST FILTER ACTIVE");
    reloadStore.set(false);
    setTimeout(() => {
      reloadStore.set(true);
    }, 0);
  } else{
    console.log("TEST FILTER INACTIVE");
    reloadFilter.set(false);
    setTimeout(() => {
      reloadFilter.set(true);
    }, 0);
  }
}
