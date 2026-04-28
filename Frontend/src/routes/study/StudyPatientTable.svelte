<script lang="ts">
    import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { getStudyPatientTable } from '../../graphQl/gql-study';

	let sortingIndex = 3;

	let columns = [
		{ data: 'studyID', header: "Studien-ID", tooltip: "Studien-Identifikationsnummer" },
		{ data: 'shortname', header: "Studie", tooltip: "Studienname" },
		{ data: 'patID', header: $t("PID"), tooltip: "Patienten-Identifikationsnummer" },
		{ data: 'recruitmentDate', header: "Rekrutierung", tooltip: "Datum", date: true }
	];

	let maximizeStudyPatientTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeStudyPatientTable } = value);
	});

	function handleMaximized(event: any) {
		maximizeStudyPatientTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeStudyPatientTable = !storeValues.maximizeStudyPatientTable;
			return storeValues; // Return the updated values
		});
	}

</script>

<GenericTable
	collection="study"
	columns={columns}
	getTableData={getStudyPatientTable}
	sortingIndex={sortingIndex}
	tableIdName={"studyPatientTable"}
	headlineTitle={$t("studyPatientTableTitle")}
	loadingActive={true}
	maxStoreValue={maximizeStudyPatientTable}
	on:maximized={handleMaximized}
/>