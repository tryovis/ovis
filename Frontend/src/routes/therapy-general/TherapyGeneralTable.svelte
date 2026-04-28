<script lang="ts">
	import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { getTherapyGeneralTable } from '../../graphQl/gql-therapy-general';

	let sortingIndex = 4;

	let columns = [
		{ data: 'therapyID', header: "ID", tooltip: "Therapie-Identifikationsnummer"},
		{ data: 'patID' , header: $t("PID"), tooltip: "Patienten-Identifikationsnummer" },
		{ data: 'tumorID' , header: $t("TID"), tooltip: "Tumor-Identifikationsnummer" },
		{ data: 'generalType' , header: $t("type"), tooltip: "Art der Therapie" },
		{ data: 'therapyOccurrenceDate' , header: `Th-Start`, tooltip: "Therapiedatum", date: true },
		{ data: 'therapyEndDate' , header: `Th-${$t("end")}`, tooltip: "Therapieende", date: true },
		{ data: 'therapyDaysSinceDiagnosis' , header: "TsD", tooltip: "Tage seit Diagnose" },
		{ data: 'intention' , header: "Intent", tooltip: "Intention der Therapie" },
		{ data: 'surgeryContext', header: "OP-St", tooltip: "Stellung zur Operation" }  ,
		{ data: 'complication', header: $t("complicationShort"), tooltip: "Grund der Verlaufserhebung", objectToString: true},
		{ data: 'terminationReason' , header: $t("terminationShort"), tooltip: "Grund für Therapieabbruch" },
		{ data: 'status' , header: "Status", tooltip: "Durchführungsstatus" , ccp:false},
		//{ data: 'phase' , header: "Phase", tooltip: "Therapie-Phase"},
		//{ data: 'multiModal', header: "Multi", tooltip: "Multimodale Therapie" },
		//{ data: 'combination', header: $t("combi"), tooltip: "Therapie in Kombination" },
		{ data: 'internal', header: "Int/Ex", tooltip: "Interne bzw. externe Therapie" , ccp:false },
		{ data: 'organizationalUnit' , header: $t("clinic"), tooltip: "Klinik an der die Therapie durchgeführt wurde", ccp:false },
		{ data: 'reportID', header: $t("reportIDShort"), tooltip: "Melde-ID des Landeskrebsregisters", ccp:false }
	];

	let maximizeTherapyGeneralTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeTherapyGeneralTable} = value);
	});
	
	function handleMaximized(event: any) {
		maximizeTherapyGeneralTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTherapyGeneralTable = !storeValues.maximizeTherapyGeneralTable;
			return storeValues;
		});
	}
</script>

<GenericTable
	collection="therapy"
	columns={columns}
	getTableData={getTherapyGeneralTable}
	sortingIndex={sortingIndex}
	tableIdName={"therapyGeneralTable"}
	headlineTitle={$t("therapyGeneralDetails")}
	loadingActive={true}
	maxStoreValue={maximizeTherapyGeneralTable}
	on:maximized={handleMaximized}
/>