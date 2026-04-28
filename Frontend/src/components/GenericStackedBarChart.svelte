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
		category: string[];
		groups: { label: string; count: number[] }[];
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
		inputArray = await getGraphData(filter);
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
		// Erstelle ein Array, um die Datasets zu speichern
		const datasets: ChartDataset[] = [];
		let tmpInputArray: Complication = {
			category: [...inputArray.category],
			groups: inputArray.groups.map((groups) => ({
				label: groups.label,
				count: [...groups.count]
			}))
		};

		// Erstelle ein leeres zweidimensionales Array
		const newArray: number[][] = [];
		tmpInputArray.category.forEach((_category, index) => {
			const counts: number[] = tmpInputArray.groups.map((group) => group.count[index]);

			// Erhalte die 9 maximalen Werte und ihre Indizes
			const maxValues: number[] = counts
				.slice()
				.sort((a, b) => b - a)
				.slice(0, 9);
			const maxIndices: number[] = maxValues.map((value) => counts.indexOf(value));
			let allSum = inputArray.groups.reduce((acc, groups) => acc + groups.count[index], 0);
			// Ersetze Werte außerhalb der maximalen 9 durch 0 und berechne die Summe der maximalen Werte
			let sumOfMaxValues: number = 0;

			counts.forEach((count, i) => {
				if (maxIndices.includes(i)) {
					sumOfMaxValues += count;
				} else {
					counts[i] = 0;
				}
			});

			let restOfMaxValues = allSum - sumOfMaxValues;

			// Füge die Kategorie, die modifizierten Zählungen und die Summe der maximalen Werte zum neuen Array hinzu
			newArray.push([...counts, restOfMaxValues]);
		});

		console.log('Neues zweidimensionales Array:', newArray);
		tmpInputArray = addNewGroupToInputArray(tmpInputArray);
		tmpInputArray = appendValuesToInputArray(tmpInputArray, newArray);
		console.log('Neues InputArray:', tmpInputArray);
		let topAmount = 5;
		if (showTop10) {
			topAmount = 10;
		}

		if (showTop5StoreValue === true) {
			console.log('showTop5', showTop5StoreValue);
			tmpInputArray.category = tmpInputArray.category.slice(0, topAmount);
			tmpInputArray.groups.forEach((groups) => {
				groups.count = groups.count.slice(0, topAmount);
			});
		} else {
			console.log('showTop50', showTop5StoreValue);
			tmpInputArray.category = tmpInputArray.category.slice(0, 50);
			tmpInputArray.groups.forEach((groups) => {
				groups.count = groups.count.slice(0, 50);
			});
		}

		console.log('Geslictes Array:', tmpInputArray);
		// Filtere Gruppen mit allen Nullwerten heraus
		tmpInputArray.groups = tmpInputArray.groups.filter(
			(group) => !group.count.every((count) => count === 0)
		);
		console.log('Entnulltes Array:', tmpInputArray);
		// Iteriere durch die Grade und erstelle Datasets für jeden Grad
		tmpInputArray.groups.forEach((groups) => {
			const dataset: ChartDataset = {
				label: groups.label,
				data: groups.count,
				backgroundColor: colorPalette[datasets.length % colorPalette.length]
			};

			datasets.push(dataset);
		});
		console.log('Datasets erstellt:', tmpInputArray);
		// Berechne das neue Aspect Ratio
		let newAspectRatio = initialAspectRatio;
		if (maxStoreValue) {
			newAspectRatio = 2.1;
		}
		if (tmpInputArray.category.length > 10) {
			newAspectRatio = newAspectRatio - Math.log(tmpInputArray.category.length) / 9;
		}
		aspectRatio = newAspectRatio;

		console.log('Aspect Ratio adjustiert', tmpInputArray);
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
			console.log('ADD ITEM', queryObject);
			dataPasser.addStratifierToQueryAPI({
				label: queryObject.values[0].value,
				catalogueGroupCode: queryObject.key,
				parentGroupCode: queryObject.system
			});
			console.log(dataPasser.getQueryAPI());
			console.log('AFTER ADD ITEM');
		};

		const originalLabels = [...tmpInputArray.category];

		const chartConfig: ChartConfiguration = {
			type: 'bar',
			data: {
				// Annahme: Alle Komplikationen haben die gleichen Komplikationen
				labels: tmpInputArray.category.map((label) =>
					label.length > 10 ? label.substring(0, 10) + '...' : label
				),
				datasets: datasets
			},
			options: {
				indexAxis: 'y',
				aspectRatio: aspectRatio,
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
								const total = inputArray.groups.reduce(
									(acc, groups) => acc + groups.count[context.dataIndex],
									0
								);
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
						display: true // Setze dies auf true, um die Y-Achse anzuzeigen
					}
				},
				onClick: (event, elements) => {
					if (elements.length > 0) {
						const firstElement = elements[0]; // Erster ausgewählter Balken
						const datasetIndex = firstElement.datasetIndex; // Index des Substapels
						const dataIndex = firstElement.index; // Index des Stapels

						const categoryLabel = tmpInputArray.category[dataIndex];
						const datasetLabel = datasets[datasetIndex].label;

						console.log(`Kategorie (Stapel): ${categoryLabel}`);
						console.log(`Substapel: ${datasetLabel}`);

						let type = 'type';
						let status = 'status';

						if (collection === 'therapy') {
							type = 'complication_complication';
							status = 'complication_grade';
						}

						let queryItem1 = {
							id: 'Random generierte UUID', //uuidv4(),
							key: type, //theoretisch metastasis => Im Katalog hinterlegt
							name: 'childCategorie.name', //Im Katalog hinterlegt
							type: 'EQUALS',
							system: collection,
							values: [
								{
									name: categoryLabel, //Anzeigename
									value: categoryLabel, // theoreitsch label z.B. BRA Backendvalue
									queryBindId: 'Auch eine random UUID' //Storebindung
								}
							]
						};
						addItem(queryItem1);
						if (datasetLabel === 'Sonstige Ausprägungen') {
							// Finde alle Gruppen für die geklickte Kategorie und sortiere nach Häufigkeit (count[dataIndex])
							const matchingGroups = tmpInputArray.groups
								.map((group) => ({
									label: group.label,
									count: group.count[dataIndex] // Anzahl für die geklickte Kategorie
								}))
								.filter((group) => group.label !== 'Sonstige Ausprägungen' && group.count > 0) // Sonstige rausfiltern & nur Gruppen mit Vorkommen behalten
								.sort((a, b) => b.count - a.count); // Sortierung nach Häufigkeit absteigend

							console.log('Sortierte Gruppen für', categoryLabel, matchingGroups);

							// Erzeuge QueryItems für die gefilterten und sortierten Labels
							matchingGroups.forEach((group) => {
								let queryItem = {
									id: 'Random generierte UUID',
									key: '!' + status,
									name: 'childCategorie.name',
									type: 'EQUALS',
									system: collection,
									values: [
										{
											name: group.label, // Anzeigename
											value: group.label, // Backend-Wert
											queryBindId: 'Auch eine random UUID' // Storebindung
										}
									]
								};
								console.log('QueryItem:', queryItem);
								addItem(queryItem);
							});
						} else {
							// Standard-Fall: Nutzer klickt auf eine normale Kategorie
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
		const flatArray: StackedBarChartData[] = [];

		inputObj.category.forEach((category, cindex) => {
			inputObj.groups.forEach((groups) => {
				if (groups) {
					// Überprüfen, ob das Degree-Objekt nicht null ist
					const flatObj: StackedBarChartData = {
						category: category,
						groups: groups.label,
						count: groups.count[cindex],
						totalCount: inputObj.groups.reduce((acc, currDegree) => {
							if (currDegree) {
								return acc + currDegree.count[cindex];
							}
							return acc;
						}, 0)
					};
					if (groups.count[cindex] !== 0) {
						flatArray.push(flatObj);
					}
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
