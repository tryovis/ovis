// toastStore.ts
import { writable } from 'svelte/store';

export const toastStore = writable<string | null>(null);

export const showToast = (message: string) => {
  toastStore.set(message);

  // Automatically hide the toast after a certain duration (e.g., 3000 milliseconds)
  setTimeout(() => {
    toastStore.set(null);
  }, 8000);
};