<script lang="ts">
	import { iconPath } from '$lib/path-utils';
	import { saveTableCsv, type TableExportProgress, type TableRow } from '$lib/table-download';
	import type { ExportContext } from '$lib/export-context';
	import { ExportAuditError } from '$lib/export-workflow';
	import { showViewportTooltip } from '$lib/tooltip-popover';
	import { locale, t } from '../store/languageStore';
	import { showToast } from '../store/toastStore';

	export let downloadName: string;
	export let tableData: readonly TableRow[] | null = null;
	export let getTableDataForExport:
		| ((
				onProgress: (loadedRows: number, expectedRows: number) => void
		  ) => Promise<readonly TableRow[]>)
		| null = null;
	export let headers: readonly string[] | null = null;
	export let fields: readonly string[] | null = null;
	export let exportDisabled = false;
	export let context: ExportContext | undefined = undefined;
	export let getExportContext: (() => ExportContext | Promise<ExportContext>) | null = null;

	const downloadIcon = iconPath('download-icon.svg');
	const loadingIcon = iconPath('spinner.svg');
	let isExporting = false;
	let progress: TableExportProgress | null = null;
	let tooltipPosition = '';

	const handleMouseEnter = (event: MouseEvent) => {
		tooltipPosition = showViewportTooltip(event);
	};

	$: progressText = progress
		? `${progress.current.toLocaleString($locale)} / ${progress.total.toLocaleString($locale)} ${$t(
				'rows'
		  )}`
		: '';

	async function exportTable() {
		if (isExporting || exportDisabled) return;
		if (!headers) {
			showToast($t('exportNoPreview'));
			return;
		}

		isExporting = true;
		progress = null;
		try {
			const currentRows = tableData ? structuredClone(tableData) : null;
			const loadRows = getTableDataForExport;
			const currentHeaders = [...headers];
			const currentName = downloadName;
			const exportFields = [...(fields ?? Object.keys(currentRows?.[0] ?? {}))];
			const exportContext = JSON.parse(JSON.stringify((getExportContext ? await getExportContext() : context) ?? {}));
			const result = await saveTableCsv({
				downloadName: currentName,
				headers: currentHeaders,
				fields: exportFields,
				context: exportContext,
				getRows: async (onProgress) => {
					if (loadRows) return loadRows(onProgress);
					if (currentRows) onProgress(currentRows.length, currentRows.length);
					return currentRows;
				},
				onProgress: (nextProgress) => (progress = nextProgress)
			});

			if (result === 'saved' || result === 'download-started') showToast($t('exportCsvCreated'));
			else if (result === 'empty') showToast($t('exportNoPreview'));
		} catch (error) {
			console.error('CSV export failed', error);
			showToast($t(error instanceof ExportAuditError ? error.message : 'exportErrorSave'));
		} finally {
			isExporting = false;
			progress = null;
		}
	}
</script>

<div class="table-export">
	{#if isExporting && progress}
		<span class="export-progress" role="status" aria-live="polite">
			{progressText}
		</span>
	{/if}
	<button
		class="iconRoundButton"
		class:tooltip={!isExporting}
		type="button"
		disabled={isExporting || exportDisabled}
		aria-busy={isExporting}
		aria-label={isExporting ? 'CSV-Export läuft' : 'CSV-Datei herunterladen'}
		on:mouseenter={handleMouseEnter}
		on:click={exportTable}
	>
		{#if !isExporting}<span class="tooltiptext" style={tooltipPosition}>Download CSV-Datei</span
			>{/if}
		<img
			src={isExporting ? loadingIcon : downloadIcon}
			alt=""
			class:export-spinner={isExporting}
			class="iconRound"
		/>
	</button>
</div>

<style>
	.table-export {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		vertical-align: middle;
	}

	.export-progress {
		max-width: 15rem;
		color: var(--text-color);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	button:disabled {
		cursor: wait;
		opacity: 0.75;
	}

	.export-spinner {
		animation: spin 1s infinite linear;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
