<script lang="ts">
  import '../app.css';
  import Menubar from '../components/menubar/Menubar.svelte';
  import Quicktools from '../components/quicktools/Quicktools.svelte';
  import Disclaimer from '../components/Disclaimer.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { getUser, updateUser } from '../graphQl/gql-userManagement';
  import { getLastMetaData } from '../graphQl/gql-generic';
  import { userStore } from '../store/userStore';
  import { toastStore } from '../store/toastStore';
  import { t, locale } from "../store/languageStore";
  import { reloadStore, reloadOnly } from '../store/reloadStore';
  import { filterActiveStore } from '../store/filterActiveStore.js';
  import { datePickerStore } from '../store/datePickerStore';
  import { numberPickerStore } from '../store/numberPickerStore';
  import { TNMPickerStore } from '../store/TNMPickerStore';
  import DatePicker from '../components/DatePicker.svelte';
  import NumberPicker from '../components/NumberPicker.svelte';
  import TNMPicker from '../components/TNMPicker.svelte';
  import Login from '../components/Login.svelte'; // Erstelle eine einfache Login-Komponente
  import { authStore } from '../store/authStore.js';
  import { get } from 'svelte/store';
  import { tokenService } from '../services/tokenService.js';
  import { env } from '$env/dynamic/public';
  import { apiPath, appPath, iconPath } from '$lib/path-utils';
  import { version as appVersion } from '../../package.json';
  import { applyChartDisplayPreferences } from '../store/configStore.js';
  import { resolveChartDisplayPreferences } from '../store/chartDisplayPreferences.js';
  import { flushUsageEvents, stopUsageTracking, trackUsageEvent } from '$lib/usage-tracking';
  import { initChartThemeSync } from '$lib/chartTheme';
  import {
    applyUserAppearance,
    loadPlatformConfiguration,
    platformConfigStore,
    platformDocumentUrl
  } from '../store/platformConfigStore';
  import {
    DEFAULT_VIEWPORT_CONTENT,
    MOBILE_LANDSCAPE_VIEWPORT_CONTENT
  } from '$lib/mobileViewport.js';

  const loadingIcon = iconPath('spinner.svg');

  let filterActive = true;
  let showDatePicker = false;
  let showNumberPicker = false;
  let showTNMPicker = false;
  let selectedDate = null;
  let selectedNumber = null;
  let selectedTNM = null;

  const SHOW_USERAGREEMENT = String(env.PUBLIC_SITE_SPECIFIC_SHOW_USERAGREEMENT).toLowerCase() === 'true';
  const SHOW_IMPRINT = String(env.PUBLIC_SITE_SPECIFIC_SHOW_IMPRINT).toLowerCase() === 'true';

  let sessionStartTime: number;
  let updateInterval: ReturnType<typeof setInterval>;
  let inactivityTimer: ReturnType<typeof setTimeout>;
  let isActive = true; // Benutzeraktivitätsstatus
  const inactivityThreshold = 3 * 60 * 1000; // 5 Minuten

  // --- NEU: Linkfarbe aus userStore -> CSS Variable --link-color ---
  let primaryColor: string = '#0d6efd'; // Fallback
  let unsubscribeUserStore: (() => void) | undefined;
  let cleanupChartThemeSync: (() => void) | undefined;

  function applyLinkColorToRoot() {
    if (typeof document !== 'undefined' && primaryColor) {
      const channels = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(primaryColor);
      const isNearBlack = channels
        ? Math.max(
            Number.parseInt(channels[1], 16),
            Number.parseInt(channels[2], 16),
            Number.parseInt(channels[3], 16)
          ) <= 80
        : false;
      const linkColor = document.body.classList.contains('dark-mode') && isNearBlack
        ? 'rgb(255, 255, 255)'
        : primaryColor;
      document.documentElement.style.setProperty('--link-color', linkColor);
    }
  }
  // ------------------------------------------------------------------

  datePickerStore.subscribe((state) => {
    showDatePicker = state.show;
    selectedDate = state.selectedDate;
  });

  numberPickerStore.subscribe((state) => {
    showNumberPicker = state.show;
    selectedNumber = state.selectedNumber;
  });

  TNMPickerStore.subscribe((state) => {
    showTNMPicker = state.show;
    selectedTNM = state.selectedTNM;
  });

  filterActiveStore.subscribe((value) => {
    filterActive = value.filterActive;
  });

  let catalogueData: any = null;
  let catalogueJSON: Promise<string>;
  let storeLoaded = false;
  let sessionInterval = 30; // In Sekunden
  let lastCatalogueTimestamp = 0;
  let cataloguePollingInterval: ReturnType<typeof setInterval>;
  let platformConfigPollingInterval: ReturnType<typeof setInterval>;
  let catalogueSource = 'loading';


  let currentUser: any;
  let currentUserDB: any;
  let isInitializing = true;
  let lastUpdate: string | null = null; // State für Ausgabe
  let showMobilePortraitHint = false;
  let mobileLayoutFrame: number | undefined;
  let filterTrackingStartedAt = 0;
  let filterChangeTimer: ReturnType<typeof setTimeout> | undefined;

  const analyticsModuleForTarget = (target: Element) => {
    const route = window.location.pathname.replace(/^\/+|\/+$/g, '') || 'home';
    const card = target.closest('.box_style.box_level2');
    if (!card) return route;

    const semanticClass = [...card.classList].find(
      (className) => !['box_style', 'box_level2'].includes(className)
    );
    if (!semanticClass) return route;

    const similarCards = [...document.querySelectorAll(`.${semanticClass}.box_level2`)];
    const duplicateIndex = similarCards.indexOf(card);
    return `${route}:${semanticClass}${similarCards.length > 1 ? `-${duplicateIndex + 1}` : ''}`;
  };

  function trackPointerInteraction(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    let targetType: 'CHART' | 'TABLE' | 'VISUALIZATION' | null = null;
    if (target.closest('canvas')) targetType = 'CHART';
    else if (target.closest('table tbody td')) targetType = 'TABLE';
    else if (target.closest('.chart-container svg')) targetType = 'VISUALIZATION';

    if (targetType) {
      trackUsageEvent({
        type: 'MODULE_INTERACTION',
        targetType,
        module: analyticsModuleForTarget(target)
      });
    }
  }

  function trackFilterInteraction() {
    if (Date.now() - filterTrackingStartedAt < 1000) return;
    if (filterChangeTimer) clearTimeout(filterChangeTimer);
    filterChangeTimer = setTimeout(() => {
      filterChangeTimer = undefined;
      trackUsageEvent({ type: 'FILTER_CHANGE' });
      void flushUsageEvents();
    }, 250);
  }

  function flushUsageWhenHidden() {
    if (document.visibilityState === 'hidden') void flushUsageEvents(true);
  }

  function updateMobileLayout() {
    if (typeof window === 'undefined') return;

    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const shortestScreenSide = Math.min(window.screen.width, window.screen.height);
    const isPhoneSized = shortestScreenSide <= 900;
    const isMobileDevice = isCoarsePointer && isPhoneSized;
    const screenOrientation = window.screen.orientation?.type;
    const isLandscape = screenOrientation
      ? screenOrientation.startsWith('landscape')
      : viewportWidth > viewportHeight;
    const root = document.documentElement;
    const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');

    showMobilePortraitHint = isMobileDevice && !isLandscape;

    if (isMobileDevice && isLandscape) {
      root.dataset.ovisMobileLayout = 'landscape';
      if (viewportMeta && viewportMeta.content !== MOBILE_LANDSCAPE_VIEWPORT_CONTENT) {
        viewportMeta.content = MOBILE_LANDSCAPE_VIEWPORT_CONTENT;
      }
    } else {
      root.dataset.ovisMobileLayout = isMobileDevice ? 'portrait' : 'desktop';
      if (viewportMeta && viewportMeta.content !== DEFAULT_VIEWPORT_CONTENT) {
        viewportMeta.content = DEFAULT_VIEWPORT_CONTENT;
      }
    }
  }

  function scheduleMobileLayoutUpdate() {
    if (mobileLayoutFrame != null) cancelAnimationFrame(mobileLayoutFrame);
    mobileLayoutFrame = requestAnimationFrame(updateMobileLayout);
  }

  $: userAgreementFile = platformDocumentUrl(
    $platformConfigStore,
    'USER_AGREEMENT',
    $locale
  );
  onMount(async () => {
    filterTrackingStartedAt = Date.now();
    updateMobileLayout();
    window.addEventListener('resize', scheduleMobileLayoutUpdate);
    window.addEventListener('orientationchange', scheduleMobileLayoutUpdate);
    window.visualViewport?.addEventListener('resize', scheduleMobileLayoutUpdate);
    document.addEventListener('click', trackPointerInteraction, true);
    document.addEventListener('visibilitychange', flushUsageWhenHidden);
    window.addEventListener('lens-query-updated', trackFilterInteraction);

    // --- NEU: userStore abonnieren und Linkfarbe anwenden ---
    unsubscribeUserStore = userStore.subscribe((v: any) => {
      // Falls dein Store anders strukturiert ist, ggf. anpassen:
      primaryColor = v?.primaryColor ?? primaryColor;
      applyLinkColorToRoot();
    });
    applyLinkColorToRoot();
    cleanupChartThemeSync = initChartThemeSync();
    // --------------------------------------------------------

    try {
      await loadPlatformConfiguration();
      console.log('Initializing token validation...');
      await tokenService.initializeTokenValidation();

      // If authenticated after validation, run init logic
      if (get(authStore)) {
        await runInitLogic();
      }

      // Start catalogue polling (runs regardless of auth status for public access)
      cataloguePollingInterval = setInterval(async () => {
        await loadCatalogue();
      }, 30000); // Poll every 30 seconds

      platformConfigPollingInterval = setInterval(() => {
        void loadPlatformConfiguration(true);
      }, 60000);

    } catch (error) {
      console.error('Failed to initialize token validation:', error);
    } finally {
      isInitializing = false;
    }
    //Zeigt die Zeit des letzten Datenbankupdates an
    try {
      const res = await getLastMetaData();
      if (res?.executedAt) {
        // Formatieren ins deutsche Datum, wenn gewünscht:
        lastUpdate = new Date(res.executedAt).toLocaleString("de-DE", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        });
      }
    } catch (err) {
      console.error("Fehler beim Laden von lastMetaData:", err);
    }
  });

  authStore.subscribe(async (authValue) => {
    if (authValue && !isInitializing) {
      console.log("authStore hat sich geändert – neuer Login erkannt");
      await runInitLogic();
    }
  });

  async function loadCatalogue() {
    try {
      const response = await fetch(`${apiPath('catalogue')}?t=${Date.now()}`);
      const result = await response.json();

      if (result.error) {
        console.error('Catalogue API error:', result.message);
        return false;
      }

      if (result.timestamp !== lastCatalogueTimestamp) {
        catalogueData = result.data;
        lastCatalogueTimestamp = result.timestamp;
        catalogueSource = result.source;

        // Update the promise for reactive components
        catalogueJSON = Promise.resolve(JSON.stringify(catalogueData));

        console.log(`🔄 Catalogue updated from ${result.source} source (${Math.round(result.size/1024)}KB, ${new Date(result.timestamp).toLocaleTimeString()})`);
        return true;
      }
    } catch (error) {
      console.error('Failed to load catalogue:', error);
      return false;
    }
    return false;
  }

  async function runInitLogic() {

    sessionStartTime = Date.now();

    // Load initial catalogue
    await loadCatalogue();

    const storeValue = get(userStore);
    currentUser = storeValue.currentUser;

    console.log("currentUser", currentUser);

    let userData = await getUser(null, 1000);
    currentUserDB = userData.find((u: any) => u._id === currentUser);
    console.log("currentUserDB", currentUserDB);

    const chartPreferences = resolveChartDisplayPreferences(currentUserDB);
    document.body.classList.toggle('dark-mode', currentUserDB.darkMode);
    applyChartDisplayPreferences(chartPreferences);
    userStore.update((user) => ({
      ...user,
      chartShowTop5: chartPreferences.showTop5,
      chartHideNullValues: chartPreferences.hideNullValues
    }));
    applyUserAppearance(currentUserDB, get(platformConfigStore));

    const refreshedUser = get(userStore);
    localStorage.setItem('loggedInUser', JSON.stringify(refreshedUser));

    if (!currentUserDB.firstLogin) {
      let input = { firstLogin: Date.now(), lastLogin: Date.now() };
      await updateUser(currentUser, input);
    } else {
      let input = { lastLogin: Date.now() };
      await updateUser(currentUser, input);
    }
    document.body.classList.toggle('dark-mode', currentUserDB.darkMode);
    storeLoaded = true;

    try {
      if (currentUser) startUpdateTimer();
    } catch (error) {
      console.error('Error during runInitLogic:', error);
    }

    if (typeof document !== 'undefined') {
      document.body.classList.toggle('dark-mode', currentUserDB.darkMode);
      document.addEventListener('mousemove', resetInactivityTimer);
      document.addEventListener('keydown', resetInactivityTimer);
      document.addEventListener('click', resetInactivityTimer);
      resetInactivityTimer();
    }

}



