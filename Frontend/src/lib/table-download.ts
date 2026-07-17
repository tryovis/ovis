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
	const fileName = request.downloadName.toLowerCase().endsWith('.csv')
		? request.downloadName
		: `${request.downloadName}.csv`;
	let fileHandle: FileSystemFileHandle | undefined;
	if (environment.requestSaveFile) {
		try {
			fileHandle = await environment.requestSaveFile(fileName);
		} catch (error) {
			if (isDomExceptionNamed(error, 'AbortError')) return 'cancelled';
			if (!isDomExceptionNamed(error, 'SecurityError')) throw error;
		}
	}

	const tableData = await request.getRows((current, total) =>
		request.onProgress({ phase: 'fetching', current, total })
	);
	if (!tableData) return 'empty';

	const writable = fileHandle ? await fileHandle.createWritable() : undefined;
	const blobParts: BlobPart[] = [];
	try {
		for (const chunk of createCsvChunks(request.headers, request.fields, tableData)) {
			if (writable) await writable.write(chunk.content);
			else blobParts.push(chunk.content);
			request.onProgress({
				phase: 'writing',
				current: chunk.processedRows,
				total: tableData.length
			});
			await environment.yieldControl();
		}
		if (writable) await writable.close();
	} catch (error) {
		if (writable) await writable.abort(error);
		throw error;
	}

	if (writable) return 'saved';

	const blob = new Blob(blobParts, { type: CSV_MIME_TYPE });
	const objectUrl = environment.createObjectUrl(blob);
	const link = environment.document.createElement('a');
	link.href = objectUrl;
	link.download = fileName;
	link.style.display = 'none';
	let linkAppended = false;
	try {
		environment.document.body.appendChild(link);
		linkAppended = true;
		link.click();
	} finally {
		if (linkAppended) environment.document.body.removeChild(link);
		environment.scheduleCleanup(() => environment.revokeObjectUrl(objectUrl));
	}
	return 'download-started';
}
