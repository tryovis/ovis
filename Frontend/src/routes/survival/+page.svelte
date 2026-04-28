<script lang="ts">
  import { maxStore } from '../../store/maxStore';
  import SurvivalKaplanMeierChart from './SurvivalKaplanMeierChart.svelte'
  import SurvivalKaplanMeierTable from './SurvivalCoxRegression.svelte'
  import SurvivalFollowUpAssessment from './SurvivalFollowUpAssessment.svelte'
  import { onMount } from 'svelte';
      // Access the store variables
    let maximizeSurvivalKaplanMeierChart: boolean;
    let maximizeSurvivalCoxRegression: boolean;
    let maximizeSurvivalFollowUpAssessment: boolean;
 
    maxStore.subscribe((value: any) => {
        ({ maximizeSurvivalKaplanMeierChart, maximizeSurvivalCoxRegression, maximizeSurvivalFollowUpAssessment } = value);
    });

        //Bei betreten der Seite alle Maximierungen zurücksetzen
      onMount(async () => {
        maxStore.update((storeValues) => {
          storeValues.maximizeSurvivalKaplanMeierChart = false;
          storeValues.maximizeSurvivalCoxRegression = false;
          storeValues.maximizeSurvivalFollowUpAssessment = false;
          return storeValues; 
        });
       });
</script>

<div class:grid-container-survival="{!maximizeSurvivalKaplanMeierChart && !maximizeSurvivalCoxRegression && !maximizeSurvivalFollowUpAssessment }">
  <div class="kaplan-meier-chart box_style box_level2" style="display: { !maximizeSurvivalCoxRegression && !maximizeSurvivalFollowUpAssessment  ? 'block' : 'none'}">
      <SurvivalKaplanMeierChart />
    </div>
    <div class="kaplan-meier-table box_style box_level2" style="display: {!maximizeSurvivalKaplanMeierChart &&  !maximizeSurvivalFollowUpAssessment  ? 'block' : 'none'}">
      <SurvivalKaplanMeierTable />
    </div>
    <div class="follow-up box_style box_level2" style="display: {!maximizeSurvivalKaplanMeierChart && !maximizeSurvivalCoxRegression  ? 'block' : 'none'}">
      <SurvivalFollowUpAssessment />
    </div>
</div>


<style>
    .grid-container-survival {
        display: grid;
        height: 100%;
        position: relative;
        grid-template-columns: 60% 40%;
        grid-template-rows: 50% 50%;
        grid-template-areas: 'kaplan-meier-chart kaplan-meier-table'
                            'kaplan-meier-chart follow-up';
    }

    .kaplan-meier-chart {
        grid-area: kaplan-meier-chart;
    }

    .kaplan-meier-table {
        grid-area: kaplan-meier-table;
    }

    .follow-up {
        grid-area: follow-up;
    }
    
</style>