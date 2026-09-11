<script lang="ts">
    import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t } from '../../store/languageStore';
	import { getStudyPatientTable } from '../../graphQl/gql-study';

	let sortingIndex = 3;

	$: columns = [
		{ data: 'studyID', header: $t('studyID'), tooltip: $t('studyIDTooltip') },
		{ data: 'shortname', header: $t('studyName'), tooltip: $t('studyShortnameTooltip') },
		{ data: 'patID', header: $t('PID'), tooltip: $t('patientID') },
		{ data: 'recruitmentDate', header: $t('studyRecruitment'), tooltip: $t('studyRecruitmentDate'), date: true }
	];

	let maximizeStudyPatientTable: boolean;
	$: ({ maximizeStudyPatientTable } = $maxStore);

	function handleMaximized(event: any) {
		maximizeStudyPatientTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeStudyPatientTable = !storeValues.maximizeStudyPatientTable;
			return storeValues; // Return the updated values
		});
	}

</script>

<GenericTable
	collection="studyPatient"
	countCollection="studyPatient"
	columns={columns}
	getTableData={getStudyPatientTable}
	sortingIndex={sortingIndex}
	tableIdName={"studyPatientTable"}
	headlineTitle={$t("studyPatientTableTitle")}
	loadingActive={true}
	maxStoreValue={maximizeStudyPatientTable}
	on:maximized={handleMaximized}
/>
