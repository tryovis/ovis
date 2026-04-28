<script lang="ts">
	import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { getTherapyOperationTable } from '../../graphQl/gql-therapy-operation';

	let sortingIndex = 2;

	let columns = [
		{ data: 'therapyID', header: "ID", tooltip: "Therapie-Identifikationsnummer" },
		{ data: 'tumorID', header: "TID", tooltip: "Tumor-Identifikationsnummer" },
		{ data: 'therapyOccurrenceDate', header: $t("date"), tooltip: "Datum der Operation", date: true },
		{ data: 'therapyDaysSinceDiagnosis' , header: "TsD", tooltip: "Tage seit Diagnose" },
		{ data: 'ops', header: "OPS", tooltip: "OPS Code" },
		{ data: 'resectionType', header: "Resektion", tooltip: "Auskunft ob eine Resektion des Primärtumors stattgefunden hat", ccp: false },
		{ data: 'metastasisResection', header: "Metastasen", tooltip: "Von Resektion betroffene Metastasen", ccp: false  },
		{ data: 'localRState', header: "L. R-Status", tooltip: "Lokaler Residual Status (Resttumor)" },
		{ data: 'globalRState' , header: "G. R-Status", tooltip: "Globaler Residual Status (Resttumor)" },
		{ data: 'emergencySurgery', header: $t("emergency"), tooltip: "Notfalloperation", ccp: false },
		{ data: 'surgeon', header: "Operateure", tooltip: "Operateure" , ccp: false },
	];

	let maximizeTherapyOperationTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeTherapyOperationTable} = value);
	});
	
	function handleMaximized(event: any) {
		maximizeTherapyOperationTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTherapyOperationTable = !storeValues.maximizeTherapyOperationTable;
			return storeValues;
		});
	}
</script>

<GenericTable
	collection="therapy"
	columns={columns}
	getTableData={getTherapyOperationTable}
	sortingIndex={sortingIndex}
	tableIdName={"therapyOperationTable"}
	headlineTitle={$t("surgeryDetails")}
	loadingActive={true}
	maxStoreValue={maximizeTherapyOperationTable}
	on:maximized={handleMaximized}
/>