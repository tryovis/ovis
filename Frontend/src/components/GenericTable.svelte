<script lang="ts">
	import { createTable, changeRowCount } from '../tableBuilder';
	import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
	import Headline from '../components/Headline.svelte';
	import { variantStore } from '../store/variantStore.js';
	import type { LensDataPasser } from '@samply/lens';
	import { filterActiveStore } from '../store/filterActiveStore.js';
	import { addUserFilter } from '../components/UserFilter';
	import { t, locale, locales } from '../store/languageStore';
	import { buildTableHeaders, filterColumnsForImportMode } from '../tableColumnVariants';
	import { calculateTableShownRowsForContainer, getTablePanel } from '../tableRows';
	import {
		fetchAllTableRows,
		fetchTableRows,
		getTableCount,
		type TablePage,
		type TablePageRequest
	} from '../graphQl/table-page';

	let filterActive = true;
	// Abonnieren des filterActiveStore und den Wert aktualisieren
	filterActiveStore.subscribe((value) => {
		filterActive = value.filterActive; // Hier den Wert direkt zuweisen
	});
	let filter = JSON.stringify({ operand: 'OR', children: [] });

	let importMode: string | undefined;
	variantStore.subscribe((value: any) => {
		({ importMode } = value);
	});

	export let columns: any;
	export let collection: string;
	export let countCollection: string | undefined = undefined;
	export let getTableData: any;
	export let sortingIndex: number;
	export let tableIdName: string;
	export let headlineTitle: string;
	export let loadingActive: boolean;
	export let maxStoreValue: boolean;
	let dataPasser: LensDataPasser;

	let loading: boolean = true;
	let isPaused: boolean = false;
	let loadingComplete: boolean = true;

	let tableShownRows: number = 0;
	let tableShownRowsNormalMax: number;
	const tableShownRowsMax = 50;

	if (tableIdName.includes('patientCohort')) tableShownRowsNormalMax = 19;
	else tableShownRowsNormalMax = 20;

	let tooltip = '<p><b>' + headlineTitle + '</b><hr></p>';

	let genericTable: any;
	let tableContainer: HTMLDivElement;
	let resizeObserver: ResizeObserver | undefined;
	let tableFitFrame: number | undefined;
	const tableFontSizes = [13, 12, 11, 10];
	const mobileTableFontSizes = [13, 12, 11, 10, 9, 8];

	function usesMobileLandscapeLayout(): boolean {
		return (
			typeof document !== 'undefined' &&
			document.documentElement.dataset.ovisMobileLayout === 'landscape'
		);
	}

	function fitTableToContainer() {
		if (!tableContainer) return;

		const table = tableContainer.querySelector('table');
		if (!table) return;

		const availableWidth = tableContainer.clientWidth;
		if (availableWidth <= 0) return;

		const availableFontSizes = usesMobileLandscapeLayout()
			? mobileTableFontSizes
			: tableFontSizes;
		let selectedFontSize = availableFontSizes[availableFontSizes.length - 1];
		for (const fontSize of availableFontSizes) {
			tableContainer.style.setProperty('--generic-table-font-size', `${fontSize}px`);
			// Reading scrollWidth forces layout after changing the font size.
			const requiredWidth = Math.max(table.scrollWidth, tableContainer.scrollWidth);
			selectedFontSize = fontSize;
			if (requiredWidth <= availableWidth + 1) break;
		}

		tableContainer.style.setProperty('--generic-table-font-size', `${selectedFontSize}px`);
		const stillOverflows = Math.max(table.scrollWidth, tableContainer.scrollWidth) > availableWidth + 1;
		tableContainer.classList.toggle('table-overflowing', stillOverflows);

		const renderedRow = table.querySelector('tbody tr td:not([colspan])')?.closest('tr');
		const renderedRowHeight = renderedRow?.getBoundingClientRect().height;
		if (renderedRowHeight) {
			applyCurrentTableShownRows(renderedRowHeight);
		}
	}

	function scheduleTableFit() {
		if (tableFitFrame != null) cancelAnimationFrame(tableFitFrame);
		tableFitFrame = requestAnimationFrame(() => {
			tableFitFrame = requestAnimationFrame(fitTableToContainer);
		});
	}

	function handleMaximized(event: any) {
		maxStoreValue = event.detail.headlineMaximize;
		maximize();
		setTimeout(scheduleTableFit, 0);
	}

	const dispatch = createEventDispatcher();
	function maximize() {
		maxStoreValue = !maxStoreValue;
		dispatch('maximized', { maxStoreValue });
	}

	$: headers = buildTableHeaders(columns);
	$: exportFields = ['_id', ...columns.map((column: { data?: string }) => column.data ?? '')];

	//console.log("headers", headers);

	let tableData: any[] = [];
	let activePageRequest: TablePageRequest | null = null;
	const totalCountCache = new Map<string, number>();
	const filteredCountCache = new Map<string, number>();

	function calculateMobileShownRows(rowHeight: number): number | undefined {
		if (!usesMobileLandscapeLayout() || rowHeight <= 0) return undefined;

		const tablePanel = getTablePanel(tableContainer);
		const tableBody = tableContainer.querySelector('tbody');
		if (!tablePanel || !tableBody) return undefined;

		const panelRect = tablePanel.getBoundingClientRect();
		const bodyRect = tableBody.getBoundingClientRect();
		const controls = Array.from(
			tableContainer.querySelectorAll<HTMLElement>('.dataTables_info, .dataTables_paginate')
		)
			.map((element) => element.getBoundingClientRect())
			.filter((rect) => rect.height > 0);

		const controlsHeight = controls.length
			? Math.max(...controls.map((rect) => rect.bottom)) -
				Math.min(...controls.map((rect) => rect.top))
			: 0;
		const panelPaddingBottom = Number.parseFloat(getComputedStyle(tablePanel).paddingBottom) || 0;
		const horizontalScrollbarHeight = Math.max(
			0,
			tableContainer.offsetHeight - tableContainer.clientHeight
		);
		const availableRowsHeight =
			panelRect.bottom -
			panelPaddingBottom -
			bodyRect.top -
			controlsHeight -
			horizontalScrollbarHeight -
			6;

		return Math.max(1, Math.floor(availableRowsHeight / rowHeight));
	}

	function calculateCurrentTableShownRows(rowHeight = 32): number {
		const measuredMobileRows = calculateMobileShownRows(rowHeight);
		const rowLimit =
			maxStoreValue || usesMobileLandscapeLayout()
				? tableShownRowsMax
				: tableShownRowsNormalMax;
		return Math.min(
			rowLimit,
			measuredMobileRows ?? calculateTableShownRowsForContainer(tableContainer, 10, rowHeight)
		);
	}

	function applyCurrentTableShownRows(rowHeight = 32) {
		const nextTableShownRows = calculateCurrentTableShownRows(rowHeight);
		if (nextTableShownRows === tableShownRows) return;

		tableShownRows = nextTableShownRows;
		if (genericTable) changeRowCount(genericTable, tableShownRows);
	}

	async function getActiveFilter() {
		if (filterActive) {
			filter = JSON.stringify(dataPasser.getAstAPI());
		} else {
			filter = JSON.stringify({ operand: 'OR', children: [] });
		}
		return JSON.stringify(await addUserFilter(JSON.parse(filter)));
	}

	function prepareTableRows(rows: any[]) {
		stringifyArray(rows);

		columns.forEach((column: { numOfObj: boolean; data: string }) => {
			if (
				column.numOfObj &&
				rows[0] &&
				column.data in rows[0] &&
				Array.isArray(rows[0][column.data])
			) {
				rows = rows.map((data) => ({
					...data,
					[column.data]: data[column.data].length
				}));
			}
		});

		return rows;
	}

	async function fetchServerPage(request: TablePageRequest): Promise<TablePage<any>> {
		activePageRequest = request;
		loading = loadingActive;
		loadingComplete = false;
		const activeFilter = await getActiveFilter();
		const rows = prepareTableRows(await fetchTableRows(getTableData, request, activeFilter));
		const countTarget = countCollection ?? collection;
		const totalCacheKey = activeFilter;
		let total = totalCountCache.get(totalCacheKey);
		if (total == null) {
			total = await getTableCount(countTarget, activeFilter, []);
			totalCountCache.set(totalCacheKey, total);
		}

		let filtered = total;
		if (request.columnFilters.length > 0) {
			const filteredCacheKey = `${activeFilter}:${JSON.stringify(request.columnFilters)}`;
			const cachedFiltered = filteredCountCache.get(filteredCacheKey);
			if (cachedFiltered == null) {
				filtered = await getTableCount(countTarget, activeFilter, request.columnFilters);
				filteredCountCache.set(filteredCacheKey, filtered);
			} else {
				filtered = cachedFiltered;
			}
		}

		tableData = rows;
		loading = false;
		loadingComplete = true;

		return {
			rows,
			total,
			filtered
		};
	}

	async function getExportTableData(
		onProgress: (loadedRows: number, expectedRows: number) => void
	): Promise<Record<string, unknown>[]> {
		if (!activePageRequest) return tableData;

		const activeFilter = await getActiveFilter();
		const countTarget = countCollection ?? collection;
		const totalRows = await getTableCount(
			countTarget,
			activeFilter,
			activePageRequest.columnFilters
		);
		const rows = await fetchAllTableRows({
			baseRequest: activePageRequest,
			totalRows,
			pageSize: 1000,
			onProgress,
			fetchPage: (request) => fetchTableRows(getTableData, request, activeFilter)
		});

		return prepareTableRows(rows);
	}

	onMount(async () => {
		await import('@samply/lens');
		tableIdName = 'generic_' + tableIdName;
		await tick();
		//console.log("table ID", tableIdName);

		columns = filterColumnsForImportMode(columns, importMode);
		await tick();

		calculateTooltip();

		tableShownRows = calculateCurrentTableShownRows();

		genericTable = createTable(
			collection,
			dataPasser,
			tableIdName,
			tableData,
			columns,
			tableShownRows,
			//truncateLength,
			sortingIndex,
			null,
			true,
			{ fetchPage: fetchServerPage }
		);
		genericTable.on('draw.dt.genericTableFit', scheduleTableFit);
		scheduleTableFit();

		const tablePanel = getTablePanel(tableContainer);
		if (tablePanel && typeof ResizeObserver !== 'undefined') {
			resizeObserver = new ResizeObserver(scheduleTableFit);
			resizeObserver.observe(tablePanel);
		}
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		if (tableFitFrame != null) cancelAnimationFrame(tableFitFrame);
		genericTable?.off('draw.dt.genericTableFit', scheduleTableFit);
	});

	function calculateTooltip() {
		columns.forEach((entry: any) => {
			if (entry.sup != null)
				// Superscript
				tooltip += entry.header + '<sup>' + entry.sup + '</sup> = ' + entry.tooltip + '<br>';
			// Füge die Tooltip-Informationen hinzu
			else tooltip += entry.header + ' = ' + entry.tooltip + '<br>'; // Füge die Tooltip-Informationen hinzu
		});
		tooltip += '<hr><p><i>' + $t('infoButton') + '</i></p>';
	}

	function stringifyArray(remainingData: any[]) {
		remainingData.forEach((element) => {
			if (element.complication) {
				element.complication = element.complication
					.map((value: any) => `${value.complication}${value.grade ? `:${value.grade}` : ''}`)
					.join(', ');
			} else if (element.substance) {
				element.substance = element.substance.map((value: any) => value.substance).join(', ');
			} else if (element.ops) {
				element.ops = element.ops.map((value: any) => value.ops).join(', ');
			}
		});
		return remainingData;
	}
