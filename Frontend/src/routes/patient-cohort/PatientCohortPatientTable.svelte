<script lang="ts">

	import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { getPatientCohortOverviewTable } from '../../graphQl/gql-patient-cohort';

	let sortingIndex = 4;

	let maximizePatientCohortPatientTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizePatientCohortPatientTable } = value);
	});

	function handleMaximized(event: any) {
		maximizePatientCohortPatientTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizePatientCohortPatientTable = !storeValues.maximizePatientCohortPatientTable;
			return storeValues; // Return the updated values
		});
	}

	let columns = [
		{ data: 'patID', header: $t("PID"), tooltip: $t("patientID")},
		{ data: 'patID', header: $t("IDType"), tooltip: "ID" },
		{ data: 'gender', header: "Geschlecht", tooltip: $t("gender") },
		{ data: 'birthDate', header: $t("birthDateShort"), date: true },
		{ data: 'vitalDate', header: $t("vitalDate"), date: true, tooltip: $t("vitalDateLong") },
		{ data: 'vitalState', header: "V-Status",  tooltip: "Vitalstatus" }
	];

</script>

<GenericTable
    collection="patient"
    columns={columns}
    getTableData={getPatientCohortOverviewTable}
    sortingIndex={sortingIndex}
    tableIdName={"patientCohortPatientTable"}
    headlineTitle={$t("patientInformation")}
    loadingActive={true}
    maxStoreValue={maximizePatientCohortPatientTable}
    on:maximized={handleMaximized}
/>
