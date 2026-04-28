<script lang="ts">
	import { Chart, registerables } from 'chart.js';

	import { getTimeChart } from '../graphQl/gql-generic.js';
	import 'chartjs-adapter-moment'; // Import 'chartjs-adapter-moment'
	import noUiSlider from 'nouislider';
	import '../nouislider.css';
	import Headline from './Headline.svelte';
	import { userStore } from '../store/userStore.js';
	import { createEventDispatcher, onMount } from "svelte";
	import { t, locale, locales } from "../store/languageStore.js";
	import type {LensDataPasser} from "@samply/lens"
	import { filterActiveStore } from '../store/filterActiveStore.js';
	import {addUserFilter} from '../components/UserFilter'
	import { iconPath } from '$lib/path-utils';

	// Lokale Variable für filterActive
	let filterActive = true;

	// Abonnieren des filterActiveStore und den Wert aktualisieren
	filterActiveStore.subscribe((value) => {
		filterActive = value.filterActive; // Hier den Wert direkt zuweisen
	});

	export let aspectRatioMin: number;
	export let dropdownObject: { label: string; value: string }[];
	export let headlineTitle: string;
	export let initialDropdownValue: string;
	export let initialTimeUnit = 'months';
	export let initialDatediff = false;
	export let initialMedian = 'indicatorDeactivated';
	export let selectedEventType = 'all';
	export let maxStoreValue = false;
	export let collection: string;
	export let showLogarithmStoreValue = false;

	let dataPasser: LensDataPasser;
	let aspectRatioMax = 2.3;
	let aspectRatio = aspectRatioMin;

	const loadingIcon = iconPath('spinner.svg');
	let primaryColor: string;
	let colorPalette: string[];

	let showEmptyIcon = false;
	const emptyIcon = iconPath('null-off.svg');


	userStore.subscribe((value: any) => {
		({ primaryColor, colorPalette } = value);
	});

	Chart.register(...registerables);

	function handleMaximized(event: any) {
		console.log("bin im handleMaximized")
		maxStoreValue = event.detail.headlineMaximize;
		if(isMounted){
			maximize();
		}
		setTimeout(() => {
			if (maxStoreValue) {
				aspectRatio = aspectRatioMax;
			} else {
				aspectRatio = aspectRatioMin;
			}
		}, 0);
	}

	function handleLogarithmToggled(event: any) {
		showLogarithmStoreValue = event.detail.headlineInitialLogarithm;
		dispatch('logarithmToggled', { showLogarithmStoreValue});
	}

	//@ts-ignore
	const hoverColorPalette = colorPalette;

	let leftSliderOutput: string; // Adjust the minimum value as needed
	let rightSliderOutput: string; // Adjust the maximum value as needed

	let lineCanvas: HTMLCanvasElement;

	const dimensionTypes = [$t("indicatorDeactivated"), $t("indicatorActivated")];
	
	let selectedDimensionType = $t(initialMedian);

	const timeTypes = [
		$t("date") + ' (' + $t("months") + ')',
		$t("date") + ' (' + $t("quarters") + ')',
		$t("date") + ' (' + $t("years") + ')',
		$t("fromDiagnosis") + ' (' + $t("months") + ')',
		$t("fromDiagnosis") + ' (' + $t("quarters") + ')',
		$t("fromDiagnosis") + ' (' + $t("years") + ')',
	];

	//let selectedTimeType = $t("date") + ' (' + $t("year") + ')';
	let selectedTimeType = (initialDatediff ?  $t("fromDiagnosis"): $t("date")) + ' (' + $t(initialTimeUnit) + ')';
	let previousSelectedTimeType = selectedTimeType;

	const eventTypes = [
		{ label: $t("selectionFirstOccurence"), value: 'oldest' },
		{ label: $t("representationAllOccurences"), value: 'all' },
		{ label: $t("selectionLastOccurence"), value: 'newest' }
	];
	//let selectedEventType = 'all';

	let input_vector: any[] = [];

	let leftSlider: number; // Adjust the minimum value as needed
	let rightSlider: number; // Adjust the maximum value as needed

	let minDate: number;
	let maxDate: number;

	let slider: any; // 'as any' Typumwandlung

	let chartInstance: {
		[x: string]: any;
		getContext?: (arg0: string) => any;
		destroy?: () => void;
	} | null = null;
	
	let isMounted = false;
	let filter = JSON.stringify({ "operand": "OR", "children": [] });;
	onMount(async () => {
		
		await import("@samply/lens");

        if(filterActive){
            filter = JSON.stringify(dataPasser.getAstAPI());
        }
		filter = JSON.stringify(await addUserFilter(JSON.parse(filter)));  

		handleMaximized({ detail: { headlineMaximize: maxStoreValue } });
		splitTimeDropdown();
		
		const pcd = await getTimeChart(
			collection,
			initialDropdownValue,
			initialDatediff,
			selectedEventType,
			initialTimeUnit,
			filter
		);

		if (!pcd || pcd.length === 0) {
        showEmptyIcon = true; // Nur wenn wirklich keine Daten vorhanden sind
		} else {
			input_vector = pcd;
		}
		
		input_vector = pcd;
		console.log("PCD", input_vector)
		onUpdate(false);
		isMounted = true;
	});

	$: if (isMounted) {
    // Trigger nur bei relevanten Änderungen
    if (initialDropdownValue || selectedEventType || selectedDimensionType || selectedTimeType || showLogarithmStoreValue) {
        onUpdate(false);
    }

		dispatch('changedMedian', { selectedDimensionType });
		dispatch('changedEvent', { selectedEventType });
		dispatch('changedDropdown', { initialDropdownValue });
	}

	
	async function setSlider() {
		destroySlider(); // Zerstört den vorhandenen Slider, falls vorhanden
		slider = document.getElementById('slider-round') as any; // 'as any' Typumwandlung
		noUiSlider.create(slider, {
			start: [leftSlider, rightSlider],
			range: {
				min: minDate,
				max: maxDate
			}
		});

		// Binden Sie das 'slide'-Event an den Slider und rufen Sie handleSliderChange auf
		slider.noUiSlider.on('change', (values: string[], handle: number) => {
			if (handle === 0) {
				leftSlider = parseFloat(values[0]);
			} else {
				rightSlider = parseFloat(values[1]);
			}
			onUpdate(true)
		});
		
	}

	function destroySlider() {
		if (slider) {
			slider.noUiSlider.destroy(); // Zerstört den bestehenden Slider
		}
	}

	let updating = false;

	async function onUpdate(sliding:boolean) {
		showEmptyIcon = false;
		if (filterActive) {
			filter = JSON.stringify(dataPasser.getAstAPI());
		}
		filter = JSON.stringify(await addUserFilter(JSON.parse(filter)));  
		
		updating = true;
		
		if (chartInstance) {
			await new Promise((resolve) => {
				chartInstance.destroy();
				chartInstance = null;
				setTimeout(resolve, 0); // Warten auf die nächste Event Loop Runde
			});
		}

		splitTimeDropdown();

		const pcd = await getTimeChart(
			collection,
			initialDropdownValue,
			initialDatediff,
			selectedEventType,
			initialTimeUnit,
			filter
		);

		if (!pcd || pcd.length === 0) {
        	showEmptyIcon = true; // Nur wenn wirklich keine Daten vorhanden sind
		}else{

		let newInputVector = pcd ? pcd.filter(item => item !== null && item !== undefined && item.label.trim() !== '') : [];
		console.log("inputVector", newInputVector )

		

		if (JSON.stringify(newInputVector) !== JSON.stringify(input_vector)) {
			input_vector = newInputVector;
			if(!sliding){
				await setZoom();  // Min/Max-Werte nur neu berechnen, wenn sich die Daten geändert haben
				await setSlider(); // Slider entsprechend aktualisieren
			}
		}


		createLineChart();
		
		updating = false;
		}
	}


	function splitTimeDropdown() {
		switch (selectedTimeType) {
			case $t("date") + ' (' + $t("months") + ')':
				initialTimeUnit = 'months';
				initialDatediff = false;
				break;
			case $t("date") + ' (' + $t("quarters") + ')':
				initialTimeUnit = 'quarters';
				initialDatediff = false;
				break;
			case $t("date") + ' (' + $t("years") + ')':
				initialTimeUnit = 'years';
				initialDatediff = false;
				break;
			case $t("fromDiagnosis") + ' (' + $t("months") + ')':
				initialTimeUnit = 'months';
				initialDatediff = true;
				break;
			case $t("fromDiagnosis") + ' (' + $t("quarters") + ')':
				initialTimeUnit = 'quarters';
				initialDatediff = true;
				break;
			case $t("fromDiagnosis") + ' (' + $t("years") + ')':
				initialTimeUnit = 'years';
				initialDatediff = true;
				break;
			default:
				break;
		}
		console.log("Dispatching changedTimeUnit with:", { initialTimeUnit, initialDatediff });
		dispatch('changedTimeUnit', { initialTimeUnit,initialDatediff});
	}

	async function setZoom() {
		//console.log("set ZOOM")
		minDate = Math.min(...input_vector.map((item) => item.date));
		maxDate = Math.max(...input_vector.map((item) => item.date));
		//console.log("mindate", minDate)
		//console.log("maxdate", maxDate)
		leftSlider = minDate;
		rightSlider = maxDate;

		//Interquartile Range Q3-Q1 * 2 auf rightSlider angewandt um Outlier zu beseitigen
		const { q1, q3 } = calculateDataPointQuartiles();
		console.log("Q1", q1)
		console.log("Q3", q3)
		if (initialDatediff) {
			rightSlider = Math.min((q3 - q1) * 2, maxDate); // benötigt maxwert
		} else {
			leftSlider = Math.max((q3 - q1) * 2, minDate); // benötigt minwert 
		}

	}

	function setSliderTexts() {
		let leftSliderDate: string = '';
		let rightSliderDate: string = '';
		switch (initialTimeUnit) {
			case 'months':
				leftSliderDate = new Date(leftSlider).toLocaleDateString('en-US', {
					year: 'numeric',
					month: 'short'
				});
				rightSliderDate = new Date(rightSlider).toLocaleDateString('en-US', {
					year: 'numeric',
					month: 'short'
				});
				break;
			case 'quarters':
				const leftDate = new Date(leftSlider);
				const rightDate = new Date(rightSlider);
				rightDate.setMonth(rightDate.getMonth() + 2);
				leftDate.setMonth(leftDate.getMonth() + 2);
				// Das Datum im gewünschten Format anzeigen
				const rightQuarter = `Q${Math.floor(rightDate.getMonth() / 3) + 1}`;
				const leftQuarter = `Q${Math.floor(leftDate.getMonth() / 3) + 1}`;
				const rightYear = rightDate.getFullYear();
				const leftYear = leftDate.getFullYear();
				rightSliderDate = `${rightQuarter}-${rightYear}`;
				leftSliderDate = `${leftQuarter}-${leftYear}`;
				break;
			case 'years':
				leftSliderDate = new Date(leftSlider).toLocaleDateString('en-US', { year: 'numeric' });
				rightSliderDate = new Date(rightSlider).toLocaleDateString('en-US', { year: 'numeric' });
				break;
			default:
				break;
		}
		leftSliderOutput = initialDatediff ? leftSlider + '' : leftSliderDate + '';
		rightSliderOutput = initialDatediff ? rightSlider + '' : rightSliderDate + '';
	}

	async function createLineChart() {
		const existingChart = Chart.getChart(lineCanvas);
		if (existingChart) {
			existingChart.destroy();
		}

		setSliderTexts();
		if (lineCanvas) {
			let ctx = lineCanvas.getContext('2d');
			// Erstellen Sie separate Datenreihen für jede Kategorie
			const datasets: {
				label: any;
				data: { x: any; y: any }[];
				backgroundColor: any; // Benutzerdefinierte Farbpalette für die Linie
				hoverBackgroundColor: any;
				borderColor: any; // Farbe für die Linie
				borderWidth: number; // Erhöhen Sie die Breite der Linie auf 2 (kann nach Bedarf angepasst werden)
				fill: boolean; // Kein Bereich unter der Linie ausfüllen
				tension: number; // Wert für die Geschwungenheit der Linie (hier können Sie experimentieren)

				pointBackgroundColor: any; // Farbe für die Punkte
				pointRadius: number;
			}[] = [];
			//let input_vector = [];

			const uniqueLabelsSet = new Set(input_vector.map((item) => item.label));
			const uniqueLabelsArray = [...uniqueLabelsSet];
			const uniqueColorArray: any = {};
			const uniqueMaxValues: any = {};

			let xtype = initialDatediff ? 'linear' : 'time';
			//let xunit = timeTypes.substring(timeTypes.length-1);
			let xunit = '';

			switch (selectedTimeType) {
				case $t("date") + ' (' + $t("months") + ')':
					xunit = 'month';
					break;
				case $t("date") + ' (' + $t("quarters") + ')':
					xunit = 'quarter';
					break;
				case $t("date") + ' (' + $t("years") + ')':
					xunit = 'year';
					break;
				default:
					break;
			}

			input_vector.forEach((item: { label: any; date: any; count: any }, index: number) => {
				const label = item.label;
				const data = {
					x: item.date,
					y: item.count
				};

				// Überprüfen Sie, ob es bereits eine Datenreihe mit dem gleichen Label gibt
				const existingDataset = datasets.find((dataset) => dataset.label === label);
				if (existingDataset) {
					existingDataset.data.push(data);
				} else {
					const existingDatasetIndex = datasets.findIndex((dataset) => dataset.label === label);

					if (existingDatasetIndex !== -1) {
						datasets[existingDatasetIndex].data.push(data);
					} else {
						const colorIndex = datasets.length % colorPalette.length;
						datasets.push({
							label: label,
							data: [data],
							backgroundColor: colorPalette[colorIndex], // Benutzerdefinierte Farbpalette für die Linie
							hoverBackgroundColor: hoverColorPalette[colorIndex],
							borderColor: colorPalette[colorIndex], // Farbe für die Linie
							borderWidth: 1, // Erhöhen Sie die Breite der Linie auf 2 (kann nach Bedarf angepasst werden)
							fill: false, // Kein Bereich unter der Linie ausfüllen
							tension: 0.2, // Wert für die Geschwungenheit der Linie (hier können Sie experimentieren)
							pointBackgroundColor: colorPalette[colorIndex], // Farbe für die Punkte
							pointRadius: 3 // Größe der Punkte (kann nach Bedarf angepasst werden)
						});
						const labelIndex = uniqueLabelsArray.indexOf(label);
						uniqueColorArray[labelIndex] = colorPalette[colorIndex];
					}
				}
			});

			const data = {
				datasets: datasets
			};
			const options = {
				aspectRatio: aspectRatio,
				scales: {
					x: {
						min: leftSlider,
						max: rightSlider,
						type: xtype,
						position: 'bottom',
						beginAtZero: true,
						title: {
							display: true,
							text: selectedTimeType
						},
						time: {
							unit: xunit,
							displayFormats: {
								month: 'MMM YYYY',
								quarter: '\\QQ\\-YYYY',
								year: 'YYYY'
							}
						},
						ticks: {
							maxRotation: 0,
							autoSkip: true,
							maxTicksLimit: 10
						}
					},
					y: {
						type: showLogarithmStoreValue ? 'logarithmic' : 'linear',
						position: 'left',
						title: {
							display: true,
							text: $t("numOfSpecProgressEvents")
						}
					}
				},
				plugins: {
					tooltip: {
						callbacks: {
							label: function (context: any) {
								if (context.dataset.label && context.dataset.label.includes('Median')) {
									return context.dataset.label;
								}
								return context.dataset.label + ': ' + context.formattedValue;
							}
						}
					}
				}
			};

			// Iterieren Sie durch die Kategorien und berechnen Sie den Median für jede Kategorie
			if (selectedDimensionType == $t("indicatorActivated") && initialDatediff) {
				uniqueLabelsArray.forEach((uniqueLabel) => {
					// Filtern Sie die Daten für die aktuelle Kategorie
					const categoryData = input_vector.filter((item) => item.label === uniqueLabel);
					if (categoryData.length > 0) {
						const medianDate = findMedianBalancePoint(categoryData);
						if (medianDate) {
							// Fügen Sie den Medianwert für 'count' und das Datum zur medianValues-Liste hinzu

							const feste_X_Position = medianDate; // X-Position der vertikalen Linie
							const minY_Wert = 1; // Minimaler Y-Wert
							const maxY_Wert = input_vector.reduce(
								(max, item) => Math.max(max, item.count),
								-Infinity
							);

							// Daten für die vertikale Linie
							const verticalLineData = [
								{ x: feste_X_Position, y: minY_Wert }, // Startpunkt
								{ x: feste_X_Position, y: maxY_Wert } // Endpunkt
							];
							const labelIndex = uniqueLabelsArray.indexOf(uniqueLabel);
							const median_label = ' Median: ' + uniqueLabel;
							const verticalLineDataset = {
								label: median_label,
								data: verticalLineData,
								backgroundColor: uniqueColorArray[labelIndex],
								borderColor: hexToRgba(uniqueColorArray[labelIndex], 0.5), // Rote Linie mit 50% Transparenz
								borderWidth: 8, // Erhöhen Sie die Breite der Linie auf 2 (kann nach Bedarf angepasst werden)
								pointBackgroundColor: 'rgba(255, 0, 0, 0)', // Vollständig transparente Punkte
								pointRadius: 3, // Größe der Punkte auf 0 setzen, um sie zu verstecken
								borderDash: [5, 5],
								fill: false // Kein Bereich unter der Linie ausfüllen
							};
							//@ts-ignore
							datasets.push(verticalLineDataset);
						}
					}
				});
			}

			let myChart;
			if (ctx) {
				myChart = new Chart(ctx, {
					type: 'line', // Ändern Sie den Chart-Typ auf Line
					data: data,
					options: options as any
				});
				chartInstance = myChart;
			}
		}
	}

	function findMedianBalancePoint(data: any) {
		const sortedData = data.sort((a: any, b: any) => a.date - b.date);

		let leftSum = 0;
		let rightSum = sortedData.reduce((sum: any, item: any) => sum + item.count, 0);
		let medianIndex = -1;
		let minDifference = Number.MAX_VALUE;

		for (let i = 0; i < sortedData.length; i++) {
			const currentItem = sortedData[i];
			leftSum += currentItem.count;
			rightSum -= currentItem.count;

			const currentDifference = Math.abs(leftSum - rightSum);

			if (currentDifference < minDifference) {
				minDifference = currentDifference;
				medianIndex = i;
			}
		}

		if (medianIndex !== -1) {
			// Sie haben den Index des Elements gefunden, an dem der Unterschied minimal ist
			const medianItem1 = sortedData[medianIndex];
			let medianDate2 = 0;
			if (sortedData[medianIndex + 1]) {
				medianDate2 = sortedData[medianIndex + 1].date;
			}

			const result = (medianItem1.date + medianDate2) / 2;
			return result;
		}

		// Falls kein Index gefunden wurde, geben Sie eine geeignete Meldung oder einen Standardwert zurück
		return $t("noIndexFound");
	}

	function hexToRgba(hex: string, alpha: number) {
		const hexColor = hex.replace(/^#/, '');
		const r = parseInt(hexColor.substring(0, 2), 16);
		const g = parseInt(hexColor.substring(2, 4), 16);
		const b = parseInt(hexColor.substring(4, 6), 16);
		return `rgba(${r},${g},${b},${alpha})`;
	}

	function calculateDataPointQuartiles() {
		// Erstellen Sie ein Array der Zeitwerte, basierend auf Ihren Daten
		const timeValues = input_vector.map((item) => item.date);

		// Sortieren Sie die Zeitwerte in aufsteigender Reihenfolge
		const sortedTimeValues = timeValues.sort((a, b) => a - b);

		// Berechnen Sie die Quartile (Q1 und Q3) basierend auf der Anzahl der Datenpunkte
		const totalDataPoints = sortedTimeValues.length;
		const q1Index = Math.floor(totalDataPoints * 0.25);
		const q3Index = Math.floor(totalDataPoints * 0.75);
		const q1 = sortedTimeValues[q1Index];
		const q3 = sortedTimeValues[q3Index];

		return { q1, q3 };
	}
  const dispatch = createEventDispatcher();
    function maximize() {
        maxStoreValue = !maxStoreValue;
        dispatch('maximized', { maxStoreValue});
    }
</script>

<Headline
	{headlineTitle}
	headlineTooltip={$t("tooltip_timeChart")}
	headlineMaximize={maxStoreValue}
	headlineShowChart={null}
	headlineIsChart={true}
	headlineInitialTop5={null}
	headlineInitialLogarithm={showLogarithmStoreValue}
	headlineInputTableData={null}
	headlineChartJSElement={lineCanvas}
	headlineD3Element={null}
	on:logarithmToggled={handleLogarithmToggled}
	on:maximized={handleMaximized}
/>
<lens-data-passer bind:this={dataPasser} />
<div class="straight-line-container">

	<div class="dropdown-container">
    {#if dropdownObject.length>1}
		<div class="dropdown">
			<label for="dropdownObject">Ereignis-Kategorie:</label><br />
			<select class="dropbtn" bind:value={initialDropdownValue}>
				{#each dropdownObject as option (option.value)}
					<option class="dropdown-option" value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>
    {/if}

		<div class="dropdown">
			<label for="event">{$t("selectionChronologicalOrder")}:</label><br />
			<select class="dropbtn" bind:value={selectedEventType}>
				{#each eventTypes as option (option.value)}
					<option class="dropdown-option" value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>
		<div class="dropdown">
			<label for="time">{$t("timeline")}:</label><br />
			<select class="dropbtn" bind:value={selectedTimeType}>
				{#each timeTypes as option}
					<option class="dropdown-option" value={option}>{option}</option>
				{/each}
			</select>
		</div>
		<div class="dropdown">
			<label for="dimension">Median:</label><br />
			<select class="dropbtn" bind:value={selectedDimensionType} disabled={!initialDatediff}>
				<option class="dropdown-option" value={$t("indicatorDeactivated")}>{$t("indicatorDeactivated")}</option>
				<option class="dropdown-option" value={$t("indicatorActivated")}
					>{ initialDatediff ? $t("indicatorActivated") : $t("indicatorDeactivated") }</option
				>
			</select>
		</div>
	</div>
</div>

<div style={isMounted && !updating &&!showEmptyIcon ? '' : 'display: none;'}>
	<div class="chart-container">
		<canvas bind:this={lineCanvas} />
	</div>

	<div class="straight-line-container">
		<span class="min-slider">{leftSliderOutput}</span>
		<div class="slider-container">
			<div id="slider-round" />
		</div>
		<span class="max-slider">{rightSliderOutput}</span>
	</div>
</div>
<div style={!isMounted || updating || showEmptyIcon ? '' : 'display: none;'} class="bigSpinnerContainer">
    {#if showEmptyIcon}
        <img class="emptyIcon" src={emptyIcon} alt="Keine Daten verfügbar" />
    {:else}
        <button class="bigSpinnerButton">
            <img class="bigSpinner" id="spinner" src={loadingIcon} alt="Lade..." />
        </button>
    {/if}
</div>


<style>
	.dropdown-container {
		display: flex;
		flex: 1;
	}

	.dropdown {
		flex: 1;
		margin-right: 10px; /* Add margin between dropdowns if needed */
	}

	.slider-container {
		flex: 60%;
		padding-left: 5%;
		padding-right: 5%;
		padding-bottom: 10px;
	}

	.min-slider {
		padding-left: 5%;
	}
	.max-slider {
		padding-right: 5%;
	}

	.chart-container {
		padding: 10px;
	}
</style>
