<script lang="ts">
	// @ts-nocheck
	import { Chart, registerables } from 'chart.js';
	import type { ChartConfiguration, ChartDataset } from 'chart.js';
	import { onMount } from 'svelte';
	import { getSurvivalFollowUpAssessment } from '../../graphQl/gql-survival';
	import Headline from '../../components/Headline.svelte';
	import { createTable, changeRowCount } from '../../tableBuilder';

	import { maxStore } from '../../store/maxStore';
	import { userStore } from '../../store/userStore';
	import annotationPlugin from 'chartjs-plugin-annotation';
	import { t, locale, locales } from "../../store/languageStore";
	import type { LensDataPasser } from "@samply/lens";
	import { configStore } from '../../store/configStore';
	import { filterActiveStore } from '../../store/filterActiveStore.js';
	import {addUserFilter} from '../../components/UserFilter'
	import { iconPath } from '$lib/path-utils';

    let filterActive = true;
    let filter = JSON.stringify({ "operand": "OR", "children": [] });
    filterActiveStore.subscribe((value) => {
        filterActive = value.filterActive; // Hier den Wert direkt zuweisen
    });

	let SurvivalFollowUpAssessmentShowChart: boolean
    let SurvivalFollowUpAssessmentShowLogarithm: boolean
	let SurvivalFollowUpAssessmentSelectedFollowUpYear: string
    let SurvivalFollowUpAssessmentIncludeTherapy: boolean
    let SurvivalFollowUpAssessmentIncludeVitaldate: boolean
    let SurvivalFollowUpAssessmentIsYearInterval: boolean
    let SurvivalFollowUpAssessmentIntervalStart: string
    let SurvivalFollowUpAssessmentIntervalEnd: string

    let intervalStart: string;
    let intervalEnd: string;

    let primaryColor: string;
	let aspectRatio = 2;
	let updating:boolean = false;
	let dataPasser: LensDataPasser;

    const loadingIcon = iconPath('spinner.svg')
    userStore.subscribe((value: any) => {
    ({ primaryColor } = value);
    });

	Chart.register(...registerables, annotationPlugin);
	// Access the store variables
	let maximizeSurvivalFollowUpAssessment: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeSurvivalFollowUpAssessment } = value);
	});
	function handleMaximized(event: any) {
		maximizeSurvivalFollowUpAssessment = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeSurvivalFollowUpAssessment =
				!storeValues.maximizeSurvivalFollowUpAssessment;
			return storeValues; // Return the updated values
		});
		setTimeout(() => {
			if (maximizeSurvivalFollowUpAssessment) {
				aspectRatio =2.1;
				changeRowCount(survivalFollowUpAssessmentTable, tableShownRowsMax);
			} else {
				changeRowCount(survivalFollowUpAssessmentTable, tableShownRows);
				aspectRatio =2;
			}
		}, 0);
	}

	let barChart: HTMLCanvasElement;
	let chartInstance: Chart;

	let survivalFollowUpAssessmentTable:any;
	let tableShownRows = 5;
	let tableShownRowsMax = 20;
	let sortingIndex = 0;

	type SurvivalFollowUpAssessment = { year: String[]; followup: Object[] };
	let inputArray: SurvivalFollowUpAssessment = {
		year: [],
		followup: []
	};
	let data: any = [];
	let columns = [{ data: 'year' }, { data: 'percentage' }, { data: 'numerator' }, { data: 'denominator' }];
	let headers = [ "Diagnosejahr", "Follow-Up", "Zähler", "Nenner" ];	//muss noch übersetzt werden

	let mounted = false;

	function isMounted() {
        return mounted;
    }

	$: {
		includeVitaldate;
		includeTherapy;
		isYearInterval;
		showLogarithm;
		selectedFollowUpYear;
		intervalStart 
		intervalEnd
		aspectRatio
		changeInterval()
		if(isMounted()){
			createBarChart();
			updateConfigStore();
		}
	}

	function updateConfigStore(){
		configStore.update((storeValues) => {
			storeValues.SurvivalFollowUpAssessmentSelectedFollowUpYear = selectedFollowUpYear;
			storeValues.SurvivalFollowUpAssessmentIncludeTherapy = includeTherapy;
            storeValues.SurvivalFollowUpAssessmentIncludeVitaldate = includeVitaldate;
            storeValues.SurvivalFollowUpAssessmentIsYearInterval = isYearInterval;
			storeValues.SurvivalFollowUpAssessmentIntervalStart = intervalStart;
			storeValues.SurvivalFollowUpAssessmentIntervalEnd = intervalEnd;
			return storeValues;
		});
	}

	inputArray = {
		year: [
			'2021',
			'2022',
			'2023'
		],
		followup: [
			{denominator: 3, numerator: 2, percentage: 20},
			{denominator: 3, numerator: 2, percentage: 20},
			{denominator: 3, numerator: 2, percentage: 20}
		]
	};

	onMount(async () => { 
		await import("@samply/lens");

		if (filterActive) {
			filter = JSON.stringify(dataPasser.getAstAPI());
		}
		filter = JSON.stringify(await addUserFilter(JSON.parse(filter)));

		getSurvivalFollowUpAssessment(intervalStart, intervalEnd, includeTherapy, includeVitaldate,filter).then((result) => {
			inputArray = result;

			// Logarithmisch transformiere die Daten
			data = inputArray.year.map((year, index) => ({
				year,
				percentage: inputArray.followup[index].percentage,
				denominator: inputArray.followup[index].denominator,
				numerator: inputArray.followup[index].numerator
			}));
			
			configStore.subscribe((value: any) => {
				SurvivalFollowUpAssessmentShowChart = value.SurvivalFollowUpAssessmentShowChart 
				SurvivalFollowUpAssessmentShowLogarithm = value.SurvivalFollowUpAssessmentShowLogarithm
				SurvivalFollowUpAssessmentSelectedFollowUpYear = value.SurvivalFollowUpAssessmentSelectedFollowUpYear
				SurvivalFollowUpAssessmentIncludeTherapy = value.SurvivalFollowUpAssessmentIncludeTherapy
				SurvivalFollowUpAssessmentIncludeVitaldate = value.SurvivalFollowUpAssessmentIncludeVitaldate
				SurvivalFollowUpAssessmentIsYearInterval = value.SurvivalFollowUpAssessmentIsYearInterval
				SurvivalFollowUpAssessmentIntervalStart = value.SurvivalFollowUpAssessmentIntervalStart
				SurvivalFollowUpAssessmentIntervalEnd = value.SurvivalFollowUpAssessmentIntervalEnd
			});

			showChart = SurvivalFollowUpAssessmentShowChart
			showLogarithm = SurvivalFollowUpAssessmentShowLogarithm
			selectedFollowUpYear = SurvivalFollowUpAssessmentSelectedFollowUpYear
			includeTherapy = SurvivalFollowUpAssessmentIncludeTherapy
			includeVitaldate = SurvivalFollowUpAssessmentIncludeVitaldate
			isYearInterval = SurvivalFollowUpAssessmentIsYearInterval
			intervalStart = SurvivalFollowUpAssessmentIntervalStart
			intervalEnd = SurvivalFollowUpAssessmentIntervalEnd


			mounted = true;
			createBarChart();
		});
	});

	function createBarChart() {
		updating = true;
		getSurvivalFollowUpAssessment(intervalStart, intervalEnd, includeTherapy, includeVitaldate, filter).then((result) => {
			let inputArray = result;
			
			let ctx = document.getElementById('chart2').getContext('2d');

			const chartConfig: ChartConfiguration = {
				type: 'bar',
				data: {
					labels: inputArray.year,
					datasets: [{
						data: inputArray.followup.map(item => item.percentage),
						backgroundColor: inputArray.followup.map(item => getFollowUpColor(primaryColor, item.percentage))
					}]
				},
				options: {
					aspectRatio: aspectRatio,
					scales: {
						x: {
							type: 'category',
							title: {
								display: true,
								text: 'Diagnosejahr'
							}
						},
						y: {
							type: showLogarithm ? 'logarithmic' : 'linear',

							title: {
								display: true,
								text: 'Anteil an Tumoren mit Follow-Up (%)'
							}
						}
					},
					plugins: {
						legend: {
							display: false // Die Legende ausblenden
						},
						annotation: {
							annotations: [{
								type: 'line',
								scaleID: 'y',
								value: 80,
								borderColor: 'tomato',
								borderWidth: 1,
								borderDash: [5, 5],
								drawTime: "afterDraw" // (default)
							}],	
						},
						tooltip: {
							callbacks: {
								label: (context) => {
									const dataset = context.dataset;
									const index = context.dataIndex;
									const percentage = Math.round(dataset.data[index] * 100) / 100; // Prozente auf zwei Nachkommastellen runden
									const numerator = inputArray.followup[index].numerator;
									const denominator = inputArray.followup[index].denominator;
									return `${percentage}% - (${numerator} / ${denominator}) - (Tumore mit FollowUp / Tumore(gesamt) im gegebenen Diagnosejahr)`;
								}
							}
						},
					},
				}
			};

			if (ctx) {
				if (chartInstance) {
					chartInstance.destroy();
				}
				chartInstance = new Chart(ctx, chartConfig);
			}
			const tableData = inputArray.year.map((year, index) => ({
				year: year,
				percentage: inputArray.followup[index]?.percentage ?? null,
				denominator: inputArray.followup[index]?.denominator ?? null,
				numerator: inputArray.followup[index]?.numerator ?? null
			}));
			survivalFollowUpAssessmentTable = createTable(
					"progress",
					dataPasser,
					'survivalFollowUpAssessmentTable',
					tableData ,
					columns,
					tableShownRows,
					sortingIndex
			);
		});



		updating = false;
	}

	function getFollowUpColor(primaryColor: string, percentage: number): string {
		// Parse the primary color to extract RGB values
		const rgbValues = primaryColor.match(/[A-Za-z0-9]{2}/g)?.map(value => parseInt(value, 16)) || [0, 0, 0];

		// Invert transparency based on percentages
		const transparency = percentage / 100;

		// Add the transparency to the primary color
		const rgbaColor = `rgba(${rgbValues[0]}, ${rgbValues[1]}, ${rgbValues[2]}, ${transparency})`;

		return rgbaColor;
	}

	let showChart: boolean = true;
	function handleChartToggled(event: any) {
		showChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.SurvivalFollowUpAssessmentShowChart= showChart;
			return storeValues;
		});
	}

	let showLogarithm: boolean = false;
	function handleLogarithmToggled(event: any) {
		showLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.SurvivalFollowUpAssessmentShowLogarithm= showLogarithm;
			return storeValues;
		});
	}
	
	const currentYear = new Date().getFullYear();
	const followUpYears = Array.from({ length: 10 }, (_, index) => currentYear - index - 1);
	let selectedFollowUpYear = currentYear - 1;

	let includeTherapy = true;
	let includeVitaldate = true;
	
    let isYearInterval = false;

    function handleIntervalButtonClick() {
        isYearInterval = !isYearInterval; 
    }

	function changeInterval() {
		if (!isYearInterval) {
			intervalStart = selectedFollowUpYear + "-01-01";
			intervalEnd = selectedFollowUpYear + "-12-31";
		}
    }
