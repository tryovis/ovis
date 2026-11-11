// toastStore.ts
import { writable } from 'svelte/store';

export const toastStore = writable<string | null>(null);
let hideTimer: ReturnType<typeof setTimeout>;

export const showToast = (message: string) => {
  clearTimeout(hideTimer);
  toastStore.set(message);

  hideTimer = setTimeout(() => {
    toastStore.set(null);
  }, 8000);
};
