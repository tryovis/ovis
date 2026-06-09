<script lang="ts">
	import { onMount } from 'svelte';
	import Headline from '../../components/Headline.svelte';
	import { createTable, changeRowCount } from '../../tableBuilder';
	import { maxStore } from '../../store/maxStore';
	import { getTherapySystemicSubstanceTable } from '../../graphQl/gql-therapy-systemic';
	import { t } from "../../store/languageStore";
 	import type { LensDataPasser } from "@samply/lens";


	 import { filterActiveStore } from '../../store/filterActiveStore.js';
    let filterActive = true;

    // Abonnieren des filterActiveStore und den Wert aktualisieren
    filterActiveStore.subscribe((value) => {
        filterActive = value.filterActive; // Hier den Wert direkt zuweisen
    });

	let therapySystemicSubstanceTable: any;
	let tableShownRows = 7;
	let tableShownRowsMax = 20;
	let sortingIndex = 2;
	let dataPasser: LensDataPasser;

	let transformedData: any;

	let maximizeTherapySystemicSubstanceTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeTherapySystemicSubstanceTable } = value);
	});

	function handleMaximized(event: any) {
		maximizeTherapySystemicSubstanceTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTherapySystemicSubstanceTable = !storeValues.maximizeTherapySystemicSubstanceTable;
			return storeValues; 
		});
		setTimeout(() => {
			if (maximizeTherapySystemicSubstanceTable) {
				changeRowCount(therapySystemicSubstanceTable, tableShownRowsMax);
			} else {
				changeRowCount(therapySystemicSubstanceTable, tableShownRows);
			}
		}, 0);
	}

	let columns = [
		{ data: 'substance_substance', header: $t("activeSubstance") }, // column for 'substance_substance'
		{ data: 'substance_ATCCode', header: 'ATC-Code' },
		{ data: 'count', header: $t("count") }
	];

	const headers = columns.length > 0 && columns.some(column => column.header)
		? columns.map(column => column.header)  // Use actual headers if available
		: columns.map((_, index) => `col${index + 1}`);  // Fallback to default column names

	type TherapySystemicSubstanceTableType = {
		substance_substance: string;
		substance_ATCCode: string;
		count: number;
	};

	// Funktion zum Umbenennen von 'label' in 'substance_substance'
	function transformData(data: any[]) {
		return data.map((item) => ({
			substance_substance: item.label,  // Umbenennung von 'label' in 'substance_substance'
			substance_ATCCode: item.ATCCode,
			count: item.count,
		}));
	}
	let filter = JSON.stringify({ "operand": "OR", "children": [] });;
	onMount(async () => {
		await import("@samply/lens");

		if (filterActive) {
			filter = JSON.stringify(dataPasser.getAstAPI());
		}
		let initialData = await getTherapySystemicSubstanceTable(filter);
		
		// Umbenennen der Daten von 'label' zu 'substance_substance'
		transformedData = transformData(initialData);
		console.log("Transformed Data", transformedData);

		// Tabelle mit den umbenannten Daten erstellen
		therapySystemicSubstanceTable = createTable(
			"therapy",
			dataPasser,
			'therapySystemicSubstanceTable',
			transformedData, // die umbenannten Daten übergeben
			columns,
			tableShownRows,
			sortingIndex
		);
		console.log("TABLE CREATED?!")
	});
</script>


<Headline
	headlineTitle={$t("activeSubstancesFrequencies")}
	headlineTooltip={$t("tooltip_TherapySystemicSubstanceTable")}
	headlineMaximize={maximizeTherapySystemicSubstanceTable}
	headlineShowChart={null}
	headlineIsChart={false}
	headlineInitialTop5={null}
	headlineInitialLogarithm={null}
	headlineInputTableData={transformedData}
	headlineInputTableHeader={headers}
	headlineChartJSElement={null}
	headlineD3Element={null}
	on:maximized={handleMaximized}
/>
<lens-data-passer bind:this={dataPasser} />
<div>
	<div class="data-table" style="overflow-x: hidden;">
		<table id="therapySystemicSubstanceTable" class="display" style="width:100%">
			<thead>
				<tr>
					<th>{$t("activeSubstance")}</th>
					<th>ATC-Code</th>
					<th>{$t("count")}</th>
				</tr>
			</thead>
		</table>
	</div>
</div>

<style>
	@import 'datatables.net-dt/css/jquery.dataTables.css';
</style>