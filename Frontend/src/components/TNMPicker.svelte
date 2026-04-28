<script lang="ts">
  import { onMount } from "svelte";
  import type { LensDataPasser } from "@samply/lens";
  import { TNMPickerStore, toggleTNMPicker } from "../store/TNMPickerStore";
  import { reloadOnly } from "../store/reloadStore";
  import { t } from "../store/languageStore";
  import { iconPath } from '$lib/path-utils';

  let dataPasser: LensDataPasser;

  const infoIcon = iconPath('info-outlined.svg');

  $: collection = $TNMPickerStore.collection;
  $: typeOfTNM = $TNMPickerStore.typeOfTNM; // "T" | "N" | "M"
  $: selectedTNM = ($TNMPickerStore.selectedTNM ?? "").toString().trim();

  function close() {
    toggleTNMPicker(false);
  }

  function addEquals(fieldName: string, value: string) {
    // EQUALS-Filter über Lens API (wie bei Quicktools)
    dataPasser.addStratifierToQueryAPI({
      label: value,
      catalogueGroupCode: fieldName,
      parentGroupCode: collection + ""
    });

    reloadOnly();
  }

  function applyExact() {
    addEquals(typeOfTNM, selectedTNM);
    close();
  }

  function applyGrouped() {
    addEquals(`${typeOfTNM}Group`, selectedTNM);
    close();
  }

  // Sicherheitsnetz: falls der Picker ohne gültigen Wert geöffnet wurde
  onMount(async () => {
    await import("@samply/lens");
    if (!selectedTNM) close();
  });
</script>

<lens-data-passer bind:this={dataPasser} />

<div class="disclaimer box_style box_level1">
  <b>Filter {collection}:{typeOfTNM}</b>

  <button class="iconRoundButton tooltip">
    <span class="tooltiptext">{@html $t("tooltip_tnmPicker")}</span>
    <img src="{infoIcon}" alt="info" class="iconRound" />
  </button>

  <button class="iconRoundButton" style="float:right" on:click={close}>
    x
  </button>

  <div class="box_style box_level2" style="margin-top:10px;">
    <div><b>TNM-Value:</b> {selectedTNM}</div>

    <div style="margin-top:12px; display:flex; gap:10px; justify-content:center;">
      <button class="confirm-button" on:click={applyExact}>
        {$t("tnm_exact")}
      </button>
      <button class="confirm-button" on:click={applyGrouped}>
        {$t("tnm_grouped")}
      </button>
    </div>
  </div>
</div>

<div class="overlay overlay-visible"></div>

<style>
  .disclaimer {
    width: 420px;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: #fff;
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 5px;
    box-shadow: 0 0 10px rgba(0,0,0,0.1);
    z-index: 9999;
  }
  .overlay {
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 9998;
  }
  .confirm-button {
    font-size: 1em;
    padding: 10px 20px;
    border: 1px solid var(--border-color);
    border-radius: 5px;
    background-color: rgb(235,235,235);
    color: var(--font-color);
    cursor: pointer;
  }
</style>
