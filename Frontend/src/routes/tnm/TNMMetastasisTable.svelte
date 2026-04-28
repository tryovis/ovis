<script lang="ts">
	import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { getTNMMetastasisTable } from '../../graphQl/gql-tnm';

	let sortingIndex = 1;
	
	let columns = [
		{ data: 'tumorID', header: $t("TID"), tooltip: $t("tumorID") },
		{ data: 'metastasisDate', header: $t("date"), tooltip: $t("metastasisDate"), date: true },
		{ data: 'metastasisLocation', header: "Met.", tooltip: $t("metastasisLocation") },
		{ data: 'type', header: $t("type"), tooltip: $t("metastasisType") },
		{ data: 'spread', header: $t("spread"), tooltip: $t("metastasisSpread") }
	];

	let maximizeTNMMetastasisTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeTNMMetastasisTable } = value);
	});

	function handleMaximized(event: any) {
		maximizeTNMMetastasisTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTNMMetastasisTable = !storeValues.maximizeTNMMetastasisTable;
			return storeValues; // Return the updated values
		});
	}
</script>

<GenericTable
	collection="metastasis"
	columns={columns}
	getTableData={getTNMMetastasisTable}
	sortingIndex={sortingIndex}
	tableIdName={"metastasisTable"}
	headlineTitle={$t("metastasisDetails")}
	loadingActive={true}
	maxStoreValue={maximizeTNMMetastasisTable}
	on:maximized={handleMaximized}
/>