</script>

<lens-data-passer bind:this={dataPasser} />
<Headline
	headlineTitle={$t("followUpAnalysisTitle")}
	headlineTooltip={$t("tooltip_follow_up")}
	headlineMaximize={maximizeSurvivalFollowUpAssessment}
	headlineShowChart={showChart}
	headlineIsChart={true}
	headlineInitialTop5={null}
	headlineInitialLogarithm={showLogarithm}
	headlineInputTableData={data}
	headlineInputTableHeader={headers}
	headlineChartJSElement={barChart}
	headlineD3Element={null}
	on:chartToggled={handleChartToggled}
	on:logarithmToggled={handleLogarithmToggled}
	on:maximized={handleMaximized}
/>
<i>{$t("followUpDescription")}</i>
<div class="dropdown-container">
    <div class="checkbox">
        <label for="progressType">Inkl. Therapien:</label>
        <input type="checkbox" id="includeTherapy" bind:checked={includeTherapy}><br />
    </div>
	<div class="checkbox">
        <label for="progressType">Vitaldatum:</label>
        <input type="checkbox" id="includeTherapy" bind:checked={includeVitaldate}><br />
    </div>
    <div class="dropdown">
        <label for="progressType">Follow-Up-Zeitraum:</label>
        <div style={!isYearInterval ? '' : 'display: none;'}>
            <select class="dropbtn" bind:value={selectedFollowUpYear}>
                {#each followUpYears as option}
                    <option class="dropdown-option">{option}</option>
                {/each}
            </select>
        </div>

        <div style={isYearInterval ? '' : 'display: none;'}>
            <input class="input-field" bind:value={intervalStart} type="date" name="diagnose-date" id="diagnose-date-from" />
            <input class="input-field" bind:value={intervalEnd} type="date" name="diagnose-date" id="diagnose-date-to" />
        </div>

        <button class="switchButton" on:click={handleIntervalButtonClick}>
            {isYearInterval ? 'Jahr' : 'Freies Intervall'}
        </button>
    </div>
</div>

<div style={(!mounted || updating)? '' : 'display: none;'} class="bigSpinnerContainer">
	<button class="bigSpinnerButton" style="height:720px"><img class="bigSpinner"  id="spinner" src={loadingIcon} alt="Spinner"></button>
</div>

<div style={(mounted && !updating) ? '' : 'display: none;'}>
	<div style={showChart ? '' : 'display: none;'}>
		<div class="chart-container">
			<canvas id="chart2" bind:this={barChart} />
		</div>
	</div>
</div>
<div style={!showChart ? '' : 'display: none;'}>
	<div class="data-table">
		<table id="survivalFollowUpAssessmentTable" class="display" style="width:100%">
			<thead>
				<tr>
					<!-- Bei der Übersetzung muss dies noch in variable headers geändert werden. -->
					<th>Diagnosejahr</th>
					<th>Follow-Up</th>
					<th>Zähler</th>
					<th>Nenner</th>
				</tr>
			</thead>
		</table>
	</div>
</div>

<style>
    .dropdown-container {
        display: flex; /* Flexbox verwenden */
        align-items: center; /* Elemente vertikal zentrieren */
    }

    .checkbox {
        margin-right: 20px; /* Abstand zwischen Checkbox und Dropdown */
    }

    .dropdown {
        display: flex; /* Flexbox für Dropdown verwenden */
        align-items: center; /* Elemente vertikal zentrieren */
        margin-left: auto; /* Dropdown ganz nach rechts ausrichten */
    }

    .dropbtn {
        width: 80px; /* Breite des Dropdown-Buttons */
		margin-left: 5px;
		margin-right: 5px;
    }

    .input-field {
        width: 90px; /* Breite der Eingabefelder */
		margin-left: 5px;
    }

    .switchButton {
        width: 120px; /* Breite des Schaltflächen-Buttons */
		margin-right: 5px;
		cursor: pointer;
    }
</style>