</script>

<Headline
	{headlineTitle}
	headlineTooltip={tooltip}
	headlineMaximize={maxStoreValue}
	headlineShowChart={null}
	headlineIsChart={false}
	headlineInitialTop5={null}
	headlineInitialLogarithm={null}
	headlineInputTableData={tableData}
	headlineGetTableDataForExport={getExportTableData}
	headlineInputTableHeader={headers}
	headlineInputTableFields={exportFields}
	headlineChartJSElement={null}
	headlineD3Element={null}
	headlineLoading={loadingActive && loading}
	headlineIsPaused={isPaused}
	headlineLoadingComplete={loadingComplete}
	on:maximized={handleMaximized}
/>
<lens-data-passer bind:this={dataPasser} />
<div class="data">
	<div class="data-table" bind:this={tableContainer}>
		<table id={tableIdName} class="display" style="width: 100%;">
			<thead>
				<tr>
					{#each columns as column}
						{#if column.date}
							<th class="dateColumn">{column.header}</th>
						{:else if column.sup != null}
							<th>{column.header}<sup style="padding:0;margin:0;">{column.sup}</sup></th>
						{:else}
							<th>{column.header}</th>
						{/if}
					{/each}
				</tr>
			</thead>
		</table>
	</div>
</div>

<style>
	@import 'datatables.net-dt/css/jquery.dataTables.css';

	.data,
	.data-table {
		min-width: 0;
		max-width: 100%;
	}

	.data-table {
		--generic-table-font-size: 13px;
		overflow-x: auto;
		font-size: var(--generic-table-font-size);
	}

	.data-table :global(.dataTables_wrapper),
	.data-table :global(table.dataTable) {
		font-size: inherit;
	}

	.data-table :global(input) {
		min-width: 0;
		font-size: inherit;
		box-sizing: border-box;
	}
</style>
