<script lang="ts">
	import { createTable, changeRowCount } from '../tableBuilder';
	import { createEventDispatcher, onMount, tick } from 'svelte';
	import Headline from '../components/Headline.svelte';
	import { variantStore } from '../store/variantStore.js';
	import type { LensDataPasser } from '@samply/lens';
	import { filterActiveStore } from '../store/filterActiveStore.js';
	import { addUserFilter } from '../components/UserFilter';
	import { t, locale, locales } from '../store/languageStore';
	import { buildTableHeaders, filterColumnsForImportMode } from '../tableColumnVariants';
	import { calculateTableShownRows } from '../tableRows';
	import {
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
	let tableShownRowsMax: number;

	if (tableIdName.includes('patientCohort')) tableShownRowsMax = 19;
	else tableShownRowsMax = 20;

	let tooltip = '<p><b>' + headlineTitle + '</b><hr></p>';

	let genericTable: any;
	let tableContainer: HTMLDivElement;

	function handleMaximized(event: any) {
		maxStoreValue = event.detail.headlineMaximize;
		maximize();
		setTimeout(() => {
			if (maxStoreValue) {
				changeRowCount(genericTable, tableShownRowsMax);
			} else {
				changeRowCount(genericTable, tableShownRows);
			}
		}, 0);
	}

	const dispatch = createEventDispatcher();
	function maximize() {
		maxStoreValue = !maxStoreValue;
		dispatch('maximized', { maxStoreValue });
	}

	$: headers = buildTableHeaders(columns);

	//console.log("headers", headers);

	let tableData: any[] = [];
	const totalCountCache = new Map<string, number>();
	const filteredCountCache = new Map<string, number>();

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

	onMount(async () => {
		await import('@samply/lens');
		tableIdName = 'generic_' + tableIdName;
		await tick();
		//console.log("table ID", tableIdName);

		columns = filterColumnsForImportMode(columns, importMode);
		await tick();

		calculateTooltip();

		const tablePanel = tableContainer.closest(
			'div[class*="table"][class*="box_level2"], .box_level2'
		);
		tableShownRows = calculateTableShownRows({
			panelHeight: tablePanel instanceof HTMLElement ? tablePanel.clientHeight : undefined,
			hasNavbar: tablePanel?.querySelector('.navbar') != null,
			fallbackRows: 10
		});

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

	function stringifyArray(remainingData: any) {
		remainingData.forEach((element: { complication: any; substance: any[]; ops: any[] }) => {
			if (element.complication || element.substance || element.ops) {
				if (element.complication) {
					let complicationString = element.complication
						.reduce((acc: string, currentValue: any) => {
							acc += currentValue.complication;
							acc += currentValue.grade ? ':' + currentValue.grade : '';
							acc += ', ';
							return acc;
						}, '')
						.slice(0, -2); //Schneidet das hintere Komma und Leerzeichen weg
					element.complication = complicationString;
				} else if (element.substance) {
					let substanceString = element.substance
						.reduce((acc: string, currentValue: any) => {
							acc += currentValue.substance + ', ';
							return acc;
						}, '')
						.slice(0, -2); //Schneidet das hintere Komma und Leerzeichen weg
					element.substance = substanceString;
				} else if (element.ops) {
					let opsString = element.ops
						.reduce((acc: string, currentValue: any) => {
							acc += currentValue.ops + ', ';
							return acc;
						}, '')
						.slice(0, -2); //Schneidet das hintere Komma und Leerzeichen weg
					element.ops = opsString;
				}
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
	headlineInputTableHeader={headers}
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
</style>
