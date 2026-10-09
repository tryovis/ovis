import type { ExportContext } from './export-context';
import {
	beginExport,
	createExportFingerprint,
	triggerBlobDownload,
	type ExportAuditFactory
} from './export-workflow';

export type TableRow = Readonly<Record<string, unknown>>;

export type TableExportProgress = Readonly<{
	phase: 'fetching' | 'writing';
	current: number;
	total: number;
}>;

type TableExportRequest = Readonly<{
	downloadName: string;
	headers: readonly string[];
	fields: readonly string[];
	context?: ExportContext;
	getRows: (
		onProgress: (loadedRows: number, expectedRows: number) => void
	) => Promise<readonly TableRow[] | null>;
	onProgress: (progress: TableExportProgress) => void;
}>;

type TableDownloadEnvironment = Readonly<{
	document: Document;
	createObjectUrl: (blob: Blob) => string;
	revokeObjectUrl: (url: string) => void;
	requestSaveFile?: (fileName: string) => Promise<FileSystemFileHandle>;
	scheduleCleanup: (cleanup: () => void) => void;
	yieldControl: () => Promise<void>;
	beginAudit?: ExportAuditFactory;
}>;

type CsvChunk = Readonly<{
	content: string;
	processedRows: number;
}>;

export type TableDownloadResult = 'saved' | 'download-started' | 'cancelled' | 'empty';

const CSV_MIME_TYPE = 'text/csv;charset=utf-8';
const CSV_ROWS_PER_CHUNK = 1000;

function flattenObject(value: object, parentKey = ''): Record<string, unknown> {
	return Object.entries(value).reduce<Record<string, unknown>>((flattened, [key, nestedValue]) => {
		const nextKey = parentKey ? `${parentKey}.${key}` : key;
		if (typeof nestedValue === 'object' && nestedValue !== null) {
			return { ...flattened, ...flattenObject(nestedValue, nextKey) };
		}
		return { ...flattened, [nextKey]: nestedValue ?? '' };
	}, {});
}

function startsSpreadsheetFormula(text: string): boolean {
	let index = 0;
	while (index < text.length && text.charCodeAt(index) <= 0x20) index += 1;
	const firstContentCharacter = text[index];
	return firstContentCharacter != null && '=+-@'.includes(firstContentCharacter);
}

