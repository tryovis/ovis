<script lang="ts">
	import { KaplanMeier, InitSvg, dsurv } from './kaplan-meier-chart-function';
	//import { vecin as vecin_import } from './MockDataExampleQuery.js';
	import { onMount } from 'svelte';

	import { getSurvivalKaplanMeierChart } from '../../graphQl/gql-survival';
	import Headline from '../../components/Headline.svelte'
	import { maxStore } from '../../store/maxStore';
	import { userStore } from '../../store/userStore';
	import noUiSlider from 'nouislider';
	import '../../nouislider.css';
	import { createTable, changeRowCount } from '../../tableBuilder';
	import { t, locale, locales } from "../../store/languageStore";
	import type { LensDataPasser } from "@samply/lens";
	import { filterActiveStore } from '../../store/filterActiveStore.js';
    import { configStore } from '../../store/configStore';
	import {addUserFilter} from '../../components/UserFilter'
	import { iconPath } from '$lib/path-utils';

    let SurvivalKaplanMeierChartShowChart: boolean
    let SurvivalKaplanMeierChartSelectedTimeType: string
    let SurvivalKaplanMeierChartSelectedChartType: string
    let SurvivalKaplanMeierChartSelectedConfidenceType: string
    let SurvivalKaplanMeierChartSelectedStratificationType: string

	let dataPasser: LensDataPasser;
	const loadingIcon = iconPath('spinner.svg')
	let updating:boolean = false;
	let primaryColor: string;
	let colorPalette: string[];
	
	// i18n labels passed down to the D3 drawing functions
	let kmI18n: any;
	$: kmI18n = ({
		yAxisSurvivalProbability: $t("survivalProbability"),
		tooltipGroup: $t("group"),
		tooltipTime: $t("time"),
		tooltipSurvivalProbability: $t("survivalProbability"),
		tooltipLowerCI: $t("lowerConfidenceInterval"),
		tooltipUpperCI: $t("upperConfidenceInterval"),
		legendUnspecified: $t("unspecified"),
		legendOther: $t("other"),
		legendNoEntry: $t("noEntry"),
		xAxisDays: $t("days"),
		xAxisMonths: $t("months"),
		xAxisYears: $t("years")
	});
