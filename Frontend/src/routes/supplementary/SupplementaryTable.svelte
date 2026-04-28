<script lang="ts">
    import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { getSupplementaryTable } from '../../graphQl/gql-supplementary';
	
	let sortingIndex = 2;

	let columns = [
		{ data: 'patID', header: $t("PID"), tooltip: "Patienten-Identifikationsnummer" },
		{ data: 'tumorID', header: $t("TID"), tooltip: "Tumor-Identifikationsnummer" },
		{ data: 'supplementaryOccurrenceDate', header: $t("date"), tooltip: "Datum", date: true },
		{ data: 'type', header: $t("supplementary"), tooltip: "Zusatzangabe" },
		{ data: 'status', header: $t("stage"), tooltip: "Stadium" },
		//{ data: 'therapyID', header: "Therapie-ID", tooltip: "Therapie-Identifikationsnummer" }
	];

	let maximizeSupplementaryTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeSupplementaryTable } = value);
	});
	function handleMaximized(event: any) {
		maximizeSupplementaryTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeSupplementaryTable = !storeValues.maximizeSupplementaryTable;
			return storeValues; // Return the updated values
		});
	}

</script>

<GenericTable
	collection="supplementary"
	columns={columns}
	getTableData={getSupplementaryTable}
	sortingIndex={sortingIndex}
	tableIdName={"supplementaryTable"}
	headlineTitle={$t("supplementaryDetails")}
	loadingActive={true}
	maxStoreValue={maximizeSupplementaryTable}
	on:maximized={handleMaximized}
/>