function escapeCsvValue(value: unknown): string {
	let text = String(value ?? '');
	if (typeof value === 'string' && startsSpreadsheetFormula(text)) text = `'${text}`;
	if (/[;"\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
	return text;
}

function serializeCsvRow(row: TableRow, fields: readonly string[]): string {
	const flattened = flattenObject(row);
	return fields.map((field) => escapeCsvValue(flattened[field])).join(';');
}

function* createCsvChunks(
	headers: readonly string[],
	fields: readonly string[],
	tableData: readonly TableRow[]
): Generator<CsvChunk> {
	yield { content: `\uFEFF${headers.map(escapeCsvValue).join(';')}`, processedRows: 0 };
	for (let start = 0; start < tableData.length; start += CSV_ROWS_PER_CHUNK) {
		const end = Math.min(start + CSV_ROWS_PER_CHUNK, tableData.length);
		const content = tableData
			.slice(start, end)
			.map((row) => serializeCsvRow(row, fields))
			.join('\n');
		yield { content: `\n${content}`, processedRows: end };
	}
}

export function serializeTableCsv(
	headers: readonly string[],
	tableData: readonly TableRow[],
	fields: readonly string[] = tableData[0] ? Object.keys(flattenObject(tableData[0])) : []
): string {
	return [
		headers.map(escapeCsvValue).join(';'),
		...tableData.map((row) => serializeCsvRow(row, fields))
	].join('\n');
}

function isDomExceptionNamed(error: unknown, name: string): boolean {
	return error instanceof DOMException && error.name === name;
}

function browserDownloadEnvironment(): TableDownloadEnvironment {
	const picker = window.isSecureContext ? window.showSaveFilePicker : undefined;
	return {
		document,
		createObjectUrl: (blob) => URL.createObjectURL(blob),
		revokeObjectUrl: (url) => URL.revokeObjectURL(url),
		requestSaveFile: picker
			? (fileName) =>
					picker.call(window, {
						suggestedName: fileName,
						types: [
							{
								description: 'CSV-Datei',
								accept: { 'text/csv': ['.csv'] }
							}
						]
					})
			: undefined,
		scheduleCleanup: (cleanup) => setTimeout(cleanup, 60_000),
		yieldControl: () => new Promise((resolve) => setTimeout(resolve, 0))
	};
}

export async function saveTableCsv(
	request: TableExportRequest,
	environment: TableDownloadEnvironment = browserDownloadEnvironment()
): Promise<TableDownloadResult> {
	const originalFileName = request.downloadName.toLowerCase().endsWith('.csv')
		? request.downloadName
		: `${request.downloadName}.csv`;
	const session = await beginExport(
		{
			fileName: originalFileName,
			kind: 'TABLE',
			format: 'CSV',
			context: {
				...request.context,
				selection: {
					...request.context?.selection,
					fields: [...request.fields],
					headers: [...request.headers]
				}
			}
		},
		environment.beginAudit
	);
	if (!session) return 'cancelled';
	const fileName = session.fileName;
	let fileHandle: FileSystemFileHandle | undefined;
	let writable: FileSystemWritableFileStream | undefined;
	let released = false;
	try {
		if (environment.requestSaveFile) {
			try {
				fileHandle = await environment.requestSaveFile(fileName);
			} catch (error) {
				if (isDomExceptionNamed(error, 'AbortError')) {
					await session.complete('CANCELLED');
					return 'cancelled';
				}
				// Confirmation can consume transient activation; retain the audited Blob fallback.
				if (!isDomExceptionNamed(error, 'SecurityError')) throw error;
			}
		}
		const tableData = await request.getRows((current, total) =>
			request.onProgress({ phase: 'fetching', current, total })
		);
		if (!tableData) {
			await session.complete('CANCELLED');
			return 'empty';
		}
		// Fingerprint exact UTF-8 bytes, including BOM, without a second whole CSV in memory.
		// Persist before writing any patient data to the destination.
		const encoder = new TextEncoder();
		const fingerprint = createExportFingerprint();
		for (const chunk of createCsvChunks(request.headers, request.fields, tableData)) {
			fingerprint.update(encoder.encode(chunk.content));
			await environment.yieldControl();
		}
		const metadata = { ...fingerprint.digest(), rowCount: tableData.length };
		await session.prepare(metadata);
		writable = fileHandle ? await fileHandle.createWritable() : undefined;
		const blobParts: BlobPart[] = [];
		const writtenFingerprint = createExportFingerprint();
		for (const chunk of createCsvChunks(request.headers, request.fields, tableData)) {
			writtenFingerprint.update(encoder.encode(chunk.content));
			if (writable) await writable.write(chunk.content);
			else blobParts.push(chunk.content);
			request.onProgress({
				phase: 'writing',
				current: chunk.processedRows,
				total: tableData.length
			});
			await environment.yieldControl();
		}
		if (writtenFingerprint.digest().sha256 !== metadata.sha256)
			throw new Error('Export data changed during serialization');
		if (writable) {
			await writable.close();
			released = true;
			await session.complete('SAVED');
			return 'saved';
		}
		triggerBlobDownload(new Blob(blobParts, { type: CSV_MIME_TYPE }), fileName, environment);
		released = true;
		await session.complete('DOWNLOAD_STARTED');
		return 'download-started';
	} catch (error) {
		if (!released) {
			try {
				if (writable) await writable.abort(error);
			} finally {
				await session.complete('FAILED');
			}
		}
		throw error;
	}
}
