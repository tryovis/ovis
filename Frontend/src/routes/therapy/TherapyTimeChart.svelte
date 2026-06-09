<script lang="ts">
	import GenericTimeChart from '../../components/GenericTimeChart.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	
	const dropdownObject = [
		{ label: 'Therapien', value: 'generalType' },
	];

	let maximizeTherapyTimeChart: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeTherapyTimeChart } = value);
	});

	function handleMaximized(event: any) {
		maximizeTherapyTimeChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTherapyTimeChart = !storeValues.maximizeTherapyTimeChart;
			return storeValues;
		});
	}
</script>

<GenericTimeChart
  aspectRatioMin={3.8}
  {dropdownObject}
  initialDropdownValue={'generalType'}
  headlineTitle={$t("timeChartTitleTherapy")}
  on:maximized={handleMaximized}
  maxStoreValue={maximizeTherapyTimeChart}
  collection={"therapy"}
/>


