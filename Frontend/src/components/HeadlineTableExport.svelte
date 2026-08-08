<script lang="ts">
	import { iconPath } from '$lib/path-utils';
	import { saveTableCsv, type TableExportProgress, type TableRow } from '$lib/table-download';
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
			showToast('Keine Tabellendaten zum Exportieren verfügbar.');
			return;
		}

		isExporting = true;
		progress = null;
		try {
			const exportFields = fields ?? Object.keys(tableData?.[0] ?? {});
			const result = await saveTableCsv({
				downloadName,
				headers,
				fields: exportFields,
				getRows: async (onProgress) => {
					if (getTableDataForExport) return getTableDataForExport(onProgress);
					if (tableData) onProgress(tableData.length, tableData.length);
					return tableData;
				},
				onProgress: (nextProgress) => (progress = nextProgress)
			});

			if (result === 'saved') showToast('CSV-Datei wurde gespeichert.');
			else if (result === 'download-started') showToast('CSV-Download wurde gestartet.');
			else if (result === 'cancelled') showToast('CSV-Export wurde abgebrochen.');
			else showToast('Keine Tabellendaten zum Exportieren verfügbar.');
		} catch (error) {
			console.error('CSV export failed', error);
			showToast('CSV-Export fehlgeschlagen. Bitte erneut versuchen.');
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
