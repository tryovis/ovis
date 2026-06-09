<script lang="ts">
	// @ts-nocheck
	import { Chart, registerables } from 'chart.js';
	import type { ChartConfiguration, ChartDataset } from 'chart.js';
	import { createEventDispatcher, onMount } from 'svelte';
	import Headline from '../components/Headline.svelte';
	import { createTable, changeRowCount } from '../tableBuilder';
	import { userStore } from '../store/userStore';
	import type { LensDataPasser } from '@samply/lens';
	import { reloadOnly } from '../store/reloadStore';
	import { filterActiveStore } from '../store/filterActiveStore.js';
	import { addUserFilter } from '../components/UserFilter';
	import type { AggregatedValue } from '../types/query';

	type Complication = {
		category: (string | null | undefined)[];
		groups: { label: string | null | undefined; count: (number | null | undefined)[] }[];
	};

	type StackedBarChartData = {
		category: string;
		groups: string;
		count: number;
		totalCount: number;
	};

	// Lokale Variable für filterActive
	let filterActive = true;

	// Abonnieren des filterActiveStore und den Wert aktualisieren
	filterActiveStore.subscribe((value) => {
		filterActive = value.filterActive; // Hier den Wert direkt zuweisen
	});

	let filter = JSON.stringify({ operand: 'OR', children: [] });

	export let headlineTitle: string;
	export let maxStoreValue: boolean;
	export let getGraphData: (filter: string) => Promise<Complication>;
	export let chartIdName: string;
	export let showLegend: boolean;
	export let tooltipAdditionalInfo: string;
	export let tableHeaders: string[];
	export let collection: string;
	export let showTop10: boolean;
	export let showTop5StoreValue: boolean;
	export let showChartStoreValue: boolean;
	export let initialAspectRatio: number;

	let aspectRatio = initialAspectRatio;
	let mounted: boolean = false;
	let inputArray: Complication;
	let stackedBarChart: HTMLCanvasElement;
	let chartInstance: Chart;
	let plotHeight: number = 0;
	let plotHeightMin: number = 0;
	let plotHeightMax: number = 760;

	let colorPalette: string[];

	let dataPasser: LensDataPasser;

	userStore.subscribe((value: { primaryColor: string; colorPalette: string[] }) => {
		({ colorPalette } = value);
	});

	let barChartTable: unknown;
	let tableShownRows: number = 0;
	let tableShownRowsMax: number = 20;
	let sortingIndex = 3;
	let tableData: StackedBarChartData[] = [];
	let reversedTableData: StackedBarChartData[];
	//let columns = [{ data: 'category' }, { data: 'groups' },{ data: 'count' },{ data: 'totalCount' }];
	let columns = [{ data: 'type' }, { data: 'status' }, { data: 'count' }, { data: 'totalCount' }];
	let columnAssignments: { [key: string]: string } = {};

	// Assign each element from the array to col1, col2, col3, etc.
	tableHeaders?.forEach((header, index) => {
		const colName = `col${index + 1}`; // Create column names like col1, col2, etc.
		columnAssignments[colName] = header;
	});

	const tooltip =
		'<p><b>' +
		headlineTitle +
		'</b></p><hr>Gestapelter Bar-Plot der pro Balken die Häufigkeit der <br>' +
		tooltipAdditionalInfo +
		' darstellt. <br><br>Jeder Balken ist dabei zusammengesetzt aus Stapeln der <br>Häufigkeit der Ausprägungen der <br>' +
		tooltipAdditionalInfo +
		'.<br><br> Bei Wechsel auf die Gesamtansicht (Klick auf das Stern Symbol <br>in der Kopfzeile) können aus Performanzgründen nur die<br> 50 häufigsten Balken angezeigt werden <br><br>Eine vollständige Gesamtübersicht finden Sie in der<br> tabellarischen Ansicht.<hr><p><i>Linksklick auf Infobutton um Information zu kopieren.</i></p>';

	const dispatch = createEventDispatcher();


	const EMPTY_LABEL = ' ';
	const OTHER_LABEL = 'Sonstige Ausprägungen';

	function normalizeLabel(value: string | null | undefined): string {
		return value == null || value === '' ? EMPTY_LABEL : String(value);
	}

	function normalizeCount(value: number | null | undefined): number {
		const numberValue = Number(value ?? 0);
		return Number.isFinite(numberValue) ? numberValue : 0;
	}

	function normalizeInputArray(input: Complication | null | undefined): Complication {
		return {
			category: (input?.category ?? []).map(normalizeLabel),
			groups: (input?.groups ?? []).filter(Boolean).map((group) => ({
				label: normalizeLabel(group.label),
				count: (group.count ?? []).map(normalizeCount)
			}))
		};
	}

	function sumAtIndex(groups: Complication['groups'], index: number): number {
		let total = 0;
		for (const group of groups) {
			total += normalizeCount(group?.count?.[index]);
		}
		return total;
	}

	function isMounted() {
		//if(collection = "therapy"){
		//	columns = [{ data: 'type' }, { data: 'status' }, { data: 'count' }, {data: 'catalog'}, { data: 'totalCount' }];
		//}
		return mounted;
	}

	function handleChartToggled(event: { detail: { headlineShowChart: boolean } }) {
		showChartStoreValue = event.detail.headlineShowChart;
		dispatch('chartToggled', { showChartStoreValue });
	}

	function handleTop5Toggled(event: { detail: { headlineInitialTop5: boolean } }) {
		showTop5StoreValue = event.detail.headlineInitialTop5;
		dispatch('top5Toggled', { showTop5StoreValue });
	}

	function handleMaximized(event: { detail: { headlineMaximize: boolean } }) {
		maxStoreValue = event.detail.headlineMaximize;
		maximize();
		setTimeout(() => {
			if (maxStoreValue) {
				plotHeight = plotHeightMax;
				changeRowCount(barChartTable, tableShownRowsMax);
			} else {
				plotHeight = plotHeightMin;
				changeRowCount(barChartTable, tableShownRows);
			}
		}, 0);
	}

	function maximize() {
		maxStoreValue = !maxStoreValue;
		dispatch('maximized', { maxStoreValue });
	}

	Chart.register(...registerables);

	$: {
		plotHeight;
		showTop5StoreValue;
		maxStoreValue;
		if (isMounted()) {
			createGroupedBarChart(inputArray);
		}
	}

	onMount(async () => {
		await import('@samply/lens');
		if (filterActive) {
			filter = JSON.stringify(dataPasser.getAstAPI());
		}
		filter = JSON.stringify(await addUserFilter(JSON.parse(filter)));
		inputArray = normalizeInputArray(await getGraphData(filter));
		tableData = flattenArray(inputArray);

		tableData = tableData.map(({ category, groups, ...rest }) => ({
			...rest,
			type: category, // 'category' wird zu 'type'
			status: groups // 'group' wird zu 'status'
		}));

		reversedTableData = tableData.map(({ category, groups, ...rest }) => ({
			type: category, // 'category' wird zu 'type'
			status: groups, // 'group' wird zu 'status'
			...rest
		}));

		// Query for the div element with the determined class and also containing 'box_style' and 'box_level2'
		const heightChartDiv =
			document.querySelector(
				`div.${
					collection === 'therapyGeneralComplication' ? 'complications' : 'bar-chart'
				}.box_style.box_level2`
			)?.clientHeight || 0;
		plotHeightMin = heightChartDiv - 50;
		plotHeight = plotHeightMin;
		tableShownRows = Math.floor((heightChartDiv - 170) / 32);

		mounted = true;
	});

	function createGroupedBarChart(inputArray: Complication) {
		if (!stackedBarChart || !inputArray) return;

		const normalizedInput = normalizeInputArray(inputArray);
		const categoryLimit = showTop5StoreValue === true ? (showTop10 ? 10 : 5) : 50;
		const categoryCount = Math.min(normalizedInput.category.length, categoryLimit);
		const sourceGroups = normalizedInput.groups;
		const sourceGroupCount = sourceGroups.length;
		const topGroupsPerCategory = 9;

		const visibleCategories = normalizedInput.category.slice(0, categoryCount).map(normalizeLabel);
		const totalsByCategory = new Array(categoryCount).fill(0);

		const aggregatedGroups: { label: string; count: number[] }[] = sourceGroups.map((group) => ({
			label: normalizeLabel(group.label),
			count: new Array(categoryCount).fill(0)
		}));
		const otherGroup = {
			label: OTHER_LABEL,
			count: new Array(categoryCount).fill(0)
		};

		for (let categoryIndex = 0; categoryIndex < categoryCount; categoryIndex++) {
			const countsWithIndex = new Array(sourceGroupCount);
			let total = 0;

			for (let groupIndex = 0; groupIndex < sourceGroupCount; groupIndex++) {
				const count = normalizeCount(sourceGroups[groupIndex]?.count?.[categoryIndex]);
				countsWithIndex[groupIndex] = { groupIndex, count };
				total += count;
			}

			totalsByCategory[categoryIndex] = total;

			countsWithIndex.sort((a, b) => b.count - a.count);
			let sumOfTopValues = 0;

			for (let topIndex = 0; topIndex < Math.min(topGroupsPerCategory, countsWithIndex.length); topIndex++) {
				const { groupIndex, count } = countsWithIndex[topIndex];
				aggregatedGroups[groupIndex].count[categoryIndex] = count;
				sumOfTopValues += count;
			}

			otherGroup.count[categoryIndex] = Math.max(total - sumOfTopValues, 0);
		}

		const tmpInputArray: Complication = {
			category: visibleCategories,
			groups: [...aggregatedGroups, otherGroup].filter(
				(group) => !group.count.every((count) => count === 0)
			)
		};

		const datasets: ChartDataset[] = tmpInputArray.groups.map((group, index) => ({
			label: normalizeLabel(group.label),
			data: group.count,
			backgroundColor: colorPalette?.[index % colorPalette.length]
		}));

		let newAspectRatio = maxStoreValue ? 2.1 : initialAspectRatio;
		if (tmpInputArray.category.length > 10) {
			newAspectRatio = newAspectRatio - Math.log(tmpInputArray.category.length) / 9;
		}
		aspectRatio = newAspectRatio;

		let ctx = stackedBarChart.getContext('2d');

		type QueryItem = {
			id: string;
			key: string;
			name: string;
			type: string;
			system?: string;
			values: QueryValue[];
			description?: string;
		};

		type QueryValue = {
			name: string;
			value: string | { min: number; max: number } | AggregatedValue[][];
			queryBindId: string;
			description?: string;
		};

		const addItem = (queryObject: QueryItem): void => {
			dataPasser.addStratifierToQueryAPI({
				label: queryObject.values[0].value,
				catalogueGroupCode: queryObject.key,
				parentGroupCode: queryObject.system
			});
		};

		const originalLabels = [...tmpInputArray.category];

		const chartConfig: ChartConfiguration = {
			type: 'bar',
			data: {
				labels: tmpInputArray.category.map((label) => {
					const safeLabel = normalizeLabel(label);
					return safeLabel.length > 10 ? safeLabel.substring(0, 10) + '...' : safeLabel;
				}),
				datasets: datasets
			},
			options: {
				indexAxis: 'y',
				aspectRatio: aspectRatio,
				animation: false,
				responsive: true,
				plugins: {
					legend: {
						display: showLegend,
						position: 'top'
					},
					tooltip: {
						callbacks: {
							label: (context) => {
								const datasetLabel = datasets[context.datasetIndex].label;
								const value = datasets[context.datasetIndex].data[context.dataIndex];
								const total = totalsByCategory[context.dataIndex] ?? 0;
								const fullCategoryLabel = originalLabels[context.dataIndex];

								return `${fullCategoryLabel} - ${datasetLabel}: ${value} (Total: ${total})`;
							}
						}
					}
				},
				scales: {
					x: {
						stacked: true
					},
					y: {
						stacked: true,
						display: true
					}
				},
				onClick: (event, elements) => {
					if (elements.length > 0) {
						const firstElement = elements[0];
						const datasetIndex = firstElement.datasetIndex;
						const dataIndex = firstElement.index;

						const categoryLabel = tmpInputArray.category[dataIndex];
						const datasetLabel = datasets[datasetIndex].label;

						let type = 'type';
						let status = 'status';

						if (collection === 'therapy') {
							type = 'complication_complication';
							status = 'complication_grade';
						}

						let queryItem1 = {
							id: 'Random generierte UUID',
							key: type,
							name: 'childCategorie.name',
							type: 'EQUALS',
							system: collection,
							values: [
								{
									name: categoryLabel,
									value: categoryLabel,
									queryBindId: 'Auch eine random UUID'
								}
							]
						};
						addItem(queryItem1);
						if (datasetLabel === OTHER_LABEL) {
							const matchingGroups = tmpInputArray.groups
								.map((group) => ({
									label: group.label,
									count: group.count[dataIndex]
								}))
								.filter((group) => group.label !== OTHER_LABEL && group.count > 0)
								.sort((a, b) => b.count - a.count);

							matchingGroups.forEach((group) => {
								let queryItem = {
									id: 'Random generierte UUID',
									key: '!' + status,
									name: 'childCategorie.name',
									type: 'EQUALS',
									system: collection,
									values: [
										{
											name: group.label,
											value: group.label,
											queryBindId: 'Auch eine random UUID'
										}
									]
								};
								addItem(queryItem);
							});
						} else {
							let queryItem2 = {
								id: 'Random generierte UUID',
								key: status,
								name: 'childCategorie.name',
								type: 'EQUALS',
								system: collection,
								values: [
									{
										name: datasetLabel,
										value: datasetLabel,
										queryBindId: 'Auch eine random UUID'
									}
								]
							};
							addItem(queryItem2);
						}

						reloadOnly();
					}
				}
			}
		};

		if (ctx) {
			if (chartInstance) {
				chartInstance.destroy();
			}
			chartInstance = new Chart(ctx, chartConfig);
		}

		if (!barChartTable) {
			barChartTable = createTable(
				collection,
				dataPasser,
				'barChartTable',
				tableData,
				columns,
				tableShownRows,
				sortingIndex
			);
		}
	}

	function appendValuesToInputArray(tmpInputArray: Complication, newArray: number[][]) {
		// Iteriere durch die Kategorien und füge die Werte aus newArray hinzu
		tmpInputArray.category.forEach((_category, index) => {
			// Überprüfe, ob der Index innerhalb des Bereichs liegt
			if (newArray[index]) {
				// Iteriere durch die Gruppen und aktualisiere die Werte
				tmpInputArray.groups.forEach((group, groupIndex) => {
					// Überprüfe, ob der Index innerhalb des Bereichs liegt
					if (newArray[index][groupIndex] !== undefined) {
						// Überschreibe den Wert in der entsprechenden Gruppe
						group.count[index] = newArray[index][groupIndex];
					}
				});
			}
		});
		return tmpInputArray;
	}

	function addNewGroupToInputArray(tmpInputArray: Complication) {
		// Überprüfe, ob bereits eine Gruppe mit dem Label "Sonstige Ausprägungen" existiert
		const existingGroupIndex = tmpInputArray.groups.findIndex(
			(group) => group.label === 'Sonstige Ausprägungen'
		);

		// Füge die neue Gruppe nur hinzu, wenn noch keine Gruppe mit dem Label existiert
		if (existingGroupIndex === -1) {
			const newGroup: { count: number[]; label: string } = {
				count: new Array(tmpInputArray.category.length).fill(0),
				label: 'Sonstige Ausprägungen'
			};

			// Füge die neue Gruppe am Ende des groups-Arrays hinzu
			tmpInputArray.groups.push(newGroup);
		}
		return tmpInputArray;
	}

	function flattenArray(inputObj: Complication) {
		const normalizedInput = normalizeInputArray(inputObj);
		const flatArray: StackedBarChartData[] = [];
		const totalCountsByCategory = normalizedInput.category.map((_category, index) =>
			sumAtIndex(normalizedInput.groups, index)
		);

		normalizedInput.category.forEach((category, cindex) => {
			normalizedInput.groups.forEach((group) => {
				const count = normalizeCount(group.count[cindex]);
				if (count !== 0) {
					flatArray.push({
						category: normalizeLabel(category),
						groups: normalizeLabel(group.label),
						count,
						totalCount: totalCountsByCategory[cindex]
					});
				}
			});
		});

		return flatArray;
	}

