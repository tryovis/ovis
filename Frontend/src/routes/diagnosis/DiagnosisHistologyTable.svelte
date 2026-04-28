<script lang="ts">
	import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from '../../store/languageStore';
	import { getDiagnosisHistologyTable } from '../../graphQl/gql-diagnosis';

	let sortingIndex = 5;

	let columns = [
		{ data: 'tumorID', header: $t('TID'), tooltip: $t('tumorID') },
		{ data: 'ICDO_histologyCode', header: 'Code', tooltip: `<a target="_blank" href="https://www.dimdi.de/dynamic/de/klassifikationen/icd/icd-o-3/icd03rev2html/">${$t("histologyCodeLong")}</a>` },
		{ data: 'ICDO_histologyCodeText', header: 'Text', tooltip: $t('codeDescription') },
		{ data: 'ICDO_grading', header: $t('gradingShort'), tooltip: $t('grading') },
		{ data: 'ICDO_source', header: $t('sourceShort'), tooltip: $t('source') },
		{ data: 'ICDO_histologyDate', header: $t('date'), tooltip: $t('histologyDate'), date: true },
		{ data: 'ICDO_Nb', header: 'N(b)', tooltip: $t('positiveLymphNodes'), ovis: false },
		{ data: 'ICDO_Nu', header: 'N(u)', tooltip: $t('examinedLymphNodes'), ovis: false },
		{ data: 'ICDO_sNb', header: 'sN(b)', tooltip: $t('positiveSentinelNodes'), ovis: false },
		{ data: 'ICDO_sNu', header: 'sN(u)', tooltip: $t('examinedSentinelNodes'), ovis: false },
		{ data: 'ICDO_mixedTumor', header: 'Mix', tooltip: $t('mixedTumor') }
	];

	let maximizeDiagnosisHistologyTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeDiagnosisHistologyTable } = value);
	});

	function handleMaximized(event: any) {
		maximizeDiagnosisHistologyTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeDiagnosisHistologyTable = !storeValues.maximizeDiagnosisHistologyTable;
			return storeValues; // Return the updated values
		});
	}
</script>

<GenericTable
	columns={columns}
	collection="histology"
	getTableData={getDiagnosisHistologyTable}
	sortingIndex={sortingIndex}
	tableIdName={"diagnosisHistologyTable"}
	headlineTitle={$t("histologyDetails")}
	loadingActive={true}
	maxStoreValue={maximizeDiagnosisHistologyTable}
	on:maximized={handleMaximized}
/>