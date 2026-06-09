<script lang="ts">
	// @ts-nocheck
    import { numberPickerStore, toggleNumberPicker } from '../store/numberPickerStore';
    import { reloadOnly } from '../store/reloadStore';
	import { t, locale, locales } from "../store/languageStore";
    import type { LensDataPasser } from "@samply/lens";
    import { onMount } from 'svelte';
    import { addNumberInterval } from './extendedAstFunctions';
    import { iconPath } from '$lib/path-utils';

    let dataPasser: LensDataPasser;

    const removeIcon = iconPath('times-circle.svg');
    const infoIcon = iconPath('info-outlined.svg');

    $: collection = $numberPickerStore.collection;
    $: fieldName = $numberPickerStore.fieldName;
    $: lowerValue = $numberPickerStore.selectedNumber;
    let upperValue; // Kein Standardwert setzen, sondern reaktiv zuweisen

    // Falls upperValue noch nicht gesetzt wurde, initialisiere es mit lowerValue
    $: if (upperValue === undefined) {
        upperValue = lowerValue;
    }

    // Beim Öffnen des Fensters: upperValue wird einmalig auf lowerValue gesetzt
    onMount(async () => {
        await import("@samply/lens");
        upperValue = lowerValue;
    });

    function addNumber() {
        if (collection === "histology" || fieldName === "tumorID") {
            collection = "diagnosis";
        }
  
        console.log("LOWER VALUE", lowerValue);
        console.log("UPPER VALUE", upperValue);
        console.log("SYSTEm", collection)

        /*dataPasser.addStratifierToQueryAPI({
            label: `${Number(lowerValue)} - ${Number(upperValue)}`,
            catalogueGroupCode: fieldName + "",
            parentGroupCode: collection + ""
        });*/
        //console.log("Sending to Stratifier:", `label: ${Number(upperValue)} - ${Number(upperValue)}`);
        dataPasser.setQueryStoreFromAstAPI(
            addNumberInterval(
                Number(lowerValue),
                Number(upperValue),
                dataPasser.getAstAPI(),
                collection,      // z. B. "diagnosis" / "tnm"
                fieldName        // z. B. "ageAtDiagnosis" / "tumorID"
            ),
            collection,
            fieldName
        );

        reloadOnly();
        // Schließt die Number-Picker-Komponente
        toggleNumberPicker(false);
    }

    $: isConfirmDisabled = Number(upperValue) < Number(lowerValue);
</script>

<lens-data-passer bind:this={dataPasser} />

<div class="disclaimer box_style box_level1">
    <b>Filter {collection}:{fieldName}</b>
    <button class="iconRoundButton tooltip">
        <span class="tooltiptext">{@html $t("tooltip_numberPicker")}</span>
        <img src="{infoIcon}" alt="info" class="iconRound" />
    </button>
    <button class="iconRoundButton" style="float:right" on:click={() => toggleNumberPicker(false)}>
        x
    </button>
    <div>
        <div class="box_style box_level2 input-container">
            <label for="lowerValue">Von:</label>
            <input
                type="text"
                id="lowerValue"
                name="lowerValue"
                bind:value={lowerValue}
                placeholder="Enter lower value"
            />
            <label for="upperValue">Bis:</label>
            <input
                type="text"
                id="upperValue"
                name="upperValue"
                bind:value={upperValue}
                placeholder="Enter upper value"
            />
        </div>
    </div>
    <!-- Confirm Button mit Tooltip -->
    <div class="confirm-button-container">
        <button
            class="confirm-button tooltip"
            disabled={isConfirmDisabled}
            on:click={addNumber}
        >
            Confirm
        </button>
    </div>
</div>
<!-- Half-transparent overlay -->
<div class="overlay overlay-visible"></div>

<style>
    .input-container {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 98%;
    }

    .input-container label {
        white-space: nowrap;
        margin: 5px;
    }

    .input-container input {
        flex: 1;
        min-width: 40px;
    }

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
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        z-index: 9999;
    }

    .overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: -1;
        display: none;
    }

    .overlay-visible {
        display: block;
        z-index: 9998;
    }

    .confirm-button-container {
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        margin: 5px;
        width: 100%;
        height: 100%;
    }

    .confirm-button {
        font-size: 1em;
        padding: 10px 20px;
        border: 1px solid var(--border-color);
        border-radius: 5px;
        background-color: rgb(235, 235, 235);
        color: var(--font-color);
        cursor: pointer;
        transition: background-color 0.3s ease, box-shadow 0.3s ease;
    }

    .confirm-button:hover {
        background-color: rgb(220, 220, 220);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .confirm-button:disabled {
        cursor: not-allowed;
        background-color: #f7f7f7;
        color: #aaa;
        border: 1px solid #ddd;
    }
</style>
