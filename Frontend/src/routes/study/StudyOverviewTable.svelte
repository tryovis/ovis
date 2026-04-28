<script lang="ts">
	import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { getStudyOverviewTable } from '../../graphQl/gql-study';

	let sortingIndex = 1;

	let columns = [
		{ data: 'studyID', header: "Studien-ID", tooltip: "Studien-Identifikationsnummer" },
		{ data: 'shortname', header: "Kurzname", tooltip: "Kurzname der Studie" },
		{ data: 'status', header: "Status", tooltip: "Status der Studie" },
		{ data: 'start', header: "S-start", tooltip: "Studienbeginn", date: true },
		{ data: 'firstPatInPlanned', header: "Rek.(gepl.)", tooltip: "geplantes Datum der Rekrutierung für die Studie", date: true },
		{ data: 'phase', header: "Phase", tooltip: "Studienphase" },
		{ data: 'eudract', header: "EudraCT", tooltip: "EudraCT" },
		{ data: 'organisationFull', header: "Klinik (lang)", tooltip: "Klinik an der die Studie durchgeführt wurde" },
		{ data: 'organisationShort', header: "Klinik", tooltip: "Klinik Kurzname" },
		{ data: 'studyPatients', header: "Patienten", tooltip: "Anzahl der Patienten", numOfObj: true }
	];

	let maximizeStudyOverviewTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeStudyOverviewTable } = value);
	});

	function handleMaximized(event: any) {
		maximizeStudyOverviewTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeStudyOverviewTable = !storeValues.maximizeStudyOverviewTable;
			return storeValues; // Return the updated values
		});
	}

// 	onMount(async () => {
//     let initialData: StudyOverviewTableType[] = await getStudyOverviewTable(null, 100);
//     initialData = initialData.map(study => ({
//         _id: study._id,
//         studyID: study.studyID,
//         status: study.status,
//         type: study.type,
//         organisationFull: study.organisationFull,
//         organisationShort: study.organisationShort,
//         shortname: study.shortname,
//         eudract: study.eudract,
//         start: study.start,
//         phase: study.phase,
//         firstPatInPlanned: study.firstPatInPlanned,
//         permission: study.permission,
//         studyPatients: study.studyPatients.length // Setze studyPatients auf die Anzahl der patID-Werte
//     }));
//     console.log("studyPatients", initialData)
//     loadingStatus = initialData.length;
//     // Erstelle die Tabelle mit dem aktualisierten initialData
//     studyOverviewTable = createTable(
//         'studyOverviewTable',
//         initialData,
//         columns,
//         tableShownRows,
//         truncateLength,
//         sortingIndex
//     );
//     loadRemainingData(initialData, initialData?.at(-1)?._id, getStudyOverviewTable);
// });

</script>

<GenericTable
	collection="study"
	columns={columns}
	getTableData={getStudyOverviewTable}
	sortingIndex={sortingIndex}
	tableIdName={"studyOverviewTable"}
	headlineTitle={$t("studyOverviewTableTitle")}
	loadingActive={true}
	maxStoreValue={maximizeStudyOverviewTable}
	on:maximized={handleMaximized}
/>