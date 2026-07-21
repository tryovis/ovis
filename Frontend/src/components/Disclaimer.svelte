<script lang="ts">
  import { onMount } from 'svelte';
  import { env } from '$env/dynamic/public';
  import { t } from '../store/languageStore';

  const SHOW_USERAGREEMENT =
    String(env.PUBLIC_SITE_SPECIFIC_SHOW_USERAGREEMENT).toLowerCase() === 'true';

  let showDisclaimer = false;

  function hasDisclaimerBeenShown(): boolean {
    return sessionStorage.getItem('disclaimerShown') === 'true';
  }

  function markDisclaimerAsShown(): void {
    sessionStorage.setItem('disclaimerShown', 'true');
  }

  onMount(() => {
    showDisclaimer = !hasDisclaimerBeenShown();
  });

  function closeDisclaimer(): void {
    showDisclaimer = false;
    markDisclaimerAsShown();
  }
</script>

{#if showDisclaimer}
  <div
    class="disclaimer"
    role="dialog"
    aria-modal="true"
    aria-labelledby="disclaimer-title"
  >
    <div class="disclaimer-content">
      <h2 id="disclaimer-title">{$t('disclaimer')}</h2>

      <p>{@html $t('disclaimer0')}</p>
      <p>{@html $t('disclaimer1')}</p>
      <p>{@html $t('disclaimer2')}</p>

      {#if SHOW_USERAGREEMENT}
        <p>{@html $t('disclaimer4')}</p>
      {/if}

      <button type="button" on:click={closeDisclaimer}>
        {$t('accept')}
      </button>

      <p class="citation-notice">
        {@html $t('disclaimer3')}
      </p>
    </div>
  </div>
{/if}

<div
  class:overlay-visible={showDisclaimer}
  class="overlay"
  aria-hidden="true"
></div>

<style>
  .disclaimer {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 9999;
    width: min(700px, calc(100vw - 40px));
    max-height: calc(100vh - 40px);
    overflow-y: auto;
    padding: 20px;
    border: 1px solid #ccc;
    border-radius: 5px;
    background-color: #fff;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
    transform: translate(-50%, -50%);
  }

  .disclaimer-content {
    text-align: center;
  }

  .disclaimer button {
    margin-top: 10px;
  }

  .citation-notice {
    margin-top: 18px;
    margin-bottom: 0;
    font-size: 0.9rem;
  }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: -1;
    display: none;
    background-color: rgba(0, 0, 0, 0.5);
  }

  .overlay-visible {
    z-index: 9998;
    display: block;
  }
</style>