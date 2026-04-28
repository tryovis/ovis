<script lang="ts">
	import { maxStore } from '../../store/maxStore';
	import TNMBodyMap from './TNMBodyMap.svelte';
	import TNM3DChart from './TNM3DChart.svelte';
	import TNMOverviewTable from './TNMOverviewTable.svelte';
	import TNMMetastasisTable from './TNMMetastasisTable.svelte';
	import TNMChart from './TNMChart.svelte';
	import { onMount } from 'svelte';

	// Access the store variables
	let maximizeTNM3DChart: boolean;
	let maximizeTNMMetastasisTable: boolean;
	let maximizeTNMBodyMap: boolean;
	let maximizeTNMOverviewTable: boolean;
	let maximizeTNMChart: boolean;

	maxStore.subscribe((value: any) => {
		({ maximizeTNM3DChart, maximizeTNMMetastasisTable, maximizeTNMBodyMap, maximizeTNMOverviewTable,maximizeTNMChart } =
			value);
	});

	          //Bei betreten der Seite alle Maximierungen zurücksetzen
		onMount(async () => {
			maxStore.update((storeValues) => {
			storeValues.maximizeTNM3DChart = false;
			storeValues.maximizeTNMMetastasisTable = false;
			storeValues.maximizeTNMBodyMap = false;
			storeValues.maximizeTNMOverviewTable = false;
			storeValues.maximizeTNMChart = false;
			return storeValues; 
        });
       });
</script>

<div class:grid-container-tnm={!maximizeTNM3DChart && !maximizeTNMBodyMap && !maximizeTNMOverviewTable && !maximizeTNMMetastasisTable && !maximizeTNMChart}>
	<div
		class="tnm-3d-chart box_style box_level2"
		style="display: {!maximizeTNMBodyMap && !maximizeTNMOverviewTable && !maximizeTNMChart && !maximizeTNMMetastasisTable? 'block' : 'none'}"
	>
		<TNM3DChart />
	</div>
	<div
		class="tnm-bodymap box_style box_level2"
		style="display: {!maximizeTNM3DChart && !maximizeTNMOverviewTable && !maximizeTNMChart && !maximizeTNMMetastasisTable ? 'block' : 'none'}"
	>
		<TNMBodyMap />
	</div>

	<div
		class="tnm-table box_style box_level2"
		style="display: {!maximizeTNM3DChart && !maximizeTNMBodyMap && !maximizeTNMChart && !maximizeTNMMetastasisTable ? 'block' : 'none'}"
	>
		<TNMOverviewTable />
	</div>
		
	<div class="tnm-pie-chart box_style box_level2" 
	style="display: {!maximizeTNM3DChart && !maximizeTNMBodyMap && !maximizeTNMMetastasisTable && !maximizeTNMOverviewTable  ? 'block' : 'none'}"
	>
		<TNMChart />
    </div>
	<div class="tnm-metastasis-table box_style box_level2" style="display: {!maximizeTNM3DChart && !maximizeTNMChart && !maximizeTNMBodyMap && !maximizeTNMOverviewTable ? 'block' : 'none'}">
        <TNMMetastasisTable />
    </div>
</div>

<style>
	.grid-container-tnm {
		display: grid;
		position: relative;
		height: 100%;
		grid-template-columns: 46% 27% 27%;
		grid-template-rows: 64% 36%;
		grid-template-areas:
			'tnm-3d-chart tnm-pie-chart tnm-bodymap '
			'tnm-table tnm-table tnm-metastasis-table';
		overflow:hidden;
	}

	.tnm-3d-chart {
		grid-area: tnm-3d-chart;
	}

	.tnm-metastasis-table {
        grid-area: tnm-metastasis-table;
    }
	 .tnm-pie-chart {
        grid-area: tnm-pie-chart;
    }

	.tnm-bodymap {
		grid-area: tnm-bodymap;
	}

	.tnm-table {
		grid-area: tnm-table;
		
	}
</style>