function startUpdateTimer() {
  if (!currentUser) {
    console.warn('Cannot start update timer: currentUser is not set.');
    return;
  }

  updateInterval = setInterval(async () => {
    if (isActive) {
      await updateSessionTime();
    }
  }, sessionInterval * 1000);

  console.log('Update timer started.');
}

  onDestroy(async () => {
    clearInterval(updateInterval);
    clearTimeout(inactivityTimer);
    if (cataloguePollingInterval) clearInterval(cataloguePollingInterval);
    if (platformConfigPollingInterval) clearInterval(platformConfigPollingInterval);
    if (filterChangeTimer) clearTimeout(filterChangeTimer);

    // --- NEU: userStore-Subscription aufräumen ---
    if (unsubscribeUserStore) {
      unsubscribeUserStore();
      unsubscribeUserStore = undefined;
    }
    if (cleanupChartThemeSync) {
      cleanupChartThemeSync();
      cleanupChartThemeSync = undefined;
    }
    // --------------------------------------------

    if (typeof document !== 'undefined') {
      // Event Listener entfernen, wenn die Komponente zerstört wird
      document.removeEventListener('mousemove', resetInactivityTimer);
      document.removeEventListener('keydown', resetInactivityTimer);
      document.removeEventListener('click', resetInactivityTimer);
      window.removeEventListener('resize', scheduleMobileLayoutUpdate);
      window.removeEventListener('orientationchange', scheduleMobileLayoutUpdate);
      window.visualViewport?.removeEventListener('resize', scheduleMobileLayoutUpdate);
      document.removeEventListener('click', trackPointerInteraction, true);
      document.removeEventListener('visibilitychange', flushUsageWhenHidden);
      window.removeEventListener('lens-query-updated', trackFilterInteraction);
      if (mobileLayoutFrame != null) cancelAnimationFrame(mobileLayoutFrame);
      delete document.documentElement.dataset.ovisMobileLayout;
      const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
      if (viewportMeta) viewportMeta.content = DEFAULT_VIEWPORT_CONTENT;
    }
    await updateSessionTime(true);
    await flushUsageEvents(true);
    stopUsageTracking();
  });

  async function updateSessionTime(isFinalUpdate = false) {
  if (!currentUser) {
    console.error('updateSessionTime: currentUser is not set.');
    return;
  }

  const now = Date.now();
  const elapsedSeconds = Math.min(300, Math.max(0, Math.floor((now - sessionStartTime) / 1000)));
  sessionStartTime = now;
  if (elapsedSeconds === 0) return;

  trackUsageEvent({ type: 'SESSION_TIME', durationSeconds: elapsedSeconds });
  await flushUsageEvents(isFinalUpdate);
}



  function resetInactivityTimer() {
  clearTimeout(inactivityTimer);

  if (!isActive) {
    console.log('User became active again, resuming updates...');
    isActive = true;
    sessionStartTime = Date.now();

    // Starte das Intervall neu, falls es gestoppt wurde
    updateInterval = setInterval(async () => {
      if (isActive) {
        await updateSessionTime();
      }
    }, sessionInterval * 1000);
  }

  // Starte einen neuen Inaktivitäts-Timer
  inactivityTimer = setTimeout(() => {
    void updateSessionTime();
    isActive = false; // Benutzer ist inaktiv
    clearInterval(updateInterval); // Stoppe das Intervall
    console.log('User is inactive, stopping updates...');
  }, inactivityThreshold);
}

