<script lang="ts">

	import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { getBioMaterialTable } from '../../graphQl/gql-bio-material';

	let sortingIndex = 1;

	let maximizeBioMaterialTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeBioMaterialTable } = value);
	});

	function handleMaximized(event: any) {
		maximizeBioMaterialTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeBioMaterialTable = !storeValues.maximizeBioMaterialTable;
			return storeValues; 
		});
	}

	let columns = [
		{ data: 'patID', header: $t("PID"), tooltip: "TODO" },
		{ data: 'tumorID', header: $t("TID") , tooltip: "TODO"},
		{ data: 'bioMaterialOccurrenceDate',header: $t("date") , tooltip: "TODO"},
		{ data: 'type', header: "Typ" , tooltip: "TODO"},
		{ data: 'status', header: "Status" , tooltip: "TODO"},
		{ data: 'project', header: "Project" , tooltip: "TODO"},
		{ data: 'reference', header: "Referenz" , tooltip: "TODO"},
		{ data: 'amount', header: "Menge" , tooltip: "TODO"},
	];

	
</script>

<GenericTable
	collection="bioMaterial"
	columns={columns}
	getTableData={getBioMaterialTable}
	sortingIndex={sortingIndex}
	tableIdName={"bioMaterialTable"}
	headlineTitle={"Bio-Material-Tabelle"}
	loadingActive={true}
	maxStoreValue={maximizeBioMaterialTable}
	on:maximized={handleMaximized}
/>

