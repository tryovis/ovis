import { get } from 'svelte/store';
import { version } from '../../package.json';
import {
	createExportAudit,
	prepareExportAudit,
	completeExportAudit
} from '../graphQl/gql-export-audit';
import { requestExportConfirmation } from '../store/exportConfirmation';
import { filterActiveStore } from '../store/filterActiveStore';
import { t } from '../store/languageStore';
import { showToast } from '../store/toastStore';
import { ExportAuditError, setExportAuditFactory } from './export-workflow';

export const EXPORT_POLICY_VERSION = '2026-10-02';

export function initializeExportAuditing(): () => void {
	return setExportAuditFactory(async (request) => {
		const route = window.location.pathname;
		const context = request.context ?? {};
		const title = context.title || request.fileName;
		const filterActive = context.filterActive ?? get(filterActiveStore).filterActive;
		// Fallback for displays without their own clinical request (e.g. an administration table).
		// Clinical components supply the exact filter snapshot that produced their displayed data.
		const filter = context.filter ?? null;
		const selection = JSON.stringify(context.selection ?? {});
		if (!(await requestExportConfirmation({ fileName: request.fileName, title }))) return null;
		let ticket;
		try {
			ticket = await createExportAudit({
				route,
				title,
				kind: request.kind,
				format: request.format,
				fileName: request.fileName,
				filterActive,
				filter,
				selection,
				policyVersion: EXPORT_POLICY_VERSION,
				appVersion: version
			});
		} catch (error) {
			throw new ExportAuditError(
				error instanceof Error && error.message === 'exportAuditLoginRequired'
					? 'exportAuditLoginRequired'
					: 'exportAuditUnavailable'
			);
		}
		return {
			id: ticket.id,
			fileName: ticket.fileName,
			async prepare(metadata) {
				try {
					await prepareExportAudit(ticket.id, metadata);
				} catch {
					throw new ExportAuditError();
				}
			},
			async complete(outcome) {
				// The immutable PREPARED record already exists before any bytes are released.
				// Retry the idempotent outcome write; never mislabel a released file as failed.
				for (let attempt = 0; attempt < 2; attempt++) {
					try {
						await completeExportAudit(ticket.id, outcome);
						return;
					} catch {
						if (attempt === 1 && ['SAVED', 'DOWNLOAD_STARTED'].includes(outcome))
							showToast(get(t)('exportAuditCompletionFailed', { id: ticket.id }));
					}
				}
			}
		};
	});
}
