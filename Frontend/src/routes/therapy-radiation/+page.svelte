<script lang="ts">
    import TherapyRadiationTable from './TherapyRadiationTable.svelte'
    import TherapyRadiationMap from './TherapyRadiationMap.svelte'
    import TherapyRadiationChart from './TherapyRadiationChart.svelte'
    import { onMount } from 'svelte';
    import { maxStore } from '../../store/maxStore';

    // Access the store variables
    let maximizeTherapyRadiationTable: boolean
    let maximizeTherapyRadiationMap: boolean
    let maximizeTherapyRadiationChart: boolean
 
 
    maxStore.subscribe((value: any) => {
        ({ maximizeTherapyRadiationTable, maximizeTherapyRadiationMap, maximizeTherapyRadiationChart } = value);
    });


      //Bei betreten der Seite alle Maximierungen zurücksetzen
      onMount(async () => {
        maxStore.update((storeValues) => {
          storeValues.maximizeTherapyRadiationTable = false;
          storeValues.maximizeTherapyRadiationMap = false;
          storeValues.maximizeTherapyRadiationChart = false;
          return storeValues; 
        });
       });
  </script>
  
  <div class:grid-container-progress="{!maximizeTherapyRadiationTable && !maximizeTherapyRadiationMap && !maximizeTherapyRadiationChart }">
    <div class="bar-chart box_style box_level2" style="display: {!maximizeTherapyRadiationTable && !maximizeTherapyRadiationChart ? 'block' : 'none'}">
        <TherapyRadiationMap />
      </div>
    
      <div class="pie-chart box_style box_level2" style="display: {!maximizeTherapyRadiationMap && !maximizeTherapyRadiationTable ? 'block' : 'none'}">
        <TherapyRadiationChart />
      </div>
    
      <div class="table-chart box_style box_level2" style="display: {!maximizeTherapyRadiationMap && !maximizeTherapyRadiationChart ? 'block' : 'none'}">
        <TherapyRadiationTable />
      </div>  
  </div>
  
  
  <style>
      
      .grid-container-progress {
          display: grid;
          position: relative;
          height: 100%;
          grid-template-columns: 50% 50%;
          grid-template-rows: 60% 40%;
          grid-template-areas: 'pie-chart bar-chart'
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