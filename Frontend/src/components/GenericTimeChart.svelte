<script lang="ts">
	import { Chart, registerables } from 'chart.js';
	import { getTimeChart } from '../graphQl/gql-generic.js';
	import 'chartjs-adapter-moment';
	import noUiSlider from 'nouislider';
	import '../nouislider.css';
	import Headline from './Headline.svelte';
	import { userStore } from '../store/userStore.js';
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';
	import { t } from '../store/languageStore.js';
	import type { LensDataPasser } from '@samply/lens';
	import { filterActiveStore } from '../store/filterActiveStore.js';
	import { addUserFilter } from '../components/UserFilter';
	import { iconPath } from '$lib/path-utils';

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

	Chart.register(...registerables);

	const dispatch = createEventDispatcher();
	const loadingIcon = iconPath('spinner.svg');
	const emptyIcon = iconPath('null-off.svg');

	let dataPasser: LensDataPasser;
	let lineCanvas: HTMLCanvasElement;
	let chartInstance: Chart | null = null;
	let slider: any = null;

	let filterActive = true;
	let filter = JSON.stringify({ operand: 'OR', children: [] });

	let primaryColor: string;
	let colorPalette: string[] = [];
	let hoverColorPalette: string[] = [];

	let isMounted = false;
	let updating = false;
	let showEmptyIcon = false;
	let requestSeq = 0;
	let lastQueryKey = '';

	let aspectRatioMax = 2.3;
	let aspectRatio = aspectRatioMin;

	let input_vector: Array<{ label: string; date: number; count: number }> = [];

	let leftSlider = 0;
	let rightSlider = 0;
	let minDate = 0;
	let maxDate = 0;
	let leftSliderOutput = '';
	let rightSliderOutput = '';

	const unsubscribeFilterActive = filterActiveStore.subscribe((value) => {
		filterActive = value.filterActive;
	});

	const unsubscribeUser = userStore.subscribe((value: any) => {
		({ primaryColor, colorPalette } = value);
		hoverColorPalette = colorPalette;
	});

	const dimensionTypes = [$t('indicatorDeactivated'), $t('indicatorActivated')];
	let selectedDimensionType = $t(initialMedian);

	const timeTypes = [
		$t('date') + ' (' + $t('months') + ')',
		$t('date') + ' (' + $t('quarters') + ')',
		$t('date') + ' (' + $t('years') + ')',
		$t('fromDiagnosis') + ' (' + $t('months') + ')',
		$t('fromDiagnosis') + ' (' + $t('quarters') + ')',
		$t('fromDiagnosis') + ' (' + $t('years') + ')'
	];

	let selectedTimeType =
		(initialDatediff ? $t('fromDiagnosis') : $t('date')) + ' (' + $t(initialTimeUnit) + ')';

	const eventTypes = [
		{ label: $t('selectionFirstOccurence'), value: 'oldest' },
		{ label: $t('representationAllOccurences'), value: 'all' },
		{ label: $t('selectionLastOccurence'), value: 'newest' }
	];

	onMount(async () => {
		await import('@samply/lens');

		handleMaximized({ detail: { headlineMaximize: maxStoreValue } });
		splitTimeDropdown();

		isMounted = true;
		await reloadChartData();
	});

	onDestroy(() => {
		unsubscribeFilterActive();
		unsubscribeUser();
		destroySlider();
		chartInstance?.destroy();
		chartInstance = null;
	});

	// Only reload when the actual backend query parameters change.
	$: if (isMounted) {
		const queryKey = JSON.stringify({
			collection,
			initialDropdownValue,
			selectedEventType,
			selectedTimeType,
			filterActive
		});

		if (queryKey !== lastQueryKey) {
			lastQueryKey = queryKey;
			reloadChartData();
		}
	}

	let lastRenderKey = '';

	// Changes that do not need a backend request should re-render the local Chart.js datasets/options.
	// Important: median indicators are datasets, not just options.
	$: if (isMounted && chartInstance) {
		const renderKey = JSON.stringify({
			selectedDimensionType,
			showLogarithmStoreValue,
			aspectRatio,
			initialDatediff,
			initialTimeUnit,
			selectedTimeType
		});

		if (renderKey !== lastRenderKey) {
			lastRenderKey = renderKey;
			createOrUpdateLineChart();
		}
	}

	$: if (isMounted) {
		dispatch('changedMedian', { selectedDimensionType });
		dispatch('changedEvent', { selectedEventType });
		dispatch('changedDropdown', { initialDropdownValue });
	}

	function handleMaximized(event: any) {
		maxStoreValue = event.detail.headlineMaximize;
		if (isMounted) {
			maximize();
		}
		aspectRatio = maxStoreValue ? aspectRatioMax : aspectRatioMin;
		createOrUpdateLineChart();
	}

	function handleLogarithmToggled(event: any) {
		showLogarithmStoreValue = event.detail.headlineInitialLogarithm;
		dispatch('logarithmToggled', { showLogarithmStoreValue });
		createOrUpdateLineChart();
	}

	function handleMedianChanged() {
		dispatch('changedMedian', { selectedDimensionType });
		createOrUpdateLineChart();
	}

	async function buildFilter() {
		let currentFilter = filter;

		if (filterActive && dataPasser) {
			currentFilter = JSON.stringify(dataPasser.getAstAPI());
		}

		return JSON.stringify(await addUserFilter(JSON.parse(currentFilter)));
	}

	async function reloadChartData() {
		showEmptyIcon = false;
		updating = true;

		const seq = ++requestSeq;

		splitTimeDropdown();
		filter = await buildFilter();

		const pcd = await getTimeChart(
			collection,
			initialDropdownValue,
			initialDatediff,
			selectedEventType,
			initialTimeUnit,
			filter
		);

		// Ignore stale responses if the user changed filters quickly.
		if (seq !== requestSeq) return;

		const newInputVector = (pcd ?? []).filter(
			(item: any) => item && item.label && item.label.trim() !== ''
		);

		if (newInputVector.length === 0) {
			input_vector = [];
			showEmptyIcon = true;
			updating = false;
			destroySlider();
			chartInstance?.destroy();
			chartInstance = null;
			return;
		}

		input_vector = newInputVector;
		lastRenderKey = '';
		setZoom();
		createOrUpdateSlider();
		createOrUpdateLineChart();

		updating = false;
	}

	function splitTimeDropdown() {
		switch (selectedTimeType) {
			case $t('date') + ' (' + $t('months') + ')':
				initialTimeUnit = 'months';
				initialDatediff = false;
				break;
			case $t('date') + ' (' + $t('quarters') + ')':
				initialTimeUnit = 'quarters';
				initialDatediff = false;
				break;
			case $t('date') + ' (' + $t('years') + ')':
				initialTimeUnit = 'years';
				initialDatediff = false;
				break;
			case $t('fromDiagnosis') + ' (' + $t('months') + ')':
				initialTimeUnit = 'months';
				initialDatediff = true;
				break;
			case $t('fromDiagnosis') + ' (' + $t('quarters') + ')':
				initialTimeUnit = 'quarters';
				initialDatediff = true;
				break;
			case $t('fromDiagnosis') + ' (' + $t('years') + ')':
				initialTimeUnit = 'years';
				initialDatediff = true;
				break;
		}

		dispatch('changedTimeUnit', { initialTimeUnit, initialDatediff });
	}

	function setZoom() {
		const dates = input_vector.map((item) => item.date);
		minDate = Math.min(...dates);
		maxDate = Math.max(...dates);
		leftSlider = minDate;
		rightSlider = maxDate;

		const { q1, q3 } = calculateDataPointQuartiles();
		const iqrRange = (q3 - q1) * 2;

		if (Number.isFinite(iqrRange)) {
			if (initialDatediff) {
				rightSlider = Math.min(iqrRange, maxDate);
			} else {
				leftSlider = Math.max(iqrRange, minDate);
			}
		}
	}

	function createOrUpdateSlider() {
		destroySlider();

		slider = document.getElementById('slider-round') as any;
		if (!slider) return;

		noUiSlider.create(slider, {
			start: [leftSlider, rightSlider],
			range: {
				min: minDate,
				max: maxDate
			}
		});

		// Slider changes should not call the backend.
		slider.noUiSlider.on('change', (values: string[], handle: number) => {
			if (handle === 0) {
				leftSlider = parseFloat(values[0]);
			} else {
				rightSlider = parseFloat(values[1]);
			}

			updateChartRangeOnly();
		});
	}

	function destroySlider() {
		if (slider?.noUiSlider) {
			slider.noUiSlider.destroy();
		}
		slider = null;
	}

	function setSliderTexts() {
		let leftSliderDate = '';
		let rightSliderDate = '';

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
			case 'quarters': {
				const leftDate = new Date(leftSlider);
				const rightDate = new Date(rightSlider);
				leftDate.setMonth(leftDate.getMonth() + 2);
				rightDate.setMonth(rightDate.getMonth() + 2);

				leftSliderDate = `Q${Math.floor(leftDate.getMonth() / 3) + 1}-${leftDate.getFullYear()}`;
				rightSliderDate = `Q${Math.floor(rightDate.getMonth() / 3) + 1}-${rightDate.getFullYear()}`;
				break;
			}
			case 'years':
				leftSliderDate = new Date(leftSlider).toLocaleDateString('en-US', { year: 'numeric' });
				rightSliderDate = new Date(rightSlider).toLocaleDateString('en-US', { year: 'numeric' });
				break;
		}

		leftSliderOutput = initialDatediff ? `${leftSlider}` : leftSliderDate;
		rightSliderOutput = initialDatediff ? `${rightSlider}` : rightSliderDate;
	}

	function buildDatasets() {
		const datasetMap = new Map<string, any>();
		const uniqueColorArray: Record<string, string> = {};

		for (const item of input_vector) {
			let dataset = datasetMap.get(item.label);

			if (!dataset) {
				const colorIndex = datasetMap.size % colorPalette.length;
				const color = colorPalette[colorIndex];

				dataset = {
					label: item.label,
					data: [],
					backgroundColor: color,
					hoverBackgroundColor: hoverColorPalette[colorIndex],
					borderColor: color,
					borderWidth: 1,
					fill: false,
					tension: 0.2,
					pointBackgroundColor: color,
					pointRadius: 3
				};

				datasetMap.set(item.label, dataset);
				uniqueColorArray[item.label] = color;
			}

			dataset.data.push({ x: item.date, y: item.count });
		}

		const datasets = [...datasetMap.values()];

		if (selectedDimensionType === $t('indicatorActivated') && initialDatediff) {
			for (const [label] of datasetMap) {
				const categoryData = input_vector.filter((item) => item.label === label);
				const medianDate = findMedianBalancePoint(categoryData);

				if (!Number.isFinite(medianDate)) continue;

				const maxY = input_vector.reduce((max, item) => Math.max(max, item.count), -Infinity);
				const color = uniqueColorArray[label];

				datasets.push({
					label: ` Median: ${label}`,
					data: [
						{ x: medianDate, y: 1 },
						{ x: medianDate, y: maxY }
					],
					backgroundColor: color,
					borderColor: hexToRgba(color, 0.5),
					borderWidth: 8,
					pointBackgroundColor: 'rgba(255, 0, 0, 0)',
					pointRadius: 3,
					borderDash: [5, 5],
					fill: false
				});
			}
		}

		return datasets;
	}

	function getXUnit() {
		switch (selectedTimeType) {
			case $t('date') + ' (' + $t('months') + ')':
				return 'month';
			case $t('date') + ' (' + $t('quarters') + ')':
				return 'quarter';
			case $t('date') + ' (' + $t('years') + ')':
				return 'year';
			default:
				return undefined;
		}
	}

	function buildChartOptions() {
		return {
			aspectRatio,
			scales: {
				x: {
					min: leftSlider,
					max: rightSlider,
					type: initialDatediff ? 'linear' : 'time',
					position: 'bottom',
					beginAtZero: true,
					title: {
						display: true,
						text: selectedTimeType
					},
					time: {
						unit: getXUnit(),
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
						text: $t('numOfSpecProgressEvents')
					}
				}
			},
			plugins: {
				tooltip: {
					callbacks: {
						label(context: any) {
							if (context.dataset.label && context.dataset.label.includes('Median')) {
								return context.dataset.label;
							}
							return context.dataset.label + ': ' + context.formattedValue;
						}
					}
				}
			}
		};
	}

	function createOrUpdateLineChart() {
		setSliderTexts();

		if (!lineCanvas) return;
		const ctx = lineCanvas.getContext('2d');
		if (!ctx) return;

		const datasets = buildDatasets();
		const options = buildChartOptions();

		if (!chartInstance) {
			chartInstance = new Chart(ctx, {
				type: 'line',
				data: { datasets },
				options: options as any
			});
			return;
		}

		chartInstance.data.datasets = datasets;
		chartInstance.options = options as any;
		chartInstance.update('none');
	}

	function updateChartRangeOnly() {
		if (!chartInstance) return;

		setSliderTexts();
		chartInstance.options.scales.x.min = leftSlider;
		chartInstance.options.scales.x.max = rightSlider;
		chartInstance.update('none');
	}

	function updateChartOptionsOnly() {
		if (!chartInstance) return;

		chartInstance.options = buildChartOptions() as any;
		chartInstance.update('none');
	}

	function findMedianBalancePoint(data: Array<{ date: number; count: number }>) {
		const sortedData = [...data].sort((a, b) => a.date - b.date);
		let leftSum = 0;
		let rightSum = sortedData.reduce((sum, item) => sum + item.count, 0);
		let medianIndex = -1;
		let minDifference = Number.MAX_VALUE;

		for (let i = 0; i < sortedData.length; i++) {
			leftSum += sortedData[i].count;
			rightSum -= sortedData[i].count;

			const currentDifference = Math.abs(leftSum - rightSum);
			if (currentDifference < minDifference) {
				minDifference = currentDifference;
				medianIndex = i;
			}
		}

		if (medianIndex === -1) return NaN;

		const medianItem1 = sortedData[medianIndex];
		const medianItem2 = sortedData[medianIndex + 1];

		if (!medianItem2) return medianItem1.date;
		return (medianItem1.date + medianItem2.date) / 2;
	}

	function hexToRgba(hex: string, alpha: number) {
		const hexColor = hex.replace(/^#/, '');
		const r = parseInt(hexColor.substring(0, 2), 16);
		const g = parseInt(hexColor.substring(2, 4), 16);
		const b = parseInt(hexColor.substring(4, 6), 16);
		return `rgba(${r},${g},${b},${alpha})`;
	}

	function calculateDataPointQuartiles() {
		const sortedTimeValues = input_vector.map((item) => item.date).sort((a, b) => a - b);
		const totalDataPoints = sortedTimeValues.length;

		return {
			q1: sortedTimeValues[Math.floor(totalDataPoints * 0.25)],
			q3: sortedTimeValues[Math.floor(totalDataPoints * 0.75)]
		};
	}

	function maximize() {
		maxStoreValue = !maxStoreValue;
		dispatch('maximized', { maxStoreValue });
	}
</script>

<Headline
	{headlineTitle}
	headlineTooltip={$t('tooltip_timeChart')}
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
		{#if dropdownObject.length > 1}
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
			<label for="event">{$t('selectionChronologicalOrder')}:</label><br />
			<select class="dropbtn" bind:value={selectedEventType}>
				{#each eventTypes as option (option.value)}
					<option class="dropdown-option" value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>

		<div class="dropdown">
			<label for="time">{$t('timeline')}:</label><br />
			<select class="dropbtn" bind:value={selectedTimeType}>
				{#each timeTypes as option}
					<option class="dropdown-option" value={option}>{option}</option>
				{/each}
			</select>
		</div>

		<div class="dropdown">
			<label for="dimension">Median:</label><br />
			<select
				class="dropbtn"
				bind:value={selectedDimensionType}
				disabled={!initialDatediff}
				on:change={handleMedianChanged}
			>
				<option class="dropdown-option" value={$t('indicatorDeactivated')}>
					{$t('indicatorDeactivated')}
				</option>
				<option class="dropdown-option" value={$t('indicatorActivated')}>
					{initialDatediff ? $t('indicatorActivated') : $t('indicatorDeactivated')}
				</option>
			</select>
		</div>
	</div>
</div>

<div style={isMounted && !updating && !showEmptyIcon ? '' : 'display: none;'}>
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
		margin-right: 10px;
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
