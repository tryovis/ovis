<script lang="ts">
  import { maxStore } from '../../store/maxStore';
  import TumorboardChart from './TumorboardChart.svelte'
  import TumorboardTable from './TumorboardTable.svelte'
  import TumorboardTimeChart from './TumorboardTimeChart.svelte'
  import { onMount } from 'svelte';
  //import TumorboardRecommendationTable from './TumorboardRecommendationTable.svelte'

    // Access the store variables
    let maximizeTumorboardChart: boolean;
    let maximizeTumorboardTable: boolean;
    let maximizeTumorboardTimeChart: boolean;
 
    maxStore.subscribe((value: any) => {
        ({ maximizeTumorboardChart, maximizeTumorboardTable, maximizeTumorboardTimeChart } = value);
    });
	          //Bei betreten der Seite alle Maximierungen zurücksetzen
      onMount(async () => {
        maxStore.update((storeValues) => {
          storeValues.maximizeTumorboardChart = false;
          storeValues.maximizeTumorboardTable = false;
          storeValues.maximizeTumorboardTimeChart = false;

			    return storeValues; 
        });
       });
</script>
<div class:grid-container-tumorboard="{!maximizeTumorboardChart && !maximizeTumorboardTable && !maximizeTumorboardTimeChart}">
  <div class="bar-chart box_style box_level2" style="display: {!maximizeTumorboardChart && !maximizeTumorboardTable ? 'block' : 'none'}">
      <TumorboardTimeChart />
    </div>
    <div class="pie-chart box_style box_level2" style="display: { !maximizeTumorboardTable && !maximizeTumorboardTimeChart ? 'block' : 'none'}">
      <TumorboardChart />
    </div>
    <div class="table-chart box_style box_level2" style="display: {!maximizeTumorboardChart && !maximizeTumorboardTimeChart ? 'block' : 'none'}">
      <TumorboardTable />
    </div>
    <!--<div class="table-chart box_style box_level2" style="display: {!maximizeTumorboardChart && !maximizeTumorboardTimeChart ? 'block' : 'none'}">
      <TumorboardRecommendationTable />
    </div>-->
</div>


<style>
    
    .grid-container-tumorboard {
        display: grid;
        position: relative;
        height: 100%;
        grid-template-columns: 60% 40%;
        grid-template-rows: 50% 50%;
        grid-template-areas: 'bar-chart pie-chart'
                            'table-chart table-chart';
    }

    .bar-chart {
        grid-area: bar-chart;
    }

    .pie-chart {
        grid-area: pie-chart;
    }

    .table-chart {
        grid-area: table-chart;
    }

</style>