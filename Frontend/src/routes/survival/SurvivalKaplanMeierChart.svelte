<script lang="ts">
	import {
		KaplanMeierWithGrouping,
		InitSvg,
		dsurv,
		getDaysDivider
	} from './kaplan-meier-chart-function';
	//import { vecin as vecin_import } from './MockDataExampleQuery.js';
	import { onMount } from 'svelte';

	import { getSurvivalKaplanMeierChart } from '../../graphQl/gql-survival';
	import Headline from '../../components/Headline.svelte';
	import { maxStore } from '../../store/maxStore';
	import { userStore } from '../../store/userStore';
	import noUiSlider from 'nouislider';
	import '../../nouislider.css';
	import { createTable, changeRowCount } from '../../tableBuilder';
	import { t, locale, locales } from '../../store/languageStore';
	import type { LensDataPasser } from '@samply/lens';
	import { filterActiveStore } from '../../store/filterActiveStore.js';
	import { configStore } from '../../store/configStore';
	import { addUserFilter } from '../../components/UserFilter';
	import { iconPath } from '$lib/path-utils';

	let SurvivalKaplanMeierChartShowChart: boolean;
	let SurvivalKaplanMeierChartSelectedTimeType: string;
	let SurvivalKaplanMeierChartSelectedChartType: string;
	let SurvivalKaplanMeierChartSelectedConfidenceType: string;
	let SurvivalKaplanMeierChartSelectedStratificationType: string;

	let dataPasser: LensDataPasser;
	const loadingIcon = iconPath('spinner.svg');
	let updating: boolean = false;
	let primaryColor: string;
	let colorPalette: string[];

	// i18n labels passed down to the D3 drawing functions
	let kmI18n: any;
	$: kmI18n = {
		yAxisSurvivalProbability: $t('survivalProbability'),
		tooltipGroup: $t('group'),
		tooltipTime: $t('time'),
		tooltipSurvivalProbability: $t('survivalProbability'),
		tooltipLowerCI: $t('lowerConfidenceInterval'),
		tooltipUpperCI: $t('upperConfidenceInterval'),
		legendUnspecified: $t('unspecified'),
		legendOther: $t('other'),
		legendNoEntry: $t('noEntry'),
		xAxisDays: $t('days'),
		xAxisMonths: $t('months'),
		xAxisYears: $t('years')
	};
	let slider: any; // 'as any' Typumwandlung

	let leftSlider: number = 0; // Adjust the minimum value as needed
	let rightSlider: number = 30; // Adjust the maximum value as needed
	let minDate: number = 0;
	let maxDate: number = 50;
	let leftSliderOutput: number = 0; // Adjust the minimum value as needed
	let rightSliderOutput: number = 30; // Adjust the maximum value as needed

	async function setSlider(vecin: any) {
		let min = Infinity;
		let max = -Infinity;
		for (let i = 0; i < vecin.length; ++i) {
			const dateDiff = vecin[i].dateDiff;
			if (dateDiff < min) min = dateDiff;
			if (dateDiff > max) max = dateDiff;
		}
		minDate = min;
		maxDate = max;
		leftSlider = minDate;
		rightSlider = maxDate;

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
			updateSliderOutput();
			requestRenderChart(false);
		});
	}

	function destroySlider() {
		if (slider) {
			slider.noUiSlider.destroy(); // Zerstört den bestehenden Slider
		}
	}

	function updateSliderOutput() {
		let daysDivider: number = 1;

		switch (selectedTimeType) {
			case 'Monat':
				daysDivider = 30.44;
				break;
			case 'Jahr':
				daysDivider = 365;
				break;
			default:
				break;
		}

		leftSliderOutput = Math.round(leftSlider / daysDivider);
		rightSliderOutput = Math.round(rightSlider / daysDivider);
	}

	userStore.subscribe((value: any) => {
		({ primaryColor, colorPalette } = value);
	});

	// Access the store variables
	let currentWidth = 900;
	let maximizeSurvivalKaplanMeierChart: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeSurvivalKaplanMeierChart } = value);
	});

	function handleMaximized(event: any) {
		maximizeSurvivalKaplanMeierChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeSurvivalKaplanMeierChart = !storeValues.maximizeSurvivalKaplanMeierChart;
			return storeValues; // Return the updated values
		});
		setTimeout(() => {
			if (maximizeSurvivalKaplanMeierChart) {
				currentWidth = 1600;
			} else {
				currentWidth = 900;
			}
		}, 0);
	}

	const chartTypes = [
		{ label: $t('overallSurvival'), value: 'overallSurvival' },
		{ label: 'Im Test: Rezidivfreies Überleben', value: 'recurrence' },
		{ label: 'Im Test: Metastasefreies Überleben', value: 'metastasis' },
		{ label: 'Im Test: Überleben ab Progression', value: 'postprogression' },
		{ label: 'Im Test: Progressionsfreies Überleben', value: 'progression' },
		{ label: 'Im Test: Diesease Free Survival', value: 'dfs' }
	];
	let selectedChartType = 'overallSurvival';

	const stratificationTypes = [
		{ label: $t('noStratification'), value: 'none' },
		{ label: $t('gender'), value: 'gender' },
		{ label: $t('KM_UICC'), value: 'UICC' },
		{ label: $t('KM_T'), value: 'TStage' }
		//	{ label: 'Altersgruppe (in Arbeit)', value: 'age' },
		//	{ label: 'Metastase bei Diagnose (in Arbeit)', value: 'metastasisStrat' }
	];
	let selectedStratificationType = 'none';

	const timeTypes = [
		{ label: $t('month'), value: 'Monat' },
		{ label: $t('day'), value: 'Tag' },
		{ label: $t('year'), value: 'Jahr' }
	];
	let selectedTimeType = 'Jahr';

	const confidenceTypes = [
		{ label: $t('km_conf_none'), value: 'Kein Konf.-Intervall' },
		{ label: $t('km_conf_95'), value: '95% Konf.-Intervall' },
		{ label: $t('km_conf_95_log'), value: '95% Log Konf.-Intervall' },
		{ label: $t('km_conf_95_loglog'), value: '95% Loglog Konf-Intervall' }
	];
	let selectedConfidenceType = 'Kein Konf.-Intervall';

	let vecin: any[] = [];
	let cachedVec: any[] = [];
	let lastDataKey = '';
	let lastKmKey = '';
	let cachedGroupSlices = new Map<any, any[]>();
	let cachedGroupCensorSlices = new Map<any, any[]>();
	let cachedGroupDrawSlices = new Map<any, any[]>();
	let cachedGroupDrawCensorSlices = new Map<any, any[]>();
	let cachedGroupHasConfidenceInterval = new Map<any, boolean>();
	let cachedGroupVec: any[] = [];
	let cachedTimeExtent: [number, number] | undefined;
	let renderScheduled = false;
	let scheduledTableRebuild = false;
	let paintScheduled = false;
	let tableDataKey = '';
	let renderedTableDataKey = '';
	let paintRequestId = 0;
	let svgContainer: any;
	let mounted = false;

	onMount(async () => {
		await import('@samply/lens');

		configStore.subscribe((value: any) => {
			SurvivalKaplanMeierChartShowChart = value.SurvivalKaplanMeierChartShowChart;
			SurvivalKaplanMeierChartSelectedTimeType = value.SurvivalKaplanMeierChartSelectedTimeType;
			SurvivalKaplanMeierChartSelectedChartType = value.SurvivalKaplanMeierChartSelectedChartType;
			SurvivalKaplanMeierChartSelectedConfidenceType =
				value.SurvivalKaplanMeierChartSelectedConfidenceType;
			SurvivalKaplanMeierChartSelectedStratificationType =
				value.SurvivalKaplanMeierChartSelectedStratificationType;
		});
		showChart = SurvivalKaplanMeierChartShowChart;
		selectedTimeType = SurvivalKaplanMeierChartSelectedTimeType;
		selectedChartType = SurvivalKaplanMeierChartSelectedChartType;
		selectedConfidenceType = SurvivalKaplanMeierChartSelectedConfidenceType;
		selectedStratificationType = SurvivalKaplanMeierChartSelectedStratificationType;

		mounted = true;
		//Wird zum plotten benötigt!
		svgContainer = document.querySelector('#Plot');
	});

	$: {
		if (
			selectedChartType ||
			selectedStratificationType ||
			selectedTimeType ||
			selectedConfidenceType ||
			currentWidth
		) {
			if (mounted) {
				requestPaintChart();
				updateSliderOutput();
				updateConfigStore();
			}
		}
	}

	function updateConfigStore() {
		configStore.update((storeValues) => {
			storeValues.SurvivalKaplanMeierChartSelectedTimeType = selectedTimeType;
			storeValues.SurvivalKaplanMeierChartSelectedChartType = selectedChartType;
			storeValues.SurvivalKaplanMeierChartSelectedConfidenceType = selectedConfidenceType;
			storeValues.SurvivalKaplanMeierChartSelectedStratificationType = selectedStratificationType;
			return storeValues;
		});
	}

	function getfirstPaintDone() {
		return firstPaintDone;
	}

	let firstPaintDone = false;
	let survivalKaplanMeierTable: any;
	let tableShownRows = 19;
	let sortingIndex = 2;
	let sortingDirection = 'desc';

	let columns = [
		{ data: 'tumorID', header: $t('tumorID') },
		{ data: 'time', header: $t('time') },
		{ data: 'event', header: $t('event') },
		{ data: 'nevent', header: $t('kmTable_cumEvents') },
		{ data: 'ncensor', header: $t('kmTable_cumCensors') },
		{ data: 'n', header: $t('kmTable_atRisk') },
		{ data: 'surv', header: $t('kmTable_survival') },
		{ data: 'upper', header: $t('kmTable_upperCI') },
		{ data: 'lower', header: $t('kmTable_lowerCI') },
		{ data: 'group', header: $t('kmTable_group') }
	];

	const headers =
		columns.length > 0 && columns.some((column) => column.header)
			? columns.map((column) => column.header) // Use actual headers if available
			: columns.map((_, index) => `col${index + 1}`); // Fallback to default column names

	let tableData: any;
	let reorderedTableData: any;

	function formatiereObjektMitZweiNachkommastellen(obj: any) {
		for (const key in obj) {
			if (key !== 'group' && typeof obj[key] === 'number') {
				obj[key] = parseFloat(obj[key].toFixed(2));
			}
		}
	}

	let filterActive = true;
	// Abonnieren des filterActiveStore und den Wert aktualisieren
	filterActiveStore.subscribe((value) => {
		filterActive = value.filterActive; // Hier den Wert direkt zuweisen
	});
	let filter = JSON.stringify({ operand: 'OR', children: [] });

	async function paintChart() {
		const requestId = ++paintRequestId;
		updating = true;
		let currentFilter = filter;
		if (filterActive) {
			currentFilter = JSON.stringify(dataPasser.getAstAPI());
		}
		currentFilter = JSON.stringify(await addUserFilter(JSON.parse(currentFilter)));
		const dataKey = `${selectedChartType}|${selectedStratificationType}|${currentFilter}`;

		if (vecin.length === 0 || dataKey !== lastDataKey) {
			filter = currentFilter;
			const result = await getSurvivalKaplanMeierChart(
				selectedChartType,
				selectedStratificationType,
				filter
			);
			if (requestId !== paintRequestId) return;

			vecin = result.filter((element: null) => element !== null);
			vecin = vecin.filter((entry) => entry.status !== 2);
			cachedVec = [];
			cachedGroupSlices = new Map<any, any[]>();
			cachedGroupCensorSlices = new Map<any, any[]>();
			cachedGroupDrawSlices = new Map<any, any[]>();
			cachedGroupDrawCensorSlices = new Map<any, any[]>();
			cachedGroupHasConfidenceInterval = new Map<any, boolean>();
			cachedGroupVec = [];
			cachedTimeExtent = undefined;
			tableDataKey = '';
			renderedTableDataKey = '';
			lastKmKey = '';
			lastDataKey = dataKey;
			if (!firstPaintDone) {
				setSlider(vecin);
			}
		}
		renderChart(true);
	}

	function requestPaintChart() {
		if (paintScheduled) return;
		paintScheduled = true;
		setTimeout(() => {
			paintScheduled = false;
			paintChart();
		}, 0);
	}

	function requestRenderChart(rebuildTable = true) {
		scheduledTableRebuild = scheduledTableRebuild || rebuildTable;
		if (renderScheduled) return;
		renderScheduled = true;
		setTimeout(() => {
			const shouldRebuildTable = scheduledTableRebuild;
			renderScheduled = false;
			scheduledTableRebuild = false;
			renderChart(shouldRebuildTable);
		}, 0);
	}

	function renderChart(rebuildTable = true) {
		if (!vecin.length) {
			updating = false;
			return;
		}
		if (svgContainer) {
			svgContainer.innerHTML = ''; // Lösche den Inhalt des SVG-Containers
		}

		// Befülle die GVEV Werte mit den aktuellen Gruppen Werten der Stratifikation z.B. M, F usw.
		if (!cachedGroupVec.length) {
			cachedGroupVec = sortGroupsForLegend(extractUniqueGroups(vecin), selectedStratificationType);
		}
		const gvec = cachedGroupVec;
		const kmKey = `${lastDataKey}|${selectedConfidenceType}`;
		if (!cachedVec.length || lastKmKey !== kmKey) {
			const groupedKm = KaplanMeierWithGrouping(vecin, gvec, selectedConfidenceType);
			cachedVec = groupedKm.vec;
			cachedGroupSlices = groupedKm.groupedRows;
			cachedGroupCensorSlices = groupedKm.groupedCensorRows;
			cachedGroupDrawSlices = groupedKm.groupedDrawRows;
			cachedGroupDrawCensorSlices = groupedKm.groupedDrawCensorRows;
			cachedGroupHasConfidenceInterval = groupedKm.groupHasConfidenceInterval;
			cachedTimeExtent = groupedKm.extent;
			tableDataKey = '';
			renderedTableDataKey = '';
			lastKmKey = kmKey;
		}

		let { x, y, svg } = InitSvg(
			gvec,
			cachedVec,
			selectedTimeType,
			selectedStratificationType,
			currentWidth,
			colorPalette,
			leftSlider,
			rightSlider,
			kmI18n,
			cachedTimeExtent
		);

		for (let i = 0; i < gvec.length; ++i) {
			dsurv(
				gvec[i],
				i,
				cachedVec,
				svg,
				x,
				y,
				colorPalette,
				leftSlider,
				selectedTimeType,
				kmI18n,
				cachedGroupSlices.get(gvec[i]),
				cachedGroupCensorSlices.get(gvec[i]),
				cachedGroupHasConfidenceInterval.get(gvec[i]),
				cachedGroupDrawSlices.get(gvec[i]),
				cachedGroupDrawCensorSlices.get(gvec[i])
			);
		}
		updating = false;
		firstPaintDone = true;

		buildExportTableData();
		if (rebuildTable && !showChart) {
			initializeDataTable();
		}
	}

	function buildExportTableData() {
		const nextTableDataKey = `${lastKmKey}|${selectedTimeType}`;
		if (tableDataKey === nextTableDataKey) return;

		const daysDivider = getDaysDivider(selectedTimeType);
		const hideConfidenceInterval = selectedConfidenceType === 'Kein Konf.-Intervall';
		tableData = [];
		reorderedTableData = [];

		for (let i = 0; i < cachedVec.length; ++i) {
			const entry = cachedVec[i];
			if (entry.event === 2 || entry.status === 2) continue;

			const row = { ...entry, time: entry.time / daysDivider };
			formatiereObjektMitZweiNachkommastellen(row);
			if (row.event === 0) {
				row.event = 'Zensur';
			} else if (row.event === 1) {
				row.event = $t('event');
			}
			if (hideConfidenceInterval) {
				row.upper = '';
				row.lower = '';
			}

			tableData.push(row);

			const reorderedRow = {};
			for (let columnIndex = 0; columnIndex < columns.length; ++columnIndex) {
				const column = columns[columnIndex];
				reorderedRow[column.data] = row[column.data];
			}
			reorderedTableData.push(reorderedRow);
		}

		tableDataKey = nextTableDataKey;
	}

	function initializeDataTable() {
		if (!tableData || renderedTableDataKey === tableDataKey) return;

		survivalKaplanMeierTable = createTable(
			'kaplanMeier',
			dataPasser,
			'survivalKaplanMeierTable',
			tableData,
			columns,
			tableShownRows,
			sortingIndex,
			sortingDirection
		);
		renderedTableDataKey = tableDataKey;
	}

	function extractUniqueGroups(data: any[]): string[] {
		const uniqueGroupSet = new Set<string>();

		data.forEach((item) => {
			uniqueGroupSet.add(item.groupe);
		});
		return Array.from(uniqueGroupSet);
	}

	function sortGroupsForLegend(gvec: any[], stratType: string) {
		const orders: Record<string, string[]> = {
			TStage: ['1', '2', '3', '4', 'Sonstige', 'Ohne Eintrag'],
			UICC: ['I', 'II', 'III', 'IV', 'Sonstige', 'Ohne Eintrag']
		};
		const order = orders[stratType];
		if (!order) return gvec;
		const rank = new Map(order.map((v, i) => [v, i]));
		return [...gvec].sort((a: any, b: any) => {
			const sa = String(a);
			const sb = String(b);
			const ra = rank.has(sa) ? rank.get(sa)! : 999;
			const rb = rank.has(sb) ? rank.get(sb)! : 999;
			if (ra !== rb) return ra - rb;
			return sa.localeCompare(sb, 'de');
		});
	}

	let showChart: boolean = true;
	function handleChartToggled(event: any) {
		showChart = event.detail.headlineShowChart;
		if (!showChart) {
			setTimeout(initializeDataTable, 0);
		}
		configStore.update((storeValues) => {
			storeValues.SurvivalKaplanMeierChartShowChart = showChart;
			return storeValues;
		});
	}
