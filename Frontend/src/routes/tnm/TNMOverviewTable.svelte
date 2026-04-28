<script lang="ts">
	import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { getTNMOverviewTable } from '../../graphQl/gql-tnm';

	// let isCCP: boolean;
	// variantStore.subscribe((value: any) => {
	// 	({ isCCP } = value);
	// });

	let sortingIndex = 1;

	let maximizeTNMOverviewTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeTNMOverviewTable } = value);
	});

	function handleMaximized(event: any) {
		maximizeTNMOverviewTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTNMOverviewTable = !storeValues.maximizeTNMOverviewTable;
			return storeValues; // Return the updated values
		});
		// if (maximizeTNMOverviewTable) {
		// 	changeRowCount(tnmTable, tableShownRowsMax);
		// } else {
		// 	changeRowCount(tnmTable, tableShownRows);
		// }
	}

	let columns = [
		{ data: 'tumorID', header: $t("TID"), tooltip: $t("tumorID") },
		{ data: 'tnmOccurrenceDate', header: $t("date"), tooltip: $t("tnmDate"), date: true },
		{ data: 'version', header: "v", tooltip: $t("tnmVersion"), ovis: false },
		{ data: 'type', header: $t("type"), tooltip: $t("tnmTypeEntry") },
		{ data: 'a', header: "a", tooltip: $t("autopsy"), ccp: false },
		{ data: 'r', header: "r", tooltip: $t("recurrenceText") },
		{ data: 'y', header: "y", tooltip: $t("multimodalTherapy") },
		{ data: 'preT', header: "p", tooltip: $t("pT"), sup: "T" },
		{ data: 'T', header: "T", tooltip: $t("T") },
		{ data: 'multipleT', header: "m", tooltip: $t("m") },
		{ data: 'preN', header: "p", tooltip: $t("pN"), sup: "N" },
		{ data: 'N', header: "N", tooltip: $t("N") },
		{ data: 'Nb', header: "N", tooltip: $t("positiveLymphNodes"), sup: "b", ccp: false },
		{ data: 'Nu', header: "N", tooltip: $t("examinedLymphNodes"), sup: "u", ccp: false },
		/*{ data: 'sN' },
		{ data: 'sNb' },
		{ data: 'sNu' },*/
		{ data: 'preM', header: "p", tooltip: $t("pM"), sup: "M" },
		{ data: 'M', header: "M", tooltip: $t("M") },
		{ data: 'total', header: $t("totalShort"), tooltip: $t("tnmTotal") },
		{ data: 'RClass', header: "R", tooltip: $t("rClassification") , ccp: false },
		{ data: 'L', header: "L", tooltip: $t("lymphVesselInvasion")  },
		{ data: 'V', header: "V", tooltip: $t("venousInvasion")  },
		{ data: 'Pn', header: "Pn", tooltip: $t("perineuralInvasion")  },
		{ data: 'S', header: "S", tooltip: $t("serumTumorMarker")  },
		{ data: 'UICC', header: "UICC", tooltip: $t("uiccTotal") }
	];

</script>

<GenericTable
	collection="tnm"
	columns={columns}
	getTableData={getTNMOverviewTable}
	sortingIndex={sortingIndex}
	tableIdName={"tnmTable"}
	headlineTitle={$t("tnmDetails")}
	loadingActive={true}
	maxStoreValue={maximizeTNMOverviewTable}
	on:maximized={handleMaximized}
/>