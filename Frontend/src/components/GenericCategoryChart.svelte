<script lang="ts">
	import { Chart, registerables } from 'chart.js';
	import type { ChartConfiguration } from 'chart.js';
	import type { LensDataPasser } from '@samply/lens';
	import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
	import { get } from 'svelte/store';
	import { createTable, changeRowCount } from '../tableBuilder';
	import { addUserFilter } from './UserFilter';
	import ChartStatusLine from './ChartStatusLine.svelte';
	import Headline from './Headline.svelte';
	import { prepareCategoryChart } from './categoryChartModel.js';
	import { getCategoryChart } from '../graphQl/gql-generic';
	import { createLatestRequest } from '../lib/latestRequest.js';
	import { iconPath } from '$lib/path-utils';
	import { filterActiveStore } from '../store/filterActiveStore.js';
	import { t } from '../store/languageStore';
	import { reloadOnly } from '../store/reloadStore';
	import { userStore } from '../store/userStore';
	import { appendQueryItemToFirstGroup } from '../tableFilterItems';

	const emptyIcon = iconPath('null-off.svg');
	type LegendPosition = 'top' | 'left' | 'bottom' | 'right' | 'center' | 'chartArea';
	type ChartType = { label: string[]; count: number[] };

	export let aspectRatioMin: number;
	export let collection: string;
	export let dropdownObject: { label: string; value: string }[];
	export let headlineTitle: string;
	export let headlineTooltip: string;
	export let initialDropdownValue: string;
	export let legendPosition: LegendPosition;
	export let tableShownRowsMin: number;
	export let truncateLengthMin: number | null = null;
	export let maxStoreValue = false;
	export let showChartStoreValue = true;
	export let showTop5StoreValue = false;
	export let showNullStoreValue = false;
	export let showLogarithmStoreValue = false;

	let filterActive = true;
	let colorPalette: string[] = [];
	let initialDropdownLabel = '';
	let chartTable: import('datatables.net').Api<unknown> | null = null;
	let chartTableName = collection + 'Table';
	let aspectRatio = aspectRatioMin;
	let tableShownRows = tableShownRowsMin;
	let inputArray: ChartType = { label: [], count: [] };
	let rawInputArray: ChartType = { label: [], count: [] };
	let statusReady = false;
	let statusShownCategories = 0;
	let statusTotalCategories = 0;
	let statusMissingValueCount = 0;
	let pieChart: HTMLCanvasElement;
	let chartInstance: Chart | null = null;
	let chartResizeFrame: number | null = null;
	let dataPasser: LensDataPasser;
	let isMounted = false;
	let destroyed = false;
	let requestedDataKey: string | null = null;
	let tableRenderKey: string | null = null;
	let dataVersion = 0;
	let tableData: Array<Record<string, string | number>> = [];
	let reversedTableData: Array<Record<string, string | number>> = [];
	let columns = [{ data: initialDropdownValue }, { data: 'count' }];
	let headers: string[] = [];
	let filter = JSON.stringify({ operand: 'OR', children: [] });
	let showEmptyIcon = false;
	let resizeTimer: ReturnType<typeof setTimeout> | null = null;
	const aspectRatioMax = 2.2;
	const tableShownRowsMax = 20;
	const sortingIndex = 1;
	const categoryRequest = createLatestRequest();
	const dispatch = createEventDispatcher();

	const unsubscribeFilterActive = filterActiveStore.subscribe((value) => {
		filterActive = value.filterActive;
	});
	const unsubscribeUser = userStore.subscribe(
		(value: { primaryColor: string; colorPalette: string[] }) => {
			colorPalette = value.colorPalette;
			if (isMounted) renderCategoryChart();
		}
	);

	Chart.register(...registerables);

	onMount(async () => {
		await import('@samply/lens');
		await customElements.whenDefined('lens-data-passer');
		await tick();
		if (destroyed) return;
		isMounted = true;
	});

	$: if (isMounted && dataPasser && pieChart) {
		const dataKey = `${collection}:${initialDropdownValue}`;
		if (dataKey !== requestedDataKey) void loadCategoryData(dataKey);
	}

	async function loadCategoryData(dataKey: string) {
		const request = categoryRequest.start();
		const selectedValue = initialDropdownValue;
		const selectedCollection = collection;
		requestedDataKey = dataKey;
		statusReady = false;
		showEmptyIcon = false;

		try {
			filter = filterActive
				? JSON.stringify(dataPasser.getAstAPI())
				: JSON.stringify({ operand: 'OR', children: [] });
			filter = JSON.stringify(await addUserFilter(JSON.parse(filter)));
			const result = await getCategoryChart(selectedValue, selectedCollection, filter);
			if (!categoryRequest.isCurrent(request)) return;

			rawInputArray = {
				label: Array.isArray(result?.label) ? [...result.label] : [],
				count: Array.isArray(result?.count) ? [...result.count] : []
			};
			dataVersion += 1;
			getSelectedLabel(selectedValue);
			renderCategoryChart();
		} catch (error) {
			if (!categoryRequest.isCurrent(request)) return;
			requestedDataKey = null;
			showEmptyIcon = true;
			statusReady = true;
			console.error('Error while loading the category chart:', error);
		}
	}

	function renderCategoryChart() {
		if (!isMounted || destroyed || !pieChart || dataVersion === 0) return;

		const prepared = prepareCategoryChart(rawInputArray, {
			showNull: showNullStoreValue,
			showTop5: showTop5StoreValue
		});
		const fullInput = prepared.full;
		inputArray = prepared.chart;
		statusMissingValueCount = prepared.missingValueCount;
		statusTotalCategories = fullInput.label.length;
		statusShownCategories = Math.min(
			showTop5StoreValue ? 5 : fullInput.label.length,
			fullInput.label.length
		);
		statusReady = true;
		showEmptyIcon = inputArray.label.length === 0;
		tableData = fullInput.label.map((label, index) => ({
			[initialDropdownValue]: label,
			count: fullInput.count[index]
		}));
		reversedTableData = [...tableData];
		columns = [{ data: initialDropdownValue }, { data: 'count' }];
		renderCategoryTable();

		chartInstance?.destroy();
		chartInstance = null;
		if (showEmptyIcon) return;
		const ctx = pieChart.getContext('2d');
		if (!ctx) return;

		const transformedData = inputArray.label.map((label, index) => ({
			label,
			count: parseFloat(Math.log(inputArray.count[index]).toFixed(2)),
			originalCount: inputArray.count[index]
		}));
		const chartConfig: ChartConfiguration = {
			type: 'pie',
			data: {
				labels: transformedData.map((item) => item.label),
				datasets: [
					{
						data: showLogarithmStoreValue
							? transformedData.map((item) => item.count)
							: inputArray.count,
						backgroundColor: colorPalette
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				aspectRatio,
				layout: { padding: { bottom: 8 } },
				plugins: {
					legend: {
						display: true,
						position: legendPosition,
						labels: { boxWidth: 20, boxHeight: 8, padding: 8, font: { size: 10 } }
					},
					tooltip: {
						callbacks: {
							label: (context) => {
								const dataItem = transformedData[context.dataIndex];
								const logarithmTooltip = showLogarithmStoreValue ? ` (log: ${dataItem.count})` : '';
								return ` ${get(t)('count')}: ${dataItem.originalCount}${logarithmTooltip}`;
							}
						}
					}
				},
				onClick: (_event, elements) => {
					if (elements.length === 0) return;
					const label = chartConfig.data.labels?.[elements[0].index];
					if (typeof label !== 'string') return;

					if (label === 'Sonstige') {
						fullInput.label
							.map((entry, index) => ({ label: entry, count: fullInput.count[index] }))
							.sort((left, right) => right.count - left.count)
							.slice(0, 5)
							.forEach((item) => addItem('!' + initialDropdownValue, 'NEQUALS', item.label));
					} else {
						addItem(initialDropdownValue, 'EQUALS', label === '-' ? null : label);
					}
					reloadOnly();
				}
			}
		};
		chartInstance = new Chart(ctx, chartConfig);
		if (chartResizeFrame != null) cancelAnimationFrame(chartResizeFrame);
		chartResizeFrame = requestAnimationFrame(() => chartInstance?.resize());
	}

	function renderCategoryTable() {
		const nextTableRenderKey = `${dataVersion}:${initialDropdownValue}:${showNullStoreValue}:${truncateLengthMin ?? ''}`;
		if (nextTableRenderKey === tableRenderKey) return;
		tableRenderKey = nextTableRenderKey;
		chartTable?.destroy();
		chartTable = null;
		if (tableData.length === 0) return;
		chartTable = createTable(
			collection,
			dataPasser,
			chartTableName,
			tableData,
			columns,
			tableShownRows,
			sortingIndex
		);
	}

	function addItem(key: string, type: string, value: string | null): void {
		const nextQuery = appendQueryItemToFirstGroup(dataPasser.getQueryAPI(), {
			id: '-',
			key,
			name: `${collection}:${key}:${type}`,
			type,
			system: collection,
			values: [{ name: String(value ?? ''), value, queryBindId: '-' }]
		});
		dataPasser.setQueryStoreAPI(nextQuery as Parameters<LensDataPasser['setQueryStoreAPI']>[0]);
	}

	function handleMaximized(event: { detail: { headlineMaximize: boolean } }) {
		maxStoreValue = event.detail.headlineMaximize;
		maximize();
		if (resizeTimer) clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			if (destroyed) return;
			aspectRatio = maxStoreValue ? aspectRatioMax : aspectRatioMin;
			tableShownRows = maxStoreValue ? tableShownRowsMax : tableShownRowsMin;
			if (chartTable) changeRowCount(chartTable, tableShownRows);
			renderCategoryChart();
		}, 0);
	}

	function handleChartToggled(event: { detail: { headlineShowChart: boolean } }) {
		showChartStoreValue = event.detail.headlineShowChart;
		dispatch('chartToggled', { showChartStoreValue });
	}

	function handleLogarithmToggled(event: { detail: { headlineInitialLogarithm: boolean } }) {
		showLogarithmStoreValue = event.detail.headlineInitialLogarithm;
		dispatch('logarithmToggled', { showLogarithmStoreValue });
		renderCategoryChart();
	}

	function handleTop5Toggled(event: { detail: { headlineInitialTop5: boolean } }) {
		showTop5StoreValue = event.detail.headlineInitialTop5;
		dispatch('top5Toggled', { showTop5StoreValue });
		renderCategoryChart();
	}

	function handleNull(event: { detail: { headlineNull: boolean } }) {
		showNullStoreValue = event.detail.headlineNull;
		dispatch('nullToggled', { showNullStoreValue });
		renderCategoryChart();
	}

	function getSelectedLabel(selectedValue: string) {
		const selectedOption = dropdownObject.find((option) => option.value === selectedValue);
		initialDropdownLabel = selectedOption?.label ?? '';
		headers = [initialDropdownLabel, get(t)('count')];
		dispatch('changedGenericChartDropdown', { initialDropdownValue: selectedValue });
	}

	function maximize() {
		maxStoreValue = !maxStoreValue;
		dispatch('maximized', { maxStoreValue });
	}

	onDestroy(() => {
		destroyed = true;
		isMounted = false;
		categoryRequest.invalidate();
		if (resizeTimer) clearTimeout(resizeTimer);
		if (chartResizeFrame != null) cancelAnimationFrame(chartResizeFrame);
		chartInstance?.destroy();
		chartInstance = null;
		chartTable?.destroy();
		chartTable = null;
		unsubscribeFilterActive();
		unsubscribeUser();
	});