let slider: any; // 'as any' Typumwandlung

	let leftSlider: number = 0; // Adjust the minimum value as needed
	let rightSlider: number = 30; // Adjust the maximum value as needed
	let minDate: number = 0;
    let maxDate: number = 50;
	let leftSliderOutput: number = 0; // Adjust the minimum value as needed
	let rightSliderOutput: number = 30; // Adjust the maximum value as needed

	async function setSlider(vecin: any) {
		minDate = Math.min(...vecin.map((item:any) => item.dateDiff));
    	maxDate = Math.max(...vecin.map((item:any) => item.dateDiff));
		console.log("min",minDate, "max", maxDate)
		leftSlider = minDate;
    	rightSlider = maxDate;

   		destroySlider(); // Zerstört den vorhandenen Slider, falls vorhanden
    	slider = document.getElementById('slider-round') as any; // 'as any' Typumwandlung
    	noUiSlider.create(slider, {
    		start: [leftSlider, rightSlider],
    		range: {
    			min: minDate,
    			max: maxDate,
    		}
    	});

    	// Binden Sie das 'slide'-Event an den Slider und rufen Sie handleSliderChange auf
		slider.noUiSlider.on('change', (values: string[], handle: number) => {
			if (handle === 0) {
				leftSlider = parseFloat(values[0]);
				
			} else {
				rightSlider = parseFloat(values[1]);
			}
			paintChart()
			updateSliderOutput();
		});
	}

	function destroySlider() {
		if (slider) {
			slider.noUiSlider.destroy(); // Zerstört den bestehenden Slider
		}
	}

	function updateSliderOutput() {
		let daysDivider:number = 1;

		switch (selectedTimeType) {
			case "Monat":
				daysDivider = 30.44
				break;
			case "Jahr":
				daysDivider = 365
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
        ({ maximizeSurvivalKaplanMeierChart} = value);
    });

	function handleMaximized(event: any) {
		maximizeSurvivalKaplanMeierChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeSurvivalKaplanMeierChart = !storeValues.maximizeSurvivalKaplanMeierChart;
			return storeValues; // Return the updated values
		});
		setTimeout(() => {
			if (maximizeSurvivalKaplanMeierChart) {
				currentWidth = 1600
			} else {
				currentWidth = 900
			}
    	}, 0);
	}

	const chartTypes = [
		{ label: $t("overallSurvival"), value: 'overallSurvival' },
		{ label: 'Im Test: Rezidivfreies Überleben', value: 'recurrence' },
		{ label: 'Im Test: Metastasefreies Überleben', value: 'metastasis' },
		{ label: 'Im Test: Überleben ab Progression', value: 'postprogression' },
		{ label: 'Im Test: Progressionsfreies Überleben', value: 'progression' },
		{ label: 'Im Test: Diesease Free Survival', value: 'dfs' }
	];
	let selectedChartType = 'overallSurvival';

	const stratificationTypes = [
		{ label: $t("noStratification"), value: 'none' },
		{ label: $t("gender"), value: 'gender' },
		{ label: $t("KM_UICC"), value: 'UICC' },
		{ label: $t("KM_T"), value: 'TStage' },
	//	{ label: 'Altersgruppe (in Arbeit)', value: 'age' },
	//	{ label: 'Metastase bei Diagnose (in Arbeit)', value: 'metastasisStrat' }
	];
	let selectedStratificationType = 'none';
  
	const timeTypes = [
		{ label: $t("month"), value: 'Monat' },
		{ label: $t("day"), value: 'Tag' },
		{ label: $t("year"), value: 'Jahr' }
	];
	let selectedTimeType = 'Jahr';
  
	const confidenceTypes = [
		{ label: $t("km_conf_none"), value: 'Kein Konf.-Intervall' },
		{ label: $t("km_conf_95"), value: '95% Konf.-Intervall' },
		{ label: $t("km_conf_95_log"), value: '95% Log Konf.-Intervall' },
		{ label: $t("km_conf_95_loglog"), value: '95% Loglog Konf-Intervall' }
	];
	let selectedConfidenceType = 'Kein Konf.-Intervall';
  
	let vecin: any[] = [];
	let svgContainer:any
	let svgElement:any
	let mounted = false;

	onMount(async () => {
		await import("@samply/lens");

        configStore.subscribe((value: any) => {
		    SurvivalKaplanMeierChartShowChart = value.SurvivalKaplanMeierChartShowChart;
            SurvivalKaplanMeierChartSelectedTimeType = value.SurvivalKaplanMeierChartSelectedTimeType;
            SurvivalKaplanMeierChartSelectedChartType = value.SurvivalKaplanMeierChartSelectedChartType;
            SurvivalKaplanMeierChartSelectedConfidenceType  = value.SurvivalKaplanMeierChartSelectedConfidenceType ;
            SurvivalKaplanMeierChartSelectedStratificationType = value.SurvivalKaplanMeierChartSelectedStratificationType;
	    });
        showChart = SurvivalKaplanMeierChartShowChart;
		selectedTimeType = SurvivalKaplanMeierChartSelectedTimeType
		selectedChartType = SurvivalKaplanMeierChartSelectedChartType
		selectedConfidenceType = SurvivalKaplanMeierChartSelectedConfidenceType 
		selectedStratificationType = SurvivalKaplanMeierChartSelectedStratificationType

		mounted = true;
		//Wird zum plotten benötigt!
		svgContainer = document.querySelector("#Plot");
	});
  
	$: {
	  if (selectedChartType || selectedStratificationType || selectedTimeType || selectedConfidenceType || currentWidth) {


		if(mounted){
			paintChart();
			updateSliderOutput();
			updateConfigStore();
		}
	  }
	}

	function updateConfigStore(){
		configStore.update((storeValues) => {
			storeValues.SurvivalKaplanMeierChartSelectedTimeType = selectedTimeType;
            storeValues.SurvivalKaplanMeierChartSelectedChartType = selectedChartType;
            storeValues.SurvivalKaplanMeierChartSelectedConfidenceType = selectedConfidenceType;
			storeValues.SurvivalKaplanMeierChartSelectedStratificationType = selectedStratificationType;
			return storeValues;
		});
	}

	function getfirstPaintDone(){
		return firstPaintDone
	}
  
	let firstPaintDone = false;
	let survivalKaplanMeierTable: any;
	let tableShownRows = 19;
	let sortingIndex = 2;
	let sortingDirection = "desc";

	let columns = [
		{ data: 'tumorID', header: $t("tumorID") },
		{ data: 'time', header: $t("time") },
		{ data: 'event', header: $t("event") },
		{ data: 'nevent', header: $t("kmTable_cumEvents") },
		{ data: 'ncensor', header: $t("kmTable_cumCensors") },
		{ data: 'n', header: $t("kmTable_atRisk") },
		{ data: 'surv', header: $t("kmTable_survival") },
		{ data: 'upper', header: $t("kmTable_upperCI") },
		{ data: 'lower', header: $t("kmTable_lowerCI") },
		{ data: 'group', header: $t("kmTable_group") } 
	];

	const headers = columns.length > 0 && columns.some(column => column.header)
		? columns.map(column => column.header)  // Use actual headers if available
		: columns.map((_, index) => `col${index + 1}`);  // Fallback to default column names
			
	let tableData: any;
	let reorderedTableData: any;

	function formatiereObjektMitZweiNachkommastellen(obj:any) {
		for (const key in obj) {
			if (key !== "group" && typeof obj[key] === 'number') {
				obj[key] = parseFloat(obj[key].toFixed(2));
			}
		}
	}

	let filterActive = true;
	// Abonnieren des filterActiveStore und den Wert aktualisieren
	filterActiveStore.subscribe((value) => {
		filterActive = value.filterActive; // Hier den Wert direkt zuweisen
	});
	let filter = JSON.stringify({ "operand": "OR", "children": [] });

	async function paintChart() {
		if (svgContainer) {
			svgContainer.innerHTML = ''; // Lösche den Inhalt des SVG-Containers
			svgElement = svgContainer.querySelector("svg");
		}
		updating = true;
		if (filterActive) {
			filter = JSON.stringify(dataPasser.getAstAPI());
		} 
		filter = JSON.stringify(await addUserFilter(JSON.parse(filter)));
		
		const result = await getSurvivalKaplanMeierChart(selectedChartType, selectedStratificationType, filter);
		console.log("KM Erstes Result", result);

        vecin = result.filter((element:null) => element !== null);
		vecin = vecin.filter((entry) => entry.status !== 2); 
		console.log("KM Zweites Result", vecin)
		if (!firstPaintDone) {
			setSlider(vecin);
    	}
		
		// Befülle die GVEV Werte mit den aktuellen Gruppen Werten der Stratifikation z.B. M, F usw.
		var gvec = sortGroupsForLegend(extractUniqueGroups(vecin), selectedStratificationType);
		var vec = KaplanMeier(vecin, gvec, selectedConfidenceType);
		console.log("VECIN", vecin)
		console.log("VEC", vec)

		let { x, y, svg } = InitSvg(gvec, vec, selectedTimeType, selectedStratificationType, currentWidth, colorPalette, leftSlider, rightSlider, kmI18n);
		
		for (let i = 0; i < gvec.length; ++i) {
			dsurv(gvec[i], i, vec, svg, x, y, colorPalette, leftSliderOutput, selectedTimeType, kmI18n);
		}
		updating = false;
		firstPaintDone = true;

		tableData = vec;
		tableData.forEach(formatiereObjektMitZweiNachkommastellen);
			
		tableData = tableData.filter((entry) => entry.event !== 2); // Entferne Einträge, bei denen event gleich 2 ist => Dies ist der Startpunkt
		tableData = tableData.filter((entry) => entry.status !== 2); 
		tableData.forEach((entry) => {
			if (entry.event === 0) {
				entry.event = 'Zensur';
			} else if (entry.event === 1) {
				entry.event = $t("event");
			}
		});
		console.log("Survival Columns", columns)

		const updateTableData = (selectedConfidenceType, tableData) => {
			if (selectedConfidenceType === 'Kein Konf.-Intervall') {
				tableData = tableData.map(row => ({
					...row,
					upper: '',
					lower: ''
				}));
			}
			return tableData;
		};

		tableData = updateTableData(selectedConfidenceType, tableData);

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

		// Function to reorder tableData based on columns. This is necessary for the correct order of data and columns during CSV export.
		const reorderTableData = (data, columns) => {
			return data.map(row => {
				let reorderedRow = {};
				columns.forEach(col => {
					reorderedRow[col.data] = row[col.data];  // Reorder based on the 'data' field in columns
				});
				return reorderedRow;
			});
		};

		// Reorder the table data
		reorderedTableData = reorderTableData(tableData, columns);
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
			TStage: ["1","2","3","4","Sonstige","Ohne Eintrag"],
			UICC: ["I","II","III","IV","Sonstige","Ohne Eintrag"],
		};
		const order = orders[stratType];
		if (!order) return gvec;
		const rank = new Map(order.map((v, i) => [v, i]));
		return [...gvec].sort((a:any, b:any) => {
			const sa = String(a);
			const sb = String(b);
			const ra = rank.has(sa) ? rank.get(sa)! : 999;
			const rb = rank.has(sb) ? rank.get(sb)! : 999;
			if (ra !== rb) return ra - rb;
			return sa.localeCompare(sb, "de");
		});
	}

  
    let showChart: boolean = true;
	function handleChartToggled(event: any) {
		showChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.SurvivalKaplanMeierChartShowChart = showChart;
			return storeValues;
		});
	}
