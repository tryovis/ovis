<script lang="ts">
	// @ts-nocheck
  import { onMount } from 'svelte';
  import { getPatientSingleHeader } from '../../graphQl/gql-patient-single';
  import { t, locale, locales } from "../../store/languageStore";
  import { singlePatientStore } from '../../store/singlePatientStore.js';
  import { variantStore } from '../../store/variantStore.js';

  let singlePatientID = "";

  // CCP data has no patient location; its cohort views omit it as well.
  let isCCP = false;
  variantStore.subscribe((value) => {
    ({ isCCP } = value);
  });

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
  {#if !isCCP}
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
  {/if}
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
  /* Keep each value beside its label. Floats wrapped the values below long
     (German) labels, where the next panel hid them. */
  .left > div, .middle > div, .right > div {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    column-gap: 1em;
  }
  .values p {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .top {
    width: 100%;
  }
  /* Share the row below the name equally, whether two or three groups are
     shown. The non-zero basis keeps them from sharing the name's line. */
  .left, .right, .middle {
    flex: 1 1 30%;
    min-width: 0;
  }
</style>
