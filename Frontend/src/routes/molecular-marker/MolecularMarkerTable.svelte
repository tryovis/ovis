<script lang="ts">
	import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { getMolecularMarkerTable } from '../../graphQl/gql-molecular-marker';

	let sortingIndex = 2;

	let columns = [
		{ data: 'patID', header: $t("PID"), tooltip: $t("patientIdentificationNumber") },
		{ data: 'tumorID', header: $t("TID"), tooltip: $t("tumorIdentificationNumber") },
		{ data: 'molecularMarkerOccurrenceDate', header: $t("date"), tooltip: $t("recordingDate") , date: true },
		{ data: 'type', header: $t("marker"), tooltip: $t("molecularMarker") },
		{ data: 'exon', header: $t("exon"), tooltip: $t("exon") },
		{ data: 'status', header: $t("status"), tooltip: $t("status") },
		{ data: 'miscellaneous', header: $t("miscellaneous"), tooltip: $t("additionalFreeTextInformation") },
		{ data: 'method', header: $t("method"), tooltip: $t("method") },
		{ data: 'project', header: $t("project"), tooltip: $t("project"), ccp: false }
	];

	let maximizeMolecularMarkerTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeMolecularMarkerTable } = value);
	});
	
	function handleMaximized(event: any) {
		maximizeMolecularMarkerTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeMolecularMarkerTable = !storeValues.maximizeMolecularMarkerTable;
			return storeValues;
		});
	}
</script>

<GenericTable
	columns={columns}
	collection="molecularMarker"
	getTableData={getMolecularMarkerTable}
	sortingIndex={sortingIndex}
	tableIdName={"molecularMarkerTable"}
	headlineTitle={$t("molecularMarkerDetails")}
	loadingActive={true}
	maxStoreValue={maximizeMolecularMarkerTable}
	on:maximized={handleMaximized}
/>