</script>

<Headline
	headlineTitle={$t("kaplanMeierTitle")}
	headlineTooltip={$t("tooltip_kaplanmeier")}
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
		<label for="chartType">{$t("kmType")}:</label>
		<div class="dropdown">
		  <select class="dropbtn" bind:value={selectedChartType}>
			{#each chartTypes as option (option.value)}
			<option class="dropdown-option" value={option.value}>{option.label}</option>
			{/each}
		  </select>
		</div>
	  </div>
  
	  <div>
		<label for="confidence">{$t("confidenceIntervals")}:</label>
		<div class="dropdown">
		  <select class="dropbtn" bind:value={selectedConfidenceType}>
			{#each confidenceTypes as option (option.value)}
			<option class="dropdown-option" value={option.value}>{option.label}</option>
			{/each}
		  </select>
		</div>
	  </div>
  
	  <div>
		<label for="time">{$t("timeline")}:</label>
		<div class="dropdown">
		  <select class="dropbtn" bind:value={selectedTimeType}>
			{#each timeTypes as option (option.value)}
			<option class="dropdown-option" value={option.value}>{option.label}</option>
			{/each}
		  </select>
		</div>
	  </div>
  
	 
		<div>
		  <label for="chartType">{$t("stratification")}:</label>
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
  <div style={(mounted && !updating) ? '' : 'display: none;'}>
	<div class="chart-container">
		<div id="Plot" />
	</div>
	<div class="straight-line-container">
		<span class="min-slider">{leftSliderOutput}</span>
		<div class="slider-container">
		  <div id="slider-round"></div>
		</div>
	  <span class="max-slider">{rightSliderOutput}</span>
	</div>
  </div>
</div>

  <div style={(!mounted || updating)? '' : 'display: none;'} class="bigSpinnerContainer">
		<button class="bigSpinnerButton" style="height:720px"><img class="bigSpinner"  id="spinner" src={loadingIcon} alt="Spinner"></button>
  </div>
  

  <div style={!showChart ? '' : 'display: none;'}>
	<div class="data-table">
		<table id="survivalKaplanMeierTable" class="display" style="width:100%">
			<thead>
				<tr>
					<th>{$t("tumorID")}</th>
					<th>{$t("time")}</th>
					<th>{$t("event")}</th>
					<th>{$t("kmTable_cumEvents")}</th>
					<th>{$t("kmTable_cumCensors")}</th>
					<th>{$t("kmTable_atRisk")}</th>
					<th>{$t("kmTable_survival")}</th>
					<th>{$t("kmTable_upperCI")}</th>
					<th>{$t("kmTable_lowerCI")}</th>
					<th>{$t("kmTable_group")}</th>
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

	.slider-container{
  flex: 60%; padding-left: 5%; padding-right: 5%; padding-bottom:10px; padding-top:5px; 
}

.min-slider{
  padding-left: 5%; 
}
.max-slider{
  padding-right: 5%; 
}



  </style>
  
