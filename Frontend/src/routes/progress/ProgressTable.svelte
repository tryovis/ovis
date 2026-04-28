<script lang="ts">
	import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { getProgressTable } from '../../graphQl/gql-progress';

	let sortingIndex = 2;

	let columns = [
		{ data: 'patID', header: $t("PID"), tooltip: "Patienten-Identifikationsnummer" },
		{ data: 'tumorID' , header: $t("TID"), tooltip: "Tumor-Identifikationsnummer" },
		{ data: 'progressOccurrenceDate' , header: $t("date"), tooltip: "Beurteilungsdatum", date: true },
		{ data: 'progressDaysSinceDiagnosis' , header: $t("daysSinceDiagnosisShort"), tooltip: "Tage seit Diagnose" },
		{ data: 'overallAssessment' , header: $t("overallAssessmentShort"), tooltip: "Gesamtbeurteilung" },
		{ data: 'tumorState' , header: $t("primaryTumor"), tooltip: "Status des Primärtumors" },
		{ data: 'lymphNodeState' , header: $t("lymphNodes"), tooltip: "Status der Lymphknoten" },
		{ data: 'metastasisState' , header: $t("distantMetastasesShort"), tooltip: "Status der Fernmetastasen" },
		//{ data: 'vitalState' , header: "Vitalstatus", tooltip: "Vitalstatus"},
		{ data: 'progressReason', header: $t("reasonShort"), tooltip: "Grund der Verlaufserhebung", ccp: false },
		{ data: 'progressSource' , header: $t("sourceShort"), tooltip: "Quelle der Informationen", ccp: false },
		{ data: 'reportID', header: $t("reportIDShort"), tooltip: "Melde-ID des Landeskrebsregisters", ccp: false }
	];

	let maximizeProgressTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeProgressTable} = value);
	});
	
	function handleMaximized(event: any) {
		maximizeProgressTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeProgressTable = !storeValues.maximizeProgressTable;
			return storeValues;
		});
	}
</script>

<GenericTable
	collection="progress"
	columns={columns}
	getTableData={getProgressTable}
	sortingIndex={sortingIndex}
	tableIdName={"progressTable"}
	headlineTitle={$t("progressDetails")}
	loadingActive={true}
	maxStoreValue={maximizeProgressTable}
	on:maximized={handleMaximized}
/>