</script>

<div class="generic-category-root" class:maximized={maxStoreValue}>
	<Headline
		{headlineTitle}
		{headlineTooltip}
		headlineMaximize={maxStoreValue}
		headlineShowChart={showChartStoreValue}
		headlineIsChart={true}
		headlineInitialTop5={showTop5StoreValue}
		headlineInitialLogarithm={showLogarithmStoreValue}
		headlineInputTableData={reversedTableData}
		headlineInputTableHeader={headers}
		headlineChartJSElement={pieChart}
		headlineD3Element={null}
		headlineNull={showNullStoreValue}
		headlineLoading={null}
		on:chartToggled={handleChartToggled}
		on:logarithmToggled={handleLogarithmToggled}
		on:top5Toggled={handleTop5Toggled}
		on:maximized={handleMaximized}
		on:nullToggled={handleNull}
	/>
	<lens-data-passer bind:this={dataPasser} />
	<div class="category-chart-view" style={showChartStoreValue ? '' : 'display: none;'}>
		<div class="dropdown-container">
			<div class="dropdown straight-line-container">
				<label for="dropdownObject" style="margin-right:5px">{$t('feature')}:</label><br />
				<select class="dropbtn" bind:value={initialDropdownValue}>
					{#each dropdownObject as option (option.value)}
						<option class="dropdown-option" value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
		</div>
		<ChartStatusLine
			ready={statusReady}
			showTopSummary={showTop5StoreValue}
			shownCategories={statusShownCategories}
			totalCategories={statusTotalCategories}
			missingValuesHidden={!showNullStoreValue}
			missingValueCount={statusMissingValueCount}
		/>
		<div style={!showEmptyIcon ? '' : 'display: none;'} class="chart-container">
			<canvas bind:this={pieChart} />
		</div>
	</div>
	<div class="data">
		<div class="data-table" style={!showEmptyIcon && !showChartStoreValue ? '' : 'display: none;'}>
			<div class="data-table">
				<table id={chartTableName} class="display" style="width:100%">
					<thead>
						<tr>
							<th>{initialDropdownLabel}</th>
							<th>{$t('count')}</th>
						</tr>
					</thead>
				</table>
			</div>
		</div>
	</div>
	<div style={showEmptyIcon ? '' : 'display: none;'} class="bigSpinnerContainer">
		<img class="emptyIcon" src={emptyIcon} alt="Keine Daten verfügbar" />
	</div>
</div>

<style>
	.generic-category-root {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	.dropdown {
		width: 50%;
		float: right;
		margin-right: 10px;
	}

	.category-chart-view {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}

	.chart-container {
		position: relative;
		flex: 1 1 auto;
		width: 100%;
		min-width: 0;
		min-height: 0;
		padding: 2px 8px 4px;
		box-sizing: border-box;
	}

	.chart-container canvas {
		width: 100% !important;
		height: 100% !important;
		max-height: 100% !important;
	}
</style>
