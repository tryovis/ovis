<script lang="ts">
	import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { getTherapySystemicTable } from '../../graphQl/gql-therapy-systemic';
	
	let sortingIndex = 2;

	let columns = [
		{ data: 'therapyID', header: "ID", tooltip: "Therapie-Identifikationsnummer" },
		{ data: 'tumorID', header: $t("TID"), tooltip: "Tumor-Identifikationsnummer" },
		{ data: 'therapyOccurrenceDate', header: "Th-Start", tooltip: "Therapiestart", date: true },
		{ data: 'therapyEndDate', header: `Th-${$t("end")}`, tooltip: "Therapieende", date: true },
		{ data: 'therapyDaysSinceDiagnosis', header: "TsD.", tooltip: "Tage seit Diagnose" },
		{ data: 'subType', header: $t("type"), tooltip: "Art der Therapie" },
		{ data: 'protocol', header: $t("protocol"), tooltip: "Protokoll" },
		{ data: 'substance', header: $t("activeSubstances"), tooltip: "Wirkstoffe", objectToString: true },
		{ data: 'cyclesPlanned', header: `Z-${$t("planned")}`, tooltip: "Therapiezyklus geplant" , ccp: false },
		{ data: 'cyclesPerformed', header: `Z-${$t("performed")}`, tooltip: "Therapiezyklus durchgeführt" , ccp: false },
		{ data: 'doseDeviation', header: $t("doseDeviationShort"), tooltip: "Dosisabweichung", ccp: false },
	];
	
	let maximizeTherapySystemicTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeTherapySystemicTable } = value);
	});

	function handleMaximized(event: any) {
		maximizeTherapySystemicTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTherapySystemicTable = !storeValues.maximizeTherapySystemicTable;
			return storeValues; // Return the updated values
		});
	}

</script>

<GenericTable
	collection="therapy"
	columns={columns}
	getTableData={getTherapySystemicTable}
	sortingIndex={sortingIndex}
	tableIdName={"therapySystemicTable"}
	headlineTitle={$t("systemicDetails")}
	loadingActive={true}
	maxStoreValue={maximizeTherapySystemicTable}
	on:maximized={handleMaximized}
/>