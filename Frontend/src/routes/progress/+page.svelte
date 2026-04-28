<script lang="ts">
  import { maxStore } from '../../store/maxStore';
  import ProgressChart from './ProgressChart.svelte'
  import ProgressTable from './ProgressTable.svelte'
  import ProgressTimeChart from './ProgressTimeChart.svelte'
  import { onMount } from 'svelte';
    // Access the store variables
    let maximizeProgressChart: boolean;
    let maximizeProgressTable: boolean;
    let maximizeProgressTimeChart: boolean;
 
    maxStore.subscribe((value: any) => {
        ({ maximizeProgressChart, maximizeProgressTable, maximizeProgressTimeChart } = value);
    });

    onMount(async () => {
    const currentPath = window.location.pathname;
    console.log("PFAD", currentPath)
      // Überprüfe, ob die URL NICHT mit "progress" endet
      if (!currentPath.endsWith("progress")) {
        maxStore.update((storeValues) => {
          storeValues.maximizeProgressChart = false;
          storeValues.maximizeProgressTable = false;
          storeValues.maximizeProgressTimeChart = false;
          return storeValues; 
        });
      }
      //console.log("Seite neu geladen, Zustand des Layouts:", maximizeProgressChart, maximizeProgressTable, maximizeProgressTimeChart);

    });
</script>



<div class:grid-container-progress="{!maximizeProgressChart && !maximizeProgressTable && !maximizeProgressTimeChart}">
  <div class="bar-chart box_style box_level2" style="display: {!maximizeProgressChart && !maximizeProgressTable ? 'block' : 'none'}">
      <ProgressTimeChart />
    </div>
  
    <div class="pie-chart box_style box_level2" style="display: { !maximizeProgressTable && !maximizeProgressTimeChart ? 'block' : 'none'}">
      <ProgressChart />
    </div>
  
    <div class="table-chart box_style box_level2" style="display: {!maximizeProgressChart && !maximizeProgressTimeChart ? 'block' : 'none'}">
      <ProgressTable />
    </div>
</div>


<style>
    
    .grid-container-progress {
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