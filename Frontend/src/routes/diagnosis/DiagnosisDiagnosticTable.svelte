<script lang="ts">
	import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from '../../store/languageStore';
	import { getDiagnosisDiagnosticTable } from '../../graphQl/gql-diagnosis';

	let sortingIndex = 2;

	let columns = [
		{ data: 'tumorID', header: $t('TID'), tooltip: $t('tumorID') },
		{ data: 'investigationMethod', header: $t('method'), tooltip: $t('diagnosticProcedure') },
		{ data: 'diagnosticOccurrenceDate', header: $t('date'), tooltip: $t('diagnosticDate'), date: true }
	];

	let maximizeDiagnosisDiagnosticTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeDiagnosisDiagnosticTable } = value);
	});

	function handleMaximized(event: any) {
		maximizeDiagnosisDiagnosticTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeDiagnosisDiagnosticTable = !storeValues.maximizeDiagnosisDiagnosticTable;
			return storeValues; // Return the updated values
		});
	}
</script>

<GenericTable
	columns={columns}
	collection="diagnostic"
	getTableData={getDiagnosisDiagnosticTable}
	sortingIndex={sortingIndex}
	tableIdName={"diagnosisDiagnosticTable"}
	headlineTitle={$t("diagnosticDetails")}
	loadingActive={true}
	maxStoreValue={maximizeDiagnosisDiagnosticTable}
	on:maximized={handleMaximized}
/>