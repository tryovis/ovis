<script lang="ts">
  import { maxStore } from '../../store/maxStore';
  import StatusChart from './StatusChart.svelte'
  import StatusTable from './StatusTable.svelte'
  import StatusTimeChart from './StatusTimeChart.svelte'
  import { onMount } from 'svelte';
  //import StatusRecommendationTable from './StatusRecommendationTable.svelte'

    // Access the store variables
    let maximizeStatusChart: boolean;
    let maximizeStatusTable: boolean;
    let maximizeStatusTimeChart: boolean;
 
    maxStore.subscribe((value: any) => {
        ({ maximizeStatusChart, maximizeStatusTable, maximizeStatusTimeChart } = value);
    });
	          //Bei betreten der Seite alle Maximierungen zurücksetzen
      onMount(async () => {
        maxStore.update((storeValues) => {
          storeValues.maximizeStatusChart = false;
          storeValues.maximizeStatusTable = false;
          storeValues.maximizeStatusTimeChart = false;

			    return storeValues; 
        });
       });
</script>
<div class:grid-container-Status="{!maximizeStatusChart && !maximizeStatusTable && !maximizeStatusTimeChart}">
  <div class="bar-chart box_style box_level2" style="display: {!maximizeStatusChart && !maximizeStatusTable ? 'block' : 'none'}">
      <StatusTimeChart />
    </div>
    <div class="pie-chart box_style box_level2" style="display: { !maximizeStatusTable && !maximizeStatusTimeChart ? 'block' : 'none'}">
      <StatusChart />
    </div>
    <div class="table-chart box_style box_level2" style="display: {!maximizeStatusChart && !maximizeStatusTimeChart ? 'block' : 'none'}">
      <StatusTable />
    </div>
    <!--<div class="table-chart box_style box_level2" style="display: {!maximizeStatusChart && !maximizeStatusTimeChart ? 'block' : 'none'}">
      <StatusRecommendationTable />
    </div>-->
</div>


<style>
    
    .grid-container-Status {
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