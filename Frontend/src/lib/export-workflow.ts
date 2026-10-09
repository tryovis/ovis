import { sha256 } from '@noble/hashes/sha2.js';
import { snapshotExportContext, type ExportContext } from './export-context';
import type {
	ExportAuditFormat,
	ExportAuditKind,
	ExportAuditOutcome
} from '../graphQl/gql-export-audit';

export type ExportRequest = {
	fileName: string;
	kind: ExportAuditKind;
	format: ExportAuditFormat;
	context?: ExportContext;
};
export type ExportArtifactMetadata = { sizeBytes: number; sha256: string; rowCount?: number };
export type ExportAuditSession = {
	id: string;
	fileName: string;
	prepare: (metadata: ExportArtifactMetadata) => Promise<void>;
	complete: (outcome: ExportAuditOutcome) => Promise<void>;
};
export type ExportAuditFactory = (request: ExportRequest) => Promise<ExportAuditSession | null>;
let auditFactory: ExportAuditFactory | null = null;

export class ExportAuditError extends Error {
	constructor(
		key: 'exportAuditUnavailable' | 'exportAuditLoginRequired' = 'exportAuditUnavailable'
	) {
		super(key);
		this.name = 'ExportAuditError';
	}
}

/** Installed by the application layout; exports fail closed without the audit service. */
export function setExportAuditFactory(factory: ExportAuditFactory): () => void {
	auditFactory = factory;
	return () => {
		if (auditFactory === factory) auditFactory = null;
	};
}

export async function beginExport(
	request: ExportRequest,
	factory: ExportAuditFactory | null = auditFactory
): Promise<ExportAuditSession | null> {
	if (!factory) throw new ExportAuditError();
	return factory({ ...request, context: snapshotExportContext(request.context) });
}

export function createExportFingerprint() {
	const hasher = sha256.create();
	let sizeBytes = 0;
	return {
		update(bytes: Uint8Array) {
			sizeBytes += bytes.byteLength;
			hasher.update(bytes);
		},
		digest(): ExportArtifactMetadata {
			return {
				sizeBytes,
				sha256: Array.from(hasher.digest(), (byte) => byte.toString(16).padStart(2, '0')).join('')
			};
		}
	};
}

export type BlobDownloadEnvironment = {
	document: Document;
	createObjectUrl: (blob: Blob) => string;
	revokeObjectUrl: (url: string) => void;
	scheduleCleanup: (cleanup: () => void) => void;
	beginAudit?: ExportAuditFactory;
};

export function browserBlobDownloadEnvironment(): BlobDownloadEnvironment {
	return {
		document,
		createObjectUrl: (blob) => URL.createObjectURL(blob),
		revokeObjectUrl: (url) => URL.revokeObjectURL(url),
		scheduleCleanup: (cleanup) => setTimeout(cleanup, 60_000)
	};
}

export function triggerBlobDownload(
	blob: Blob,
	fileName: string,
	environment: BlobDownloadEnvironment
) {
	const url = environment.createObjectUrl(blob);
	const link = environment.document.createElement('a');
	link.href = url;
	link.download = fileName;
	link.style.display = 'none';
	let appended = false;
	try {
		environment.document.body.appendChild(link);
		appended = true;
		link.click();
	} finally {
		if (appended) environment.document.body.removeChild(link);
		environment.scheduleCleanup(() => environment.revokeObjectUrl(url));
	}
}

/** Confirmation + persistence precede any release of a generated file. */
export async function saveExportBlob(
	request: ExportRequest & { blob: Blob },
	environment: BlobDownloadEnvironment = browserBlobDownloadEnvironment()
): Promise<'download-started' | 'cancelled'> {
	const session = await beginExport(request, environment.beginAudit ?? auditFactory);
	if (!session) return 'cancelled';
	let released = false;
	try {
		const fingerprint = createExportFingerprint();
		const reader = request.blob.stream().getReader();
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				fingerprint.update(value);
			}
		} finally {
			reader.releaseLock();
		}
		await session.prepare(fingerprint.digest());
		triggerBlobDownload(request.blob, session.fileName, environment);
		released = true;
		await session.complete('DOWNLOAD_STARTED');
		return 'download-started';
	} catch (error) {
		if (!released) await session.complete('FAILED');
		throw error;
	}
}
