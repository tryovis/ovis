<script lang="ts">
	import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { getPatientCohortHistoryTable } from '../../graphQl/gql-patient-cohort';

	let sortingIndex = 1;

	let maximizePatientSingleHistoryTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizePatientSingleHistoryTable } = value);
	});

	function handleMaximized(event: any) {
		maximizePatientSingleHistoryTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizePatientSingleHistoryTable = !storeValues.maximizePatientSingleHistoryTable;
			return storeValues; // Return the updated values
		});
	}

	let columns = [
		{ data: 'patID', header: $t("PID"), tooltip: $t("patientID") },
		{ data: 'tumorID', header: $t("TID"), tooltip: $t("tumorID") },
		{ data: 'diagnosisDate', header: $t("diagnosisDate"), date: true, tooltip: $t("diagnosisDateLong") },
		{ data: 'ICD.ICD10', header: $t("ICD10"), tooltip: `<a target="_blank" href="https://www.dimdi.de/static/de/klassifikationen/icd/icd-10-gm/kode-suche/htmlgm2022/">${$t("ICD10DiagnosisCode")}</a>` },
		{ data: 'ICDO.localizationCode', header: $t("localizationCode"), tooltip: `<a target="_blank" href="https://www.dimdi.de/dynamic/de/klassifikationen/icd/icd-o-3/icd03rev2html/">${$t("localizationCodeLong")}</a>` },
		{ data: 'ICDO.histologyCode', header: $t("histologyCode"), tooltip: `<a target="_blank" href="https://www.dimdi.de/dynamic/de/klassifikationen/icd/icd-o-3/icd03rev2html/">${$t("histologyCodeLong")}</a>` },
		{ data: 'ageAtDiagnosis', header: $t("diagnosisAge"), tooltip: $t("ageAtDiagnosis") },
		{ data: 'reportID', header: $t("reportID"), ccp: false, tooltip: $t("reportID") }
    ]
</script>

<GenericTable
	collection="diagnosis"
	columns={columns}
	getTableData={getPatientCohortHistoryTable}
	sortingIndex={sortingIndex}
	tableIdName={"patientSingleHistoryTable"}
	headlineTitle={$t("diagnosisHistory")}
	loadingActive={true}
	maxStoreValue={maximizePatientSingleHistoryTable}
	on:maximized={handleMaximized}
/>