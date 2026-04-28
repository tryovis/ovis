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
  import { colorArrays } from '../components/ColorArray.js';
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
  import { apiPath, appPath, publicAssetPath, iconPath } from '$lib/path-utils';

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

  function applyLinkColorToRoot() {
    if (typeof document !== 'undefined' && primaryColor) {
      document.documentElement.style.setProperty('--link-color', primaryColor);
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
  let catalogueSource = 'loading';


  let currentUser: any;
  let currentUserDB: any;
  let isInitializing = true;
  let lastUpdate: string | null = null; // State für Ausgabe
  // Initialize token validation on app startup
  const userAgreementFiles: Record<string, string> = {
    de: publicAssetPath("/downloads/ovis_userAgreement_de_template.pdf"),
    en: publicAssetPath("/downloads/ovis_userAgreement_en_template.pdf"),
    // weitere Sprachen einfach ergänzen:
    // fr: publicAssetPath("/downloads/ovis_userAgreement_fr_template.pdf"),
    // it: publicAssetPath("/downloads/ovis_userAgreement_it_template.pdf"),
  };

  // Helper mit Fallback-Logik (z. B. "en-US" -> "en")
  function getUserAgreementPath(loc?: string): string {
    const norm = (loc ?? "").toLowerCase();
    if (userAgreementFiles[norm]) return userAgreementFiles[norm];

    const base = norm.split("-")[0]; // "en-US" -> "en"
    if (userAgreementFiles[base]) return userAgreementFiles[base];

    // finaler Fallback
    return userAgreementFiles["de"];
  }
  $: userAgreementFile = getUserAgreementPath($locale);
  onMount(async () => {
    // --- NEU: userStore abonnieren und Linkfarbe anwenden ---
    unsubscribeUserStore = userStore.subscribe((v: any) => {
      // Falls dein Store anders strukturiert ist, ggf. anpassen:
      primaryColor = v?.primaryColor ?? primaryColor;
      applyLinkColorToRoot();
    });
    applyLinkColorToRoot();
    // --------------------------------------------------------

    try {
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

    if (!currentUserDB.firstLogin) {
      let input = { firstLogin: Date.now(), lastLogin: Date.now() };
      await updateUser(currentUser, input);
    } else {
      let input = { lastLogin: Date.now() };
      await updateUser(currentUser, input);
    }

    locale.set(currentUserDB.language);
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
  }, sessionInterval * 5000);

  console.log('Update timer started.');
}

  onDestroy(async () => {
    clearInterval(updateInterval);
    clearTimeout(inactivityTimer);
    if (cataloguePollingInterval) clearInterval(cataloguePollingInterval);

    // --- NEU: userStore-Subscription aufräumen ---
    if (unsubscribeUserStore) {
      unsubscribeUserStore();
      unsubscribeUserStore = undefined;
    }
    // --------------------------------------------

    if (typeof document !== 'undefined') {
      // Event Listener entfernen, wenn die Komponente zerstört wird
      document.removeEventListener('mousemove', resetInactivityTimer);
      document.removeEventListener('keydown', resetInactivityTimer);
      document.removeEventListener('click', resetInactivityTimer);
    }
    await updateSessionTime(true);
  });

  async function updateSessionTime(isFinalUpdate = false) {
  if (!currentUser) {
    console.error('updateSessionTime: currentUser is not set.');
    return;
  }

  try {
    // Alle Benutzer abrufen
    const users = await getUser(null, 1000);
    if (!users || !Array.isArray(users)) {
      console.error('Error: User list is not valid or empty.');
      return;
    }

    // Benutzer mit der passenden ID finden
    const user = users.find(u => u._id === currentUser);
    if (!user) {
      console.error(`User with ID ${currentUser} not found.`);
      return;
    }

    const currentTimeOnline = user.timeOnline || 0;

    // Neuen Wert berechnen
    const updatedTimeOnline = currentTimeOnline + sessionInterval;

    // Update an den Server senden
    const input = { timeOnline: updatedTimeOnline };
    const result = await updateUser(currentUser, input);
    console.log('Session time updated successfully:', result);
  } catch (error) {
    console.error('Error updating session time:', error);
  }
}



  function resetInactivityTimer() {
  clearTimeout(inactivityTimer);

  if (!isActive) {
    console.log('User became active again, resuming updates...');
    isActive = true;

    // Starte das Intervall neu, falls es gestoppt wurde
    updateInterval = setInterval(async () => {
      if (isActive) {
        await updateSessionTime();
      }
    }, sessionInterval * 1000);
  }

  // Starte einen neuen Inaktivitäts-Timer
  inactivityTimer = setTimeout(() => {
    isActive = false; // Benutzer ist inaktiv
    clearInterval(updateInterval); // Stoppe das Intervall
    console.log('User is inactive, stopping updates...');
  }, inactivityThreshold);
}

</script>
{#if isInitializing}
  <div style="display: flex; justify-content: center; align-items: center; height: 100vh;">
    <div>Validating session...</div>
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

<footer class="site-footer" role="contentinfo">
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
    <div class="footer-right"><a href={appPath('/footer-version')}><span>Version 1.0.0</span></a></div>
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