</script>

<Headline
	{headlineTitle}
	headlineTooltip={tooltip}
	headlineMaximize={maxStoreValue}
	headlineShowChart={showChartStoreValue}
	headlineIsChart={true}
	headlineInputTableData={reversedTableData}
	headlineInputTableHeader={tableHeaders}
	headlineInitialTop5={showTop5StoreValue}
	headlineInitialTop10={showTop10}
	headlineChartJSElement={stackedBarChart}
	on:chartToggled={handleChartToggled}
	on:maximized={handleMaximized}
	on:top5Toggled={handleTop5Toggled}
/>
<!-- prettier-ignore -->
<lens-data-passer bind:this={dataPasser}></lens-data-passer>
<div style={showChartStoreValue ? '' : 'display: none;'}>
	<div class="chart-container">
		<div class="chartAreaWrapper" style="height: {plotHeight}px;">
			<div class="chartAreaWrapper2">
				<!-- prettier-ignore -->
				<canvas bind:this={stackedBarChart} id={chartIdName} height={plotHeight}></canvas>
			</div>
		</div>
	</div>
</div>

<div style={!showChartStoreValue ? '' : 'display: none;'}>
	<div class="data-table">
		<table id="barChartTable" class="display" style="width:100%">
			<thead>
				<tr>
					<th>{columnAssignments.col1}</th>
					<th>{columnAssignments.col2}</th>
					<th>{columnAssignments.col3}</th>
					<th>{columnAssignments.col4}</th>
				</tr>
			</thead>
		</table>
	</div>
</div>

<style>
	.chartWrapper {
		position: relative;
		width: 100%;
	}
	.chartWrapper > canvas {
		position: absolute;
		left: 0;
		top: 0;
		pointer-events: none;
	}
	.chartAreaWrapper {
		overflow-y: scroll;
	}
</style>
