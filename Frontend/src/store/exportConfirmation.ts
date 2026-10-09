import { writable } from 'svelte/store';

export type ExportConfirmationRequest = Readonly<{ fileName: string; title: string }>;
export type PendingExportConfirmation = ExportConfirmationRequest & Readonly<{ id: number }>;

const state = writable<PendingExportConfirmation | null>(null);
export const exportConfirmation = { subscribe: state.subscribe };
let nextId = 0;
let pending: { id: number; resolve: (accepted: boolean) => void } | null = null;

/** Each export requires its own decision. A second request cannot replace an open dialog. */
export function requestExportConfirmation(request: ExportConfirmationRequest): Promise<boolean> {
	if (pending) return Promise.resolve(false);
	return new Promise((resolve) => {
		const id = ++nextId;
		pending = { id, resolve };
		state.set(Object.freeze({ id, fileName: request.fileName, title: request.title }));
	});
}

/** Ignore stale dialog events rather than settling a newer export request. */
export function resolveExportConfirmation(id: number, accepted: boolean): void {
	if (!pending || pending.id !== id) return;
	const resolve = pending.resolve;
	pending = null;
	state.set(null);
	resolve(accepted);
}
