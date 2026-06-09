<script lang="ts">
  import TherapyGeneralTable from './TherapyGeneralTable.svelte'
  import TherapyGeneralTimeChart from './TherapyGeneralTimeChart.svelte'
  import TherapyGeneralChart from './TherapyGeneralChart.svelte'
  import TherapyGeneralComplicationChart from './TherapyGeneralComplicationChart.svelte'
  import { maxStore } from '../../store/maxStore';
  import { onMount } from 'svelte';

    // Access the store variables
    let maximizeTherapyGeneralChart: boolean
    let maximizeTherapyGeneralTable: boolean
    let maximizeTherapyGeneralTimeChart: boolean
    let maximizeTherapyGeneralComplicationChart: boolean
 
    maxStore.subscribe((value: any) => {
        ({ maximizeTherapyGeneralChart, maximizeTherapyGeneralTable, maximizeTherapyGeneralTimeChart,maximizeTherapyGeneralComplicationChart } = value);
    });
    
        //Bei betreten der Seite alle Maximierungen zurücksetzen
      onMount(async () => {
        maxStore.update((storeValues) => {
          storeValues.maximizeTherapyGeneralChart = false;
          storeValues.maximizeTherapyGeneralTable = false;
          storeValues.maximizeTherapyGeneralTimeChart = false;
          storeValues.maximizeTherapyGeneralComplicationChart = false;
          return storeValues; 
        });
       });
</script>


  <div class:grid-container-progress="{!maximizeTherapyGeneralChart && !maximizeTherapyGeneralTable && !maximizeTherapyGeneralTimeChart && !maximizeTherapyGeneralComplicationChart}">
    <div class="bar-chart box_style box_level2" style="display: {!maximizeTherapyGeneralChart && !maximizeTherapyGeneralTable && !maximizeTherapyGeneralComplicationChart ? 'block' : 'none'}">
      <TherapyGeneralTimeChart />
    </div>
    <div class="pie-chart box_style box_level2" style="display: { !maximizeTherapyGeneralTable && !maximizeTherapyGeneralTimeChart && !maximizeTherapyGeneralComplicationChart ? 'block' : 'none'}">
      <TherapyGeneralChart />
    </div>
    <div class="table-chart box_style box_level2" style="display: {!maximizeTherapyGeneralChart && !maximizeTherapyGeneralTimeChart && !maximizeTherapyGeneralComplicationChart ? 'block' : 'none'}">
      <TherapyGeneralTable />
    </div>
    <div class="complications box_style box_level2" style="display: {!maximizeTherapyGeneralChart && !maximizeTherapyGeneralTable && !maximizeTherapyGeneralTimeChart  ? 'block' : 'none'}">
      <TherapyGeneralComplicationChart/>
    </div>
</div>


<style>
    
    .grid-container-progress {
        display: grid;
        position: relative;
        height: 100%;
        grid-template-columns: 65% 35%;
        grid-template-rows: 50% 50%;
        grid-template-areas: 'bar-chart pie-chart '
                            'table-chart complications';
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

    .complications{
        grid-area: complications;
    }

</style>