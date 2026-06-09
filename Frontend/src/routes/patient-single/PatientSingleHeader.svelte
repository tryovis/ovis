<script lang="ts">
	// @ts-nocheck
  import { onMount } from 'svelte';
  import { getPatientSingleHeader } from '../../graphQl/gql-patient-single';
  import { t, locale, locales } from "../../store/languageStore";
  import { singlePatientStore } from '../../store/singlePatientStore.js';

  let singlePatientID = "";


  singlePatientStore.subscribe((value) => {
    singlePatientID = value.singlePatient; // Hier den Wert direkt zuweisen
  });

  $: singlePatient = {};

  const maxLength = 20; // Variable für die maximale Länge

  onMount(async () => {
      singlePatient = await getPatientSingleHeader(singlePatientID);
      console.log("SinglePatient", singlePatient);
  });

  function truncateText(text: string | undefined, maxLength: number): string {
      if (text && text.length > maxLength) {
          return text.substring(0, maxLength) + '...';
      }
      return text || ''; // Rückgabe eines leeren Strings, wenn text undefined ist
  }
</script>

<div class="container">
  <div class="top">
    <div>
      <b><!--{singlePatient.title ? " " : ""}-->{singlePatient.firstName} {singlePatient.lastName}</b>
    </div>
  </div>
  <div class="left">
    <div>
      <div class="labels">
        <i><b>
          <p>{$t("patientID")}: </p>
          <p>{$t("birthDateLong")}: </p>
          <p>{$t("gender")}: </p>
        </b></i>
      </div>
      <div class="values">
        <p>{truncateText(singlePatient.patID, maxLength)}</p>
        <p>{truncateText(singlePatient.birthDate, maxLength)}</p>
        <p>{truncateText(singlePatient.gender, maxLength)}</p>
      </div>
    </div>
  </div>
  <div class="middle">
    <div>
      <div class="labels">
        <i><b>
          <p>{$t("ZIPCode")}: </p>
          <p>{$t("city")}: </p>
          <p>{$t("countryLong")}: </p>
        </b></i>
      </div>
      <div class="values">
        <p>{truncateText(singlePatient.postalCode, maxLength)}</p>
        <p>{truncateText(singlePatient.area, maxLength)}</p>
        <p>{truncateText(singlePatient.countryCode, maxLength)}</p>
      </div>
    </div>
  </div>
  <div class="right">
    <div>
      <div class="labels">
        <i><b>
          <p>{$t("diagnoses")}: </p>
          <p>{$t("ageAtFirstDiagnosis")}: </p>
          <p>{$t("lastVitalStatus")}: </p>
        </b></i>
      </div>
      <div class="values">
        <p>{truncateText(singlePatient.diagnosis, maxLength)}</p>
        <p>{truncateText(singlePatient.ageAtDiagnosis, maxLength)}</p>
        <p>{truncateText(singlePatient.vitalDate, maxLength)} ({truncateText(singlePatient.vitalState, maxLength)})</p>
      </div>
    </div>
  </div>
</div>

<style>
  .container {
    display: flex;
    flex-wrap: wrap; /* Erlaubt den Zeilenumbruch der Panels */
    padding: 5px;
  }
  .labels {
    float: left;
  }
  .values {
    float: left;
    margin-left: 5%;
  }
  .top {
    width: 100%;
  }
  .left, .right, .middle {
    width: 33%;
  }
</style>
