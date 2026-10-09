/** Snapshot of the scope used to produce the exported data, not the current UI after a dialog. */
export type ExportContext = Readonly<{
	title?: string;
	filterActive?: boolean;
	filter?: string | null;
	selection?: Record<string, unknown>;
}>;

export function snapshotExportContext(context: ExportContext = {}): ExportContext {
	return JSON.parse(JSON.stringify(context));
}
