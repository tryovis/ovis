<script lang="ts">
  import { maxStore } from '../../store/maxStore';
  import ConsultationChart from './ConsultationChart.svelte'
  import ConsultationTable from './ConsultationTable.svelte'
  import ConsultationTimeChart from './ConsultationTimeChart.svelte'
  import { onMount } from 'svelte';
  
    // Access the store variables
    let maximizeConsultationChart: boolean;
    let maximizeConsultationTable: boolean;
    let maximizeConsultationTimeChart: boolean;
 

  
    maxStore.subscribe((value: any) => {
        ({ maximizeConsultationChart, maximizeConsultationTable, maximizeConsultationTimeChart } = value);
    });


        //Bei betreten der Seite alle Maximierungen zurücksetzen
        onMount(async () => {
          maxStore.update((storeValues) => {
          storeValues.maximizeConsultationChart = false;
          storeValues.maximizeConsultationTable = false;
          storeValues.maximizeConsultationTimeChart = false;
          return storeValues; 
        });
       });
</script>
<div class:grid-container-consultation="{!maximizeConsultationChart && !maximizeConsultationTable && !maximizeConsultationTimeChart}">
  <div class="bar-chart box_style box_level2" style="display: {!maximizeConsultationChart && !maximizeConsultationTable ? 'block' : 'none'}">
      <ConsultationTimeChart />
    </div>
  
    <div class="pie-chart box_style box_level2" style="display: { !maximizeConsultationTable && !maximizeConsultationTimeChart ? 'block' : 'none'}">
      <ConsultationChart />
    </div>
  
    <div class="table-chart box_style box_level2" style="display: {!maximizeConsultationChart && !maximizeConsultationTimeChart ? 'block' : 'none'}">
      <ConsultationTable />
    </div>
</div>


<style>
    
    .grid-container-consultation {
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