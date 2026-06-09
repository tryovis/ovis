<script lang="ts">
    import MolecularMarkerTable from './MolecularMarkerTable.svelte'
    import MolecularMarkerChart from './MolecularMarkerChart.svelte'
  

    import { maxStore } from '../../store/maxStore';
    import { onMount } from 'svelte';
  
      // Access the store variables
      let maximizeMolecularMarkerChart: boolean
      let maximizeMolecularMarkerTable: boolean
  
   
      maxStore.subscribe((value: any) => {
          ({ maximizeMolecularMarkerChart, maximizeMolecularMarkerTable} = value);
      });
      
          //Bei betreten der Seite alle Maximierungen zurücksetzen
        onMount(async () => {
          maxStore.update((storeValues) => {
            storeValues.maximizeMolecularMarkerChart = false;
            storeValues.maximizeMolecularMarkerTable = false;
            return storeValues; 
          });
         });
  </script>
  
  
    <div class:grid-container-progress="{!maximizeMolecularMarkerChart && !maximizeMolecularMarkerTable}">
      <div class="table-chart box_style box_level2" style="display: {!maximizeMolecularMarkerChart ? 'block' : 'none'}">
        <MolecularMarkerTable />
      </div>
      <div class="bar-chart box_style box_level2" style="display: { !maximizeMolecularMarkerTable ? 'block' : 'none'}">
        <MolecularMarkerChart />
      </div>
  </div>
  
  
  <style>
      
      .grid-container-progress {
          display: grid;
          position: relative;
          height: 100%;
          grid-template-columns: 50% 50%;
          grid-template-rows: 50% 50%;
          grid-template-areas: 'table-chart bar-chart'
                              'table-chart bar-chart';
      }
  
      .bar-chart {
          grid-area: bar-chart;
      }
    
      .table-chart {
          grid-area: table-chart;
      }
  

  
  </style>