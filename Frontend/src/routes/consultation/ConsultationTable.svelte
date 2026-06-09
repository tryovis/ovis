<script lang="ts">
    import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { getConsultationTable } from '../../graphQl/gql-consultation';
	
	let sortingIndex = 2;

	let columns = [
		{ data: 'patID', header: $t("PID"), tooltip: $t("patientIdentificationNumber") },
		{ data: 'tumorID', header: $t("TID"), tooltip: $t("tumorIdentificationNumber") },
		{ data: 'consultationOccurrenceDate', header: `B-${$t("date")}`, tooltip: $t("consultationDateLong"), date: true },
		{ data: 'consultationDaysSinceDiagnosis', header: $t("daysSinceDiagnosisShort"), tooltip: $t("daysSinceDiagnosis") },
		{ data: 'type', header: $t("type"), tooltip: $t("typeOfConsultation") },
		{ data: 'status', header: $t("status"), tooltip: $t("statusOfConsultation") }
	];

	let maximizeConsultationTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeConsultationTable } = value);
	});

	function handleMaximized(event: any) {
		maximizeConsultationTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeConsultationTable = !storeValues.maximizeConsultationTable;
			return storeValues; // Return the updated values
		});
	}

</script>

<GenericTable
	columns={columns}
	collection="consultation"
	getTableData={getConsultationTable}
	sortingIndex={sortingIndex}
	tableIdName={"consultationOverviewTable"}
	headlineTitle={$t("consultationDetails")}
	loadingActive={true}
	maxStoreValue={maximizeConsultationTable}
	on:maximized={handleMaximized}
/>