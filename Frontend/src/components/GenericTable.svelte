<script lang="ts">
	import { createTable, changeRowCount } from '../tableBuilder';
	import { createEventDispatcher, onMount } from 'svelte';
	import Headline from '../components/Headline.svelte';
    import { variantStore } from '../store/variantStore.js';
	import type { LensDataPasser } from "@samply/lens";
	import { filterActiveStore } from '../store/filterActiveStore.js';
    import { addUserFilter } from '../components/UserFilter'
	import { t, locale, locales } from "../store/languageStore";

	let filterActive = true;
		// Abonnieren des filterActiveStore und den Wert aktualisieren
		filterActiveStore.subscribe((value) => {
		filterActive = value.filterActive; // Hier den Wert direkt zuweisen
	});
	let filter = JSON.stringify({ "operand": "OR", "children": [] });

	let isCCP: boolean;
	variantStore.subscribe((value: any) => {
		({ isCCP } = value);
	});

	export let columns: any;
	export let collection: string;
	export let getTableData: any;
	export let sortingIndex: number;
	export let tableIdName: string;
	export let headlineTitle: string;
	export let loadingActive: boolean;
	export let maxStoreValue: boolean;

	let dataPasser: LensDataPasser;

	let loading: boolean = true;
	let isPaused: boolean = false;
	let loadingStatus: number = 0;

	let tableShownRows: number = 0;
	let tableShownRowsMax: number;

	if(tableIdName.includes("patientCohort"))
		tableShownRowsMax = 19;
	else
		tableShownRowsMax = 20;
	
    let tooltip = "<p><b>"+ headlineTitle +"</b><hr></p>";

	let genericTable: any;

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
		dispatch('maximized', { maxStoreValue});
	}

	const headers = ["_id", ...(
		columns.length > 0 && columns.some(column => column.header)
			? columns.map(column => column.header)  // Use actual headers if available
			: columns.map((_, index) => `col${index + 1}`)  // Fallback to default column names
	)];

	//console.log("headers", headers);

	let tableData: any[];

	onMount(async () => {
		await import("@samply/lens");
		tableIdName = "generic_" + tableIdName;
		//console.log("table ID", tableIdName);
		
		if (isCCP) {
			columns = columns.filter((column: any) => column.ccp !== false);
			columns = columns.filter((column: any) => column.ovis !== true);
		} else {
			columns = columns.filter((column: any) => column.ccp !== true);
			columns = columns.filter((column: any) => column.ovis !== false);
		}

		calculateTooltip();

		let limit = null;
		if(loadingActive) {
			limit = 100;
		}

		// let heightTableDiv = document.querySelector('.data-table')?.parentElement?.clientHeight;
		let heightTableDiv = document.querySelector('div[class*="table"][class*="box_level2"]')?.clientHeight;

		if (heightTableDiv) {
			// Check if there is a div with class "straight-line-container" inside
			const navBarContainer = document.querySelector('div[class*="table"][class*="box_level2"] .navbar');
			//console.log("nav bar", navBarContainer);
			const adjustment = navBarContainer ? 45 : 0;

			tableShownRows = Math.floor((heightTableDiv - 170 - adjustment) / 32);
		}
		if(filterActive){
			filter = JSON.stringify(dataPasser.getAstAPI())
		}else{
			filter = JSON.stringify({ "operand": "OR", "children": [] });

		}
		filter = JSON.stringify(await addUserFilter(JSON.parse(filter)));
		tableData = await getTableData(null, limit, filter);
		//tableData = await getTableData(null, limit, JSON.stringify(dataPasser.getAstAPI()));
		stringifyArray(tableData);

		//console.log("tableData", tableData);

		columns.forEach((column: { numOfObj: boolean; data: string; }) => {
			
			if (column.numOfObj && column.data in tableData[0] && Array.isArray(tableData[0][column.data])) {
				tableData = tableData.map(data => ({
					...data,
					[column.data]: data[column.data].length
				}));
			}
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
			null
		);

		if(loadingActive){
			loadInitialChunk(tableData, tableData?.at(-1)?._id, getTableData);
		}
	});

	async function loadInitialChunk(
		currentData: any,
		continueFromID: string | undefined | null,
		getDataFunction: (id: string | undefined | null, count: number, filter: String) => Promise<any>
	) {
		if(filterActive){
			filter = JSON.stringify(dataPasser.getAstAPI())
		}else{
			filter = JSON.stringify({ "operand": "OR", "children": [] });

		}
		filter = JSON.stringify(await addUserFilter(JSON.parse(filter)));
		let remainingData: any[] = await getDataFunction(continueFromID, 1000, filter);

		stringifyArray(remainingData);

		columns.forEach((column: { numOfObj: boolean; data: string; }) => {
			if (column.numOfObj && remainingData[0] && column.data in remainingData[0] && Array.isArray(remainingData[0][column.data])) {
				remainingData = remainingData.map(data => ({
					...data,
					[column.data]: data[column.data].length
				}));
			}
		});

		tableData = currentData.concat(remainingData);

		loadingStatus = tableData.length;

		console.log("loadingstatus", loadingStatus, "tableid", tableIdName);

		// Überprüfe, ob es noch mehr Daten gibt, und lade sie rekursiv
		if (remainingData.length > 0 && tableData.length <= 5000) {
			// Fortsetzen von der ID des letzten Elements plus 1
			loadInitialChunk(tableData, tableData?.at(-1)?._id, getDataFunction);
		} else {
			genericTable = createTable(
				collection,
				dataPasser,
				tableIdName,
				tableData,
				columns,
				tableShownRows,
				//truncateLength,
				sortingIndex,
				null
			);
			if(remainingData.length <= 0){  
				loading = false;
				console.log("loading", loading);
			}else{
				isPaused = true;
			}
		}
	}

	async function loadRest(
		currentData: any,
		continueFromID: string | undefined | null,
		getDataFunction: (id: string | undefined | null, count: number, filter: String) => Promise<any>
	) {
		if(filterActive){
			filter = JSON.stringify(dataPasser.getAstAPI())
		}else{
			filter = JSON.stringify({ "operand": "OR", "children": [] });

		}
		filter = JSON.stringify(await addUserFilter(JSON.parse(filter)));
		let remainingData: any[] = await getDataFunction(continueFromID, 1000, filter);

		stringifyArray(remainingData);

		columns.forEach((column: { numOfObj: boolean; data: string; }) => {
			if (column.numOfObj && remainingData[0] && column.data in remainingData[0] && Array.isArray(remainingData[0][column.data])) {
				remainingData = remainingData.map(data => ({
					...data,
					[column.data]: data[column.data].length
				}));
			}
		});

		tableData = currentData.concat(remainingData);

		loadingStatus = tableData.length;

		console.log("loadingstatus", loadingStatus, "tableid", tableIdName);

		// Überprüfe, ob es noch mehr Daten gibt, und lade sie rekursiv
		if (remainingData.length > 0 && tableData.length <= 50000) {
			// Fortsetzen von der ID des letzten Elements plus 1
			loadRest(tableData, tableData?.at(-1)?._id, getDataFunction);
		} else {
			genericTable = createTable(
				collection,
				dataPasser,
				tableIdName,
				tableData,
				columns,
				tableShownRows,
				//truncateLength,
				sortingIndex,
				null
			);
			
			console.log("loading", loading);
			if(remainingData.length <= 0){  
				loading = false;
			}else{
				loading = true;
			}
		}
	}

	function calculateTooltip() {
			columns.forEach((entry: any) => {
				if (entry.sup != null)	// Superscript
					tooltip += entry.header + "<sup>" + entry.sup + "</sup> = " + entry.tooltip + "<br>"; // Füge die Tooltip-Informationen hinzu
				else
					tooltip += entry.header + " = " + entry.tooltip + "<br>"; // Füge die Tooltip-Informationen hinzu
		});
		tooltip += "<hr><p><i>" + $t("infoButton") + "</i></p>"
	}

	function stringifyArray(remainingData: any) {
		remainingData.forEach((element: { complication: any; substance: any[]; ops: any[]; }) => {
			if (element.complication || element.substance || element.ops) {
				let valueToUse;
				if (element.complication) {
					valueToUse = element.complication;
					let complicationString = valueToUse.reduce((acc: string, currentValue: any) => {
					acc += currentValue.complication;
					acc += currentValue.grade ? ":" + currentValue.grade : "";
					acc += ", ";
					return acc;
				}, "").slice(0, -2); //Schneidet das hintere Komma und Leerzeichen weg
				element.complication = complicationString;
				} else if (element.substance) {
					let substanceString = element.substance.reduce((acc:string,currentValue:any)=>{
						acc += currentValue.substance + ", "
						return acc
					},"").slice(0,-2) //Schneidet das hintere Komma und Leerzeichen weg
					element.substance = substanceString;
				} else if (element.ops) {
					valueToUse = element.ops;
					let opsString = element.ops.reduce((acc:string,currentValue:any)=>{
					acc += currentValue.ops + ", "
					return acc
					},"").slice(0,-2) //Schneidet das hintere Komma und Leerzeichen weg
					element.ops = opsString;
				}
			}
		});
		return remainingData;
	}
	
	function handleContinue(event: any) {
		isPaused = false;
		loadRest(tableData, tableData?.at(-1)?._id, getTableData)
	}
	
</script>

<Headline
	headlineTitle={headlineTitle}
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
	headlineLoading={loading}
	headlineLoadingStatus={loadingStatus}
	headlineIsPaused={isPaused}
	headlineCollection={collection}
	on:maximized={handleMaximized}
	on:conitnueToggled={handleContinue}
/>
<lens-data-passer bind:this={dataPasser} />
<div class="data">
	<div class="data-table">
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