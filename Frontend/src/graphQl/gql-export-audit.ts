import { dataUrl, graphqlFetch } from './gql-url';

export type ExportAuditKind = 'TABLE' | 'CHART' | 'FILTER';
export type ExportAuditFormat = 'CSV' | 'PNG' | 'JSON';
export type ExportAuditOutcome = 'SAVED' | 'DOWNLOAD_STARTED' | 'CANCELLED' | 'FAILED';
export type ExportAuditStatus = 'CREATED' | 'PREPARED' | ExportAuditOutcome;
export type ExportAuditTicket = { id: string; fileName: string; createdAt: number };
export type ExportAuditInput = {
	route: string;
	title: string;
	kind: ExportAuditKind;
	format: ExportAuditFormat;
	fileName: string;
	filterActive: boolean;
	filter: string | null;
	selection: string;
	policyVersion: string;
	appVersion: string;
};
export type ExportAuditRecord = ExportAuditTicket & {
	preparedAt: number | null;
	completedAt: number | null;
	userId: string;
	userRole: string;
	anonymousDemo: boolean;
	kind: ExportAuditKind;
	format: ExportAuditFormat;
	route: string;
	title: string;
	filterActive: boolean;
	filter: string | null;
	mandatoryFilter: string | null;
	effectiveFilter: string | null;
	selection: string | null;
	policyVersion: string;
	appVersion: string;
	sizeBytes: number | null;
	sha256: string | null;
	rowCount: number | null;
	status: ExportAuditStatus;
	metadataSource: string;
};

async function auditQuery<T>(query: string, variables: Record<string, unknown>): Promise<T> {
	const response = await graphqlFetch(dataUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ query, variables })
	});
	if (response.status === 401) throw new Error('exportAuditLoginRequired');
	if (!response.ok) throw new Error('Export audit request failed');
	const result = await response.json();
	if (
		result.errors?.some(
			(error: { extensions?: { code?: string } }) => error.extensions?.code === 'UNAUTHENTICATED'
		)
	)
		throw new Error('exportAuditLoginRequired');
	if (result.errors?.length || !result.data) throw new Error('Export audit request failed');
	return result.data;
}

export async function createExportAudit(input: ExportAuditInput): Promise<ExportAuditTicket> {
	const result = await auditQuery<{ createExportAudit: ExportAuditTicket }>(
		`mutation createExportAudit($input: ExportAuditInput!) {
			createExportAudit(input: $input) { id fileName createdAt }
		}`,
		{ input }
	);
	if (!result.createExportAudit?.id || !result.createExportAudit.fileName)
		throw new Error('Export audit was not acknowledged');
	return result.createExportAudit;
}

export async function prepareExportAudit(
	id: string,
	metadata: { sizeBytes: number; sha256: string; rowCount?: number }
): Promise<void> {
	const result = await auditQuery<{ prepareExportAudit: boolean }>(
		`mutation prepareExportAudit($id: ID!, $sizeBytes: Float!, $sha256: String!, $rowCount: Int) {
			prepareExportAudit(id: $id, sizeBytes: $sizeBytes, sha256: $sha256, rowCount: $rowCount)
		}`,
		{ id, ...metadata }
	);
	if (result.prepareExportAudit !== true) throw new Error('Export audit was not acknowledged');
}

export async function completeExportAudit(id: string, outcome: ExportAuditOutcome): Promise<void> {
	const result = await auditQuery<{ completeExportAudit: boolean }>(
		`mutation completeExportAudit($id: ID!, $outcome: ExportAuditOutcome!) {
			completeExportAudit(id: $id, outcome: $outcome)
		}`,
		{ id, outcome }
	);
	if (result.completeExportAudit !== true) throw new Error('Export audit was not acknowledged');
}

export async function getExportAudits(
	options: { search?: string; offset?: number; limit?: number } = {}
): Promise<{ total: number; records: ExportAuditRecord[] }> {
	const result = await auditQuery<{
		getExportAudits: { total: number; records: ExportAuditRecord[] };
	}>(
		`query getExportAudits($search: String, $offset: Int, $limit: Int) {
			getExportAudits(search: $search, offset: $offset, limit: $limit) {
				total records {
					id fileName createdAt preparedAt completedAt userId userRole anonymousDemo
					kind format route title filterActive filter mandatoryFilter effectiveFilter selection
					policyVersion appVersion sizeBytes sha256 rowCount status metadataSource
				}
			}
		}`,
		{ offset: 0, limit: 50, ...options }
	);
	return result.getExportAudits;
}
