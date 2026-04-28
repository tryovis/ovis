<script lang="ts">
  import { onMount } from 'svelte';
  import { t, locale, locales } from "../store/languageStore";

  let showDisclaimer = false;

  function hasDisclaimerBeenShown() {
    return sessionStorage.getItem('disclaimerShown') === 'true';
  }

  function markDisclaimerAsShown() {
    sessionStorage.setItem('disclaimerShown', 'true');
  }

  onMount(() => {
    showDisclaimer = !hasDisclaimerBeenShown();
  });

  function closeDisclaimer() {
    showDisclaimer = false;
    markDisclaimerAsShown();
  }
</script>

{#if showDisclaimer}
  <div class="disclaimer">
    <div class="disclaimer-content">
      <h2>{$t("disclaimer")} </h2>
      <p>{@html $t('disclaimer0')}</p>
      <p>{@html $t('disclaimer1')}</p>
      <p>{@html $t('disclaimer2')}</p>
      <p>{@html $t('disclaimer3')}</p>
      <button on:click={closeDisclaimer}>{$t("accept")}</button>
    </div>
  </div>
{/if}

<!-- Half-transparent overlay -->
<div class="{showDisclaimer ? 'overlay overlay-visible' : 'overlay'}"></div>

<style>
  .disclaimer {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: #fff;
    padding: 20px;
    border: 1px solid #ccc;
    border-radius: 5px;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
    z-index: 9999;
  }

  .disclaimer-content {
    text-align: center;
  }

  .disclaimer button {
    margin-top: 10px;
  }

  /* Half-transparent overlay */
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5); /* Half-transparent background */
    z-index: -1; /* Initially behind everything */
    display: none; /* Initially hidden */
  }

  .overlay-visible {
    display: block; /* Display when the disclaimer is shown */
    z-index: 9998; /* Ensure it's above the rest of the page */
  }
</style>
