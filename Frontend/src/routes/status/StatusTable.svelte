<script lang="ts">
	import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { getStatusTable } from '../../graphQl/gql-status';
	
	let sortingIndex = 2;

	let columns = [
		{ data: 'patID', header: $t("PID"), tooltip: $t("patientIdentificationNumber") },
		{ data: 'tumorID', header: $t("TID"), tooltip: $t("tumorIdentificationNumber") },
		{ data: 'statusOccurrenceDate', header: `S-${$t("date")}`, tooltip: $t("statusDateLong"), date: true },
		{ data: 'statusDaysSinceDiagnosis', header: $t("daysSinceDiagnosisShort"), tooltip: $t("daysSinceDiagnosis") },
		{ data: 'type', header: $t("type"), tooltip: $t("typeOfStatus") },
        { data: 'status', header: $t("manifestation"), tooltip: $t("manifestationOfStatus") },
	];

	let maximizeStatusTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeStatusTable } = value);
	});
	
	function handleMaximized(event: any) {
		maximizeStatusTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeStatusTable = !storeValues.maximizeStatusTable;
			return storeValues; // Return the updated values
		});
	}

</script>

<GenericTable
	collection="status"
	columns={columns}
	getTableData={getStatusTable}
	sortingIndex={sortingIndex}
	tableIdName={"statusOverviewTable"}
	headlineTitle={$t("statusDetails")}
	loadingActive={true}
	maxStoreValue={maximizeStatusTable}
	on:maximized={handleMaximized}
/>