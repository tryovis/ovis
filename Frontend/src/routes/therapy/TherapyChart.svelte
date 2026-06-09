<script lang="ts">
	import GenericCategoryChart from '../../components/GenericCategoryChart.svelte';

	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	
	let dropdownObject = [
        {label:'Art',value: 'generalType'},
		{label:'Sub-Art',value: 'subType'},
        {label:'Therapie Schema', value:'protocol'},
        {label:'Intention',value:'intention' },
        {label:'OP-Stellung',value:'surgeryContext'},
		{label: $t("localResStatus"), value: 'localRState'},
	];

	let maximizeTherapyChart: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeTherapyChart } = value);
	});

	function handleMaximized(event: any) {
		maximizeTherapyChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTherapyChart = !storeValues.maximizeTherapyChart;
			return storeValues;
		});
	}
</script>

<GenericCategoryChart
	aspectRatioMin={1.8}
	collection={'therapy'}
	{dropdownObject}
	headlineTitle={$t("therapyChartTitle")}
	headlineTooltip={$t("tooltip_ProgressChart")}
	initialDropdownValue={'generalType'}
	legendPosition={'right'}
	maxStoreValue={maximizeTherapyChart}
	tableShownRowsMin={7}
	on:maximized={handleMaximized}
/>