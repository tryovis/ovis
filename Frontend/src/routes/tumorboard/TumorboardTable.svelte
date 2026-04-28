<script lang="ts">
	import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { getTumorboardTable } from '../../graphQl/gql-tumorboard';
	
	let sortingIndex = 2;

	let columns = [
		{ data: 'patID', header: $t("PID"), tooltip: $t("patientIdentificationNumber") },
		{ data: 'tumorID', header: $t("TID"), tooltip: $t("tumorIdentificationNumber") },
		{ data: 'tumorBoardOccurrenceDate', header: `TB-${$t("date")}`, tooltip: $t("tumorBoardDateLong"), date: true },
		{ data: 'tumorBoardDaysSinceDiagnosis', header: $t("daysSinceDiagnosisShort"), tooltip: $t("daysSinceDiagnosis") },
		{ data: 'type', header: $t("type"), tooltip: $t("typeOfTumorBoard") },
		{ data: 'recommendation', header: $t("recommendation"), tooltip: $t("recommendation") },
	];

	let maximizeTumorboardTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeTumorboardTable } = value);
	});
	
	function handleMaximized(event: any) {
		maximizeTumorboardTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTumorboardTable = !storeValues.maximizeTumorboardTable;
			return storeValues; // Return the updated values
		});
	}

</script>

<GenericTable
	collection="tumorBoard"
	columns={columns}
	getTableData={getTumorboardTable}
	sortingIndex={sortingIndex}
	tableIdName={"tumorboardOverviewTable"}
	headlineTitle={$t("tumorboardDetails")}
	loadingActive={true}
	maxStoreValue={maximizeTumorboardTable}
	on:maximized={handleMaximized}
/>