</script>
{#if showMobilePortraitHint && storeLoaded}
  <div class="mobile-orientation-hint" role="status" aria-live="polite">
    <div class="mobile-orientation-card">
      <svg class="mobile-orientation-symbol" viewBox="0 0 96 96" aria-hidden="true">
        <path class="mobile-orientation-arrow" d="M21 29a34 34 0 0 0 3 43" />
        <path class="mobile-orientation-arrowhead" d="m15 67 10 7 2-12" />
        <g class="mobile-orientation-phone">
          <rect x="34" y="20" width="28" height="56" rx="5" />
          <path d="M43 26h10" />
          <circle cx="48" cy="69" r="1.5" />
        </g>
      </svg>
      <strong>{$t('mobilePortraitTitle')}</strong>
      <span>{$t('mobilePortraitMessage')}</span>
    </div>
  </div>
{/if}
{#if isInitializing}
  <div class="initializing-spinner-container" role="status" aria-label="Loading">
    <img
      class="bigSpinner initializing-spinner"
      id="spinner"
      src={loadingIcon}
      alt=""
      aria-hidden="true"
    />
  </div>
{:else if !$authStore}
  <Login/>
{:else}
  {#await catalogueJSON}
      Loading data...
  {:then catalogueJSON}
      <lens-options {catalogueJSON} />
  {:catch someError}
      System error: {someError.message}
  {/await}

  {#if showDatePicker}
   <DatePicker/>
  {/if}
  {#if showNumberPicker}
    <NumberPicker/>
  {/if}
  {#if showTNMPicker}
    <TNMPicker/>
  {/if}

  {#if storeLoaded}
    <div class="outer-div">
      <div class="grid-container">
        <div class="grid-container-quicktools box_style box_level1">
          <Quicktools />
        </div>
        <div class="menubar box_style box_level1">
          {#if $reloadStore && filterActive}
          <Menubar />
        {/if}
        {#if !filterActive}
        <Menubar />
        {/if}

        </div>
        <div class="content-view box_style box_level1">
          {#if $reloadStore && filterActive}
            <slot />
          {/if}
          {#if !filterActive}
             <slot />
          {/if}
        </div>

      </div>

<footer class="site-footer">
  <div class="footer-outer footer-bar">
    <!-- Links -->
    <div class="footer-left">{$t("lastUpdate")}: {lastUpdate}</div>

    <!-- Mitte -->
    <nav aria-label="Footer">
      <ul class="footer-links">
          {#if SHOW_USERAGREEMENT}
          <li>
            <a href={userAgreementFile} download>
              <img class="ic" src={iconPath('agreement.svg')} alt="" />
              <span>{$t("userAgreement")}</span>
            </a>
          </li>
          {/if}

        <li>
          <a href={appPath('/footer-contact')}>
            <img class="ic" src={iconPath('contact.svg')} alt="" />
            <span>{$t("contact")}</span>
          </a>
        </li>
        <li>
          <a href="https://tryovis.com/feedback" target="_blank" rel="noopener">
            <img class="ic" src={iconPath('feedback.svg')} alt="" />
            <span>Feedback</span>
          </a>
        </li>
        <li>
          <a href="https://github.com/tryovis/ovis" target="_blank" rel="noopener">
            <img class="ic ext" src={iconPath('git.svg')} alt="" />
            <span>Git (Code &amp; Docs)</span>
          </a>
        </li>
        <li><a href={appPath('/footer-cite')}><span>Cite us</span></a></li>
      {#if SHOW_IMPRINT}
        <li><a href={appPath('/footer-imprint')}><span>{$t("imprint")}</span></a></li>
        <li><a href={appPath('/footer-privacy')}><span>{$t("privacyPolicy")}</span></a></li>
       {/if}
        <li><a href={appPath('/footer-licensing')}><span>{$t("licenseInformation")}</span></a></li>
        <li><a href={appPath('/footer-issues')}><span style="color:#e11900"><b>{$t("knownIssues")}</b></span></a></li>
      </ul>
    </nav>

    <!-- Rechts -->
    <div class="footer-right"><a href={appPath('/footer-version')}><span>Version {appVersion}</span></a></div>
  </div>
</footer>





    </div>
  {/if}
  <!-- Footer Disclaimer -->
<Disclaimer />
  {/if}



<!-- Toast Nachrichten -->
{#if $toastStore}
  <div class="toast">{ $toastStore }</div>
{/if}

<!-- Style für Toast Nachrichten -->
<style>
  .initializing-spinner-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    width: 100%;
  }

  .initializing-spinner {
    max-width: 7rem;
  }

  .toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #333;
    color: #fff;
    padding: 10px 20px;
    border-radius: 5px;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
    z-index: 9999;
    opacity: 0.9;
    transition: opacity 0.3s ease-in-out;
  }

  .toast:hover {
    opacity: 1;
  }
</style>
