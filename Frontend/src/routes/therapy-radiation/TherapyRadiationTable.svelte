<script lang="ts">
	import GenericTable from '../../components/GenericTable.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { getTherapyRadiationTable } from '../../graphQl/gql-therapy-radiation';

	let sortingIndex = 2;

	let columns = [
		{ data: 'therapyID', header: "ID", tooltip: $t("therapyID") },
		{ data: 'tumorID', header: $t("TID"), tooltip: $t("tumorID") },
		{ data: 'therapyOccurrenceDate', header: "Th-Start", tooltip: $t("therapyOccurrenceDate"), date: true },
		{ data: 'therapyDaysSinceDiagnosis', header: "TsD", tooltip: $t("therapyDaysSinceDiagnosis") },
		{ data: 'combination', header: $t("combination"), tooltip: $t("therapyCombination"), ccp: false },
		{ data: 'radiation_type', header: $t("type"), tooltip: $t("applicationMethod") },
		{ data: 'radiation_brachyType', header: "Brachy.", tooltip: $t("brachyType"), ccp: false },
		{ data: 'radiation_duration', header: $t("duration"), tooltip: $t("brachyDuration"), ccp: false },
		{ data: 'radiation_performance', header: $t("performance"), tooltip: $t("radiationPerformance"), ccp: false },
		{ data: 'radiation_stereo', header: "Stereo.", tooltip: $t("radiationStereoText"), ccp: false },
		{ data: 'radiation_breath', header: $t("breath"), tooltip: $t("radiationBreathText"), ccp: false },
		{ data: 'radiation_tech', header: "Tech.", tooltip: $t("specialTech"), ccp: false },
		{ data: 'radiation_radioType', header: $t("radioTypeShort"), tooltip: $t("radioType") },
		{ data: 'radiation_radioNuclid', header: $t("nuclidShort"), tooltip: $t("radioNuclidText"), ccp: false },
		{ data: 'radiation_singleDose', header: $t("singleDoseShort"), tooltip: $t("singleDose") },
		{ data: 'radiation_singleDoseUnit', header: "SD Unit", tooltip: $t("singleDoseUnit"), ovis: false },
		{ data: 'radiation_totalDose', header: $t("totalDoseShort"), tooltip: $t("totalDose") },
		{ data: 'totalDoseUnit', header: "TD Unit", tooltip: $t("totalDoseUnit"), ovis: false },
		{ data: 'radiation_boost', header: $t("boost"), tooltip: $t("radiationBoost"), ovis: true },
		{ data: 'radiation_subArea', header: "oBDS", tooltip: $t("radiationAreaText"), ovis: true },
		{ data: 'radiation_areaDetailed', header: $t("radiationAreaShort"), tooltip: $t("radiationAreaDetailed") },
		{ data: 'radiation_side', header: $t("side"), tooltip: $t("side") },
		{ data: 'radiation_radioTarget', header: $t("tissue"), tooltip: $t("radioTarget"), ccp: false },
		{ data: 'radiation_metastasis', header: $t("metastases"), tooltip: $t("targetArea"), ovis: false, ccp: false },
		{ data: 'radiation_lymphNodes', header: $t("LN"), tooltip: $t("lymphNodes"), ccp: false }
	];

	let maximizeTherapyRadiationTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeTherapyRadiationTable } = value);
	});

	function handleMaximized(event: any) {
		maximizeTherapyRadiationTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTherapyRadiationTable = !storeValues.maximizeTherapyRadiationTable;
			return storeValues; // Return the updated values
		});
	}

</script>

<GenericTable
	collection="therapy"
	columns={columns}
	getTableData={getTherapyRadiationTable}
	sortingIndex={sortingIndex}
	tableIdName={"therapyRadiationTable"}
	headlineTitle={$t("radiationDetails")}
	loadingActive={true}
	maxStoreValue={maximizeTherapyRadiationTable}
	on:maximized={handleMaximized}
/>