</script>

<Headline
	headlineTitle={$t('kaplanMeierTitle')}
	headlineTooltip={$t('tooltip_kaplanmeier')}
	headlineMaximize={maximizeSurvivalKaplanMeierChart}
	headlineShowChart={showChart}
	headlineIsChart={true}
	headlineInitialTop5={null}
	headlineInitialLogarithm={null}
	headlineInputTableData={reorderedTableData}
	headlineInputTableHeader={headers}
	headlineChartJSElement={null}
	headlineD3Element={svgContainer}
	on:maximized={handleMaximized}
	on:chartToggled={handleChartToggled}
/>
<lens-data-passer bind:this={dataPasser} />
<div class="straight-line-container">
	<div class="dropdown-container">
		<div>
			<label for="chartType">{$t('kmType')}:</label>
			<div class="dropdown">
				<select class="dropbtn" bind:value={selectedChartType}>
					{#each chartTypes as option (option.value)}
						<option class="dropdown-option" value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
		</div>

		<div>
			<label for="confidence">{$t('confidenceIntervals')}:</label>
			<div class="dropdown">
				<select class="dropbtn" bind:value={selectedConfidenceType}>
					{#each confidenceTypes as option (option.value)}
						<option class="dropdown-option" value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
		</div>

		<div>
			<label for="time">{$t('timeline')}:</label>
			<div class="dropdown">
				<select class="dropbtn" bind:value={selectedTimeType}>
					{#each timeTypes as option (option.value)}
						<option class="dropdown-option" value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
		</div>

		<div>
			<label for="chartType">{$t('stratification')}:</label>
			<div class="dropdown">
				<select class="dropbtn" bind:value={selectedStratificationType}>
					{#each stratificationTypes as option (option.value)}
						<option class="dropdown-option" value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
		</div>
	</div>
</div>
<div style={showChart ? '' : 'display: none;'}>
	<div class="km-tooltip" id="tooltip" />
	<div style={mounted && !updating ? '' : 'display: none;'}>
		<div class="chart-container">
			<div id="Plot" />
		</div>
		<div class="straight-line-container">
			<span class="min-slider">{leftSliderOutput}</span>
			<div class="slider-container">
				<div id="slider-round" />
			</div>
			<span class="max-slider">{rightSliderOutput}</span>
		</div>
	</div>
</div>

<div style={!mounted || updating ? '' : 'display: none;'} class="bigSpinnerContainer">
	<button class="bigSpinnerButton" style="height:720px"
		><img class="bigSpinner" id="spinner" src={loadingIcon} alt="Spinner" /></button
	>
</div>

<div style={!showChart ? '' : 'display: none;'}>
	<div class="data-table">
		<table id="survivalKaplanMeierTable" class="display" style="width:100%">
			<thead>
				<tr>
					<th>{$t('tumorID')}</th>
					<th>{$t('time')}</th>
					<th>{$t('event')}</th>
					<th>{$t('kmTable_cumEvents')}</th>
					<th>{$t('kmTable_cumCensors')}</th>
					<th>{$t('kmTable_atRisk')}</th>
					<th>{$t('kmTable_survival')}</th>
					<th>{$t('kmTable_upperCI')}</th>
					<th>{$t('kmTable_lowerCI')}</th>
					<th>{$t('kmTable_group')}</th>
				</tr>
			</thead>
		</table>
	</div>
</div>

<style>
	@import 'datatables.net-dt/css/jquery.dataTables.css';
	.dropdown-container {
		display: flex;
		flex: 1;
		margin-right: 10px;
	}

	.dropdown-container > div {
		margin-right: 10px;
		flex: 1;
	}

	.km-tooltip {
		overflow: visible;
		position: absolute;
		background-color: rgba(0, 0, 0, 0.8);
		color: white;
		padding: 5px;
		border-radius: 5px;
		font-size: 12px;
		display: none;
		white-space: nowrap;
		z-index: 100;
	}

	.slider-container {
		flex: 60%;
		padding-left: 5%;
		padding-right: 5%;
		padding-bottom: 10px;
		padding-top: 5px;
	}

	.min-slider {
		padding-left: 5%;
	}
	.max-slider {
		padding-right: 5%;
	}
</style>
