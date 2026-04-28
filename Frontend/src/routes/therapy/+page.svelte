<script lang="ts">
  import TherapyTable from './TherapyTable.svelte'
  import TherapyTimeChart from './TherapyTimeChart.svelte'
  import TherapyChart from './TherapyChart.svelte'
  import TherapyOpsSubstanceTables from './TherapyOpsSubstanceTables.svelte'
  import { maxStore } from '../../store/maxStore';
  import { onMount } from 'svelte';

    // Access the store variables
    let maximizeTherapyChart: boolean
    let maximizeTherapyTable: boolean
    let maximizeTherapyTimeChart: boolean
    let maximizeTherapyOpsSubstanceTables: boolean
 
    maxStore.subscribe((value: any) => {
        ({ maximizeTherapyChart, maximizeTherapyTable, maximizeTherapyTimeChart,maximizeTherapyOpsSubstanceTables } = value);
    });
    
        //Bei betreten der Seite alle Maximierungen zurücksetzen
      onMount(async () => {
        maxStore.update((storeValues) => {
          storeValues.maximizeTherapyChart = false;
          storeValues.maximizeTherapyTable = false;
          storeValues.maximizeTherapyTimeChart = false;
          storeValues.maximizeTherapyOpsSubstanceTables = false;
          return storeValues; 
        });
       });
</script>


  <div class:grid-container-progress="{!maximizeTherapyChart && !maximizeTherapyTable && !maximizeTherapyTimeChart && !maximizeTherapyOpsSubstanceTables}">
    <div class="bar-chart box_style box_level2" style="display: {!maximizeTherapyChart && !maximizeTherapyTable && !maximizeTherapyOpsSubstanceTables ? 'block' : 'none'}">
      <TherapyTimeChart />
    </div>
    <div class="pie-chart box_style box_level2" style="display: { !maximizeTherapyTable && !maximizeTherapyTimeChart && !maximizeTherapyOpsSubstanceTables ? 'block' : 'none'}">
      <TherapyChart />
    </div>
    <div class="table-chart box_style box_level2" style="display: {!maximizeTherapyChart && !maximizeTherapyTimeChart && !maximizeTherapyOpsSubstanceTables ? 'block' : 'none'}">
      <TherapyTable />
    </div>
    <div class="complications box_style box_level2" style="display: {!maximizeTherapyChart && !maximizeTherapyTable && !maximizeTherapyTimeChart  ? 'block' : 'none'}">
      <TherapyOpsSubstanceTables/>
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