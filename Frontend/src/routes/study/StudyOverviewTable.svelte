<script lang="ts">
	import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t } from '../../store/languageStore';
	import { getStudyOverviewTable } from '../../graphQl/gql-study';

	let sortingIndex = 1;

	$: columns = [
		{ data: 'studyID', header: $t('studyID'), tooltip: $t('studyIDTooltip') },
		{ data: 'shortname', header: $t('studyShortname'), tooltip: $t('studyShortnameTooltip') },
		{ data: 'status', header: $t('status'), tooltip: $t('studyStatusTooltip') },
		{ data: 'start', header: $t('studyStart'), tooltip: $t('studyStart'), date: true },
		{ data: 'firstPatInPlanned', header: $t('studyPlannedRecruitment'), tooltip: $t('studyPlannedRecruitmentTooltip'), date: true },
		{ data: 'phase', header: $t('studyPhase'), tooltip: $t('studyPhaseTooltip') },
		{ data: 'eudract', header: 'EudraCT', tooltip: 'EudraCT' },
		{ data: 'organisationFull', header: $t('studyClinicFull'), tooltip: $t('studyClinicFullTooltip') },
		{ data: 'organisationShort', header: $t('clinic'), tooltip: $t('studyClinicShortTooltip') },
		{ data: 'studyPatients', header: $t('studyPatients'), tooltip: $t('studyPatientsTooltip'), numOfObj: true }
	];

	let maximizeStudyOverviewTable: boolean;
	$: ({ maximizeStudyOverviewTable } = $maxStore);

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
