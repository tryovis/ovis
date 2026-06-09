<script>
  import { page } from '$app/stores';
  import { iconPath } from '$lib/path-utils';
  import { base } from '$app/paths';
  import { t, locale, locales } from "../../store/languageStore";

    const startIcon = iconPath('home.png') 
    const patientCohortIcon = iconPath('patient-cohort.png') 
    const singlePatientIcon = iconPath('patient-single.png') 
    const caretDownIcon = iconPath('caret-down.png') 
    const diagnosisIcon = iconPath('examination.png') 
    const firstDiagnosisIcon = iconPath('diagnosis.png') 
    const tnmIcon = iconPath('metastasis.png') 
    const consultationIcon = iconPath('consultation.png') 
    const therapyGeneralIcon = iconPath('physiotherapy.png') 
    const therapyOperationIcon = iconPath('scalpel.png') 
    const therapySysytemicIcon = iconPath('spritze.png') 
    const therapyRadiationIcon = iconPath('x-ray.png') 
    const statusIcon = iconPath('status.png') 
    const progresIcon = iconPath('progress.png') 
    const tumorboardIcon = iconPath('tumorboard.png') 
    const survivalIcon = iconPath('km-kurve.png') 
    const supplementaryIcon = iconPath('plus.png') 
    const studyIcon = iconPath('study.png') 
    const organIcon = iconPath('organ.png') 
    const breastIcon = iconPath('breast.png') 
    const colonIcon = iconPath('colon.png') 
    const prostateIcon = iconPath('prostate.png') 
    const settingsIcon = iconPath('user-icon.svg')
    const editIcon = iconPath('pencil.svg')
    const userManagementIcon = iconPath('user-management.svg')
    const bioMaterialIcon = iconPath('bioMaterial.png')
    const molecularMarkerIcon = iconPath('dna.png')


  $: menuItems = [
    { path: '/', text: 'Startseite',icon: startIcon },
    { path: '/patient-cohort', text: $t("patient")+' &rarr; ' +$t("cohort") ,icon: patientCohortIcon},
    { path: '/patient-single', text: $t("patient")+' &rarr; ' +$t("singleView"), icon: singlePatientIcon },
    { path: '/diagnosis', text: $t("diagnosis"), icon: firstDiagnosisIcon  },
    { path: '/tnm', text: 'TNM / '+ $t("metastases"),icon: tnmIcon },
    { path: '/therapy-general', text: $t("therapies")+' &rarr; '+$t("general"), icon: therapyGeneralIcon },
    { path: '/therapy-operation', text: $t("therapies")+' &rarr; '+$t("surgery"), icon: therapyOperationIcon },
    { path: '/therapy-systemic', text: $t("therapies")+' &rarr; '+$t("systemic"), icon: therapySysytemicIcon  },
    { path: '/therapy-radiation', text: $t("therapies")+' &rarr; '+$t("radiation"), icon: therapyRadiationIcon },
    { path: '/therapy', text: $t("therapies"), icon: therapyGeneralIcon },
    { path: '/progress', text: 'Time-Lines &rarr; '+ $t("progress"), icon: progresIcon  },
    { path: '/tumorboard', text: 'Time-Lines &rarr; '+$t("tumorboards"), icon: tumorboardIcon },
    { path: '/consultation', text: 'Time-Lines &rarr; ' +$t("consultations"), icon: consultationIcon },
    { path: '/status', text: 'Time-Lines &rarr; ' +$t("patientStatus"), icon: statusIcon },
    { path: '/survival', text: 'Survival', icon: survivalIcon },
    { path: '/supplementary', text: $t("staging")+ ' / '  +$t("supplementary"),icon: supplementaryIcon  },
    { path: '/molecular-marker', text: $t("molecularDiagnostic"),icon: molecularMarkerIcon  },
   // { path: '/breast', text: 'Organspezifisch &rarr; Brust', icon: breastIcon },
   // { path: '/colon', text: 'Organspezifisch &rarr; Darm', icon: colonIcon },
   // { path: '/prostate', text: 'Organspezifisch &rarr; Prostata',icon: prostateIcon },
    { path: '/study', text: $t("studies"), icon: studyIcon },
    { path: '/settings', text: $t("userSettings"), icon: settingsIcon },
    { path: '/filter-edit', text: $t("editFilters"), icon: editIcon },
    { path: '/user-management', text: $t("userManagement"), icon: userManagementIcon },
    { path: '/bio-material', text: $t("bioMaterial"), icon: bioMaterialIcon },
    
  ];

  // currentRouteText wird automatisch aktualisiert, wenn sich $page.url.pathname ändert
  $: currentRouteText = setCurrentRouteText()
  $: currentRouteIcon = setCurrentRouteIcon()

  // Normalize path by removing base path prefix for matching
  // Works for both local (base='') and bridgehead (base='/ccp-ovis') deployments
  function normalizePath(pathname) {
    if (base && pathname.startsWith(base)) {
      return pathname.slice(base.length) || '/';
    }
    return pathname;
  }

  // setCurrentRouteText wird jedes Mal aufgerufen, wenn currentRouteText sich ändert
  $: setCurrentRouteText = () => {
    const currentPath = normalizePath($page.url.pathname);

    // Suche nach dem passenden Text in den menuItems
    const menuItem = menuItems.find(item => item.path === currentPath);
    return menuItem ? menuItem.text : '';
  };

  $: setCurrentRouteIcon = () => {
    const currentPath = normalizePath($page.url.pathname);

    // Suche nach dem passenden Text in den menuItems
    const menuItem = menuItems.find(item => item.path === currentPath);
    return menuItem ? menuItem.icon : '';
  };

</script>

<div>
  <img src={currentRouteIcon} alt={currentRouteIcon} class="menuebar-icon" />{@html currentRouteText} 
</div>

<style>  
  .menuebar-icon{
    height: 1em; /* Höhe anpassen */
    margin-right: 5px;
    margin-left: 5px;
    vertical-align: center;
  }
</style>