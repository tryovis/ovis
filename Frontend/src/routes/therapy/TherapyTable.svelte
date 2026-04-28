<!-- DataTableExample.svelte -->

<script lang="ts">
	// @ts-nocheck
	import { onMount } from 'svelte';
	import { getTherapyTable } from '../../graphQl/gql-therapy';
	import Headline from '../../components/Headline.svelte';
	import { createTable, changeRowCount } from '../../tableBuilder';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	
	let therapyGeneralTable: any;
	let tableShownRows = 7;
	let tableShownRowsMax = 20;
	//let truncateLength = 7;
	let sortingIndex = 2;

	let maximizeTherapyTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeTherapyTable } = value);
	});

	function handleMaximized(event: any) {
		maximizeTherapyTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTherapyTable = !storeValues.maximizeTherapyTable;
			return storeValues; // Return the updated values
		});
		setTimeout(() => {
			if (maximizeTherapyTable) {
				changeRowCount(therapyGeneralTable, tableShownRowsMax);
			} else {
				changeRowCount(therapyGeneralTable, tableShownRows);
			}
		}, 0);
	}

	let columns = [
		{ data: 'therapyID' },
		{ data: 'tumorID' },
		{ data: 'therapyOccurrenceDate' },
		{ data: 'therapyDaysSinceDiagnosis' },
		{ data: 'generalType' },
		{ data: 'intention' },
		{ data: 'ops' },
		{ data: 'localRState' },
		{ data: 'subType' },
		{ data: 'protocol' },
		{ data: 'substance' },
		{ data: 'surgeryContext' }
	];

	type TherapyTableType = {
		_id: string;
		tumorID: string;
		therapyOccurrenceDate: string;
		therapyDaysSinceDiagnosis: string;
		Art: string;
		Intention: string;
		Klinik: string;
		Abbruch: string;
		complication: {complication: string, grade: string} | string | null;
		Phase: string;
		Multimodal: string;
		Kombination: string;
		MeldeID: string;
	};

	let loading: boolean = true;
	let loadingStatus: number = 0;
	let combinedData: TherapyTableType[];
	onMount(async () => {
		let initialData: TherapyTableType[] = await getTherapyTable(null, 100);
		initialData = stringifyOpsObject(initialData);
		initialData = stringifyObject(initialData);

		combinedData = initialData;
		loadingStatus = initialData.length;
	
		therapyGeneralTable = createTable(
			'therapyGeneralTable',
			initialData,
			columns,
			tableShownRows,
			//truncateLength,
			sortingIndex
		);
		loadRemainingData(initialData, initialData?.at(-1)?._id, getTherapyTable);
	});

	function stringifyObject(remainingData:any){
	
	

	remainingData.forEach(element => {
		if (element.substance) {
			let substanceString = element.substance.reduce((acc:string,currentValue:any)=>{
				acc += currentValue.substance + ", "
				return acc
			},"").slice(0,-2) //Schneidet das hintere Komma und Leerzeichen weg
			element.substance = substanceString;
		}
	});
	return remainingData;
}

function stringifyOpsObject(remainingData:any){
	
	
	
	remainingData.forEach(element => {
		if (element.ops) {
			let opsString = element.ops.reduce((acc:string,currentValue:any)=>{
				acc += currentValue.ops + ", "
				return acc
			},"").slice(0,-2) //Schneidet das hintere Komma und Leerzeichen weg
			element.ops = opsString;
		}
	});
	return remainingData;
}


	async function loadRemainingData(
		currentData: TherapyTableType[],
		continueFromID: string | undefined | null,
		getDataFunction: (
			id: string | undefined | null,
			count: number
		) => Promise<TherapyTableType[]>
	) {
		let remainingData: TherapyTableType[] = await getDataFunction(continueFromID, 2000);

		
		remainingData = stringifyOpsObject(remainingData);
		remainingData = stringifyObject(remainingData);

		// Kombiniere die aktuellen Daten mit den neu geladenen Daten
		combinedData = currentData.concat(remainingData);
		loadingStatus = combinedData.length;
		// Überprüfe, ob es noch mehr Daten gibt, und lade sie rekursiv
		if (remainingData.length > 0) {
			// Fortsetzen von der ID des letzten Elements plus 1
			loadRemainingData(combinedData, combinedData?.at(-1)?._id, getDataFunction);
		} else {
			therapyGeneralTable = createTable(
				'therapyGeneralTable',
				combinedData,
				columns,
				tableShownRows,
				//truncateLength,
				sortingIndex
			);
			loading = false;
		}
	}
</script>

<Headline
	headlineTitle={$t("therapyDetails")}
	headlineTooltip={'TOOLTIP'}
	headlineMaximize={maximizeTherapyTable}
	headlineShowChart={null}
	headlineIsChart={false}
	headlineInitialTop5={null}
	headlineInitialLogarithm={null}
	headlineInputTableData={combinedData}
	headlineChartJSElement={null}
	headlineD3Element={null}
	headlineLoading={loading}
	headlineLoadingStatus={loadingStatus}
	on:maximized={handleMaximized}
/>
<div>
	<div class="data-table" style="overflow-x: hidden;">
		<table id="therapyGeneralTable" class="display" style="width:100%">
			<thead>
				<tr>
					<!--Allgemein-->
					<th>Th-ID </th>
					<th>Tumor-ID </th>
					<th class="dateColumn">Th-Datum</th>
					<th>T. s. D.</th>
					<th>Kategorie</th>
					<th>Intent.</th>
					<!--Operationsrelevant-->
					<th>OPS</th>
					<th>R-Status</th>
					<!--Chemotherapierelevant-->
					<th>Sub-Typ</th>
					<th>Protokoll</th>
					<th>Wirkstoffe</th>
					<th>OP-Stellung</th>
					<!--Bestrahlung-->
				</tr>
			</thead>
		</table>
	</div>
</div>

<style>
	@import 'datatables.net-dt/css/jquery.dataTables.css';
</style>
