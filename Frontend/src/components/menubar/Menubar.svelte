<script lang="ts">
	import { page } from '$app/stores';
	import { variantStore } from '../../store/variantStore.js';
	import { t } from '../../store/languageStore';
	import { userStore } from '../../store/userStore';
	import { getPatientCohortOverviewTable } from '../../graphQl/gql-patient-cohort.js';
	import { onMount, tick } from 'svelte';
	import type { LensDataPasser } from '@samply/lens';
	import { filterActiveStore } from '../../store/filterActiveStore.js';
	import { singlePatientStore } from '../../store/singlePatientStore.js';
	import { addUserFilter } from '../../components/UserFilter';
	import { navConfig } from '../../config/navigation';
	import { appPath, iconPath } from '$lib/path-utils';

	type FilterActiveState = {
		filterActive: boolean;
	};

	type VariantState = {
		isCCP: boolean;
		loginEnabled: boolean;
	};

	type UserState = {
		currentRole: string;
	};

	type PatientOverviewRow = {
		_id?: string;
		patID: string;
	};

	let filterActive = true;

	filterActiveStore.subscribe((value: FilterActiveState) => {
		filterActive = value.filterActive;
	});

	let dataPasser: LensDataPasser;
	let patientData: PatientOverviewRow[] = [];

	onMount(async () => {
		await import('@samply/lens');
		await tick();

		if (filterActive && dataPasser) {
			const filter = await addUserFilter(JSON.stringify(dataPasser.getAstAPI()));
			const serializedFilter = typeof filter === 'string' ? filter : JSON.stringify(filter);
			patientData = await getPatientCohortOverviewTable(null, 5, serializedFilter);
		}

		showSinglePatient = patientData.length === 1;

		if (showSinglePatient) {
			singlePatientStore.update((storeValues) => {
				storeValues.singlePatient = patientData[0].patID;
				return storeValues;
			});
		} else {
			singlePatientStore.update((storeValues) => {
				storeValues.singlePatient = '';
				return storeValues;
			});
		}
	});

	let currentRole = '';

	let isCCP = false;
	variantStore.subscribe((value: VariantState) => {
		({ isCCP } = value);
	});

	userStore.subscribe((value: UserState) => {
		({ currentRole } = value);
	});

	const patientCohortIcon = iconPath('patient-cohort.png');
	const singlePatientIcon = iconPath('patient-single.png');
	const caretDownIcon = iconPath('caret-down.png');
	const firstDiagnosisIcon = iconPath('diagnosis.png');
	const tnmIcon = iconPath('metastasis.png');
	const consultationIcon = iconPath('consultation.png');
	const therapyGeneralIcon = iconPath('physiotherapy.png');
	const therapyOperationIcon = iconPath('scalpel.png');
	const therapySysytemicIcon = iconPath('spritze.png');
	const therapyRadiationIcon = iconPath('x-ray.png');
	const statusIcon = iconPath('status.png');
	const progresIcon = iconPath('progress.png');
	const tumorboardIcon = iconPath('tumorboard.png');
	const survivalIcon = iconPath('km-kurve.png');
	const supplementaryIcon = iconPath('plus.png');
	const studyIcon = iconPath('study.png');
	const molecularDiagnosticIcon = iconPath('dna.png');
	const bioMaterialIcon = iconPath('bioMaterial.png');
	const userManagementIcon = iconPath('user-management.svg');
	const lockedIcon = iconPath('locked.svg');
	const unlockedIcon = iconPath('unlocked.svg');

	type DropdownItem = {
		id: string;
		route: string;
		icon: string;
		labelKey: string;
		enabled: boolean;
		hideForCcp?: boolean;
		requiresSelection?: boolean;
	};

	type LinkItem = {
		id: string;
		route: string;
		icon: string;
		enabled: boolean;
		labelKey?: string;
		labelType?: 'text' | 'tnm' | 'supplementary';
		text?: string;
		requireCcp?: boolean;
		requireNonCcp?: boolean;
		hideForRoles?: string[];
	};

	const patientItems: DropdownItem[] = [
		{
			id: 'patient-cohort',
			route: 'patient-cohort',
			icon: patientCohortIcon,
			labelKey: 'cohort',
			enabled: navConfig.patient.cohort
		},
		{
			id: 'patient-single',
			route: 'patient-single',
			icon: singlePatientIcon,
			labelKey: 'singleView',
			enabled: navConfig.patient.single,
			requiresSelection: true
		}
	];

	const therapyItems: DropdownItem[] = [
		{
			id: 'therapy-general',
			route: 'therapy-general',
			icon: therapyGeneralIcon,
			labelKey: 'general',
			enabled: navConfig.therapy.general
		},
		{
			id: 'therapy-operation',
			route: 'therapy-operation',
			icon: therapyOperationIcon,
			labelKey: 'surgery',
			enabled: navConfig.therapy.operation
		},
		{
			id: 'therapy-systemic',
			route: 'therapy-systemic',
			icon: therapySysytemicIcon,
			labelKey: 'systemic',
			enabled: navConfig.therapy.systemic
		},
		{
			id: 'therapy-radiation',
			route: 'therapy-radiation',
			icon: therapyRadiationIcon,
			labelKey: 'radiation',
			enabled: navConfig.therapy.radiation
		}
	];

	const timelineItems: DropdownItem[] = [
		{
			id: 'progress',
			route: 'progress',
			icon: progresIcon,
			labelKey: 'progress',
			enabled: navConfig.timeline.progress
		},
		{
			id: 'tumorboard',
			route: 'tumorboard',
			icon: tumorboardIcon,
			labelKey: 'tumorboards',
			enabled: navConfig.timeline.tumorboard
		},
		{
			id: 'consultation',
			route: 'consultation',
			icon: consultationIcon,
			labelKey: 'consultations',
			enabled: navConfig.timeline.consultation,
			hideForCcp: true
		},
		{
			id: 'status',
			route: 'status',
			icon: statusIcon,
			labelKey: 'patientStatus',
			enabled: navConfig.timeline.status
		}
	];

	const mainLinks: LinkItem[] = [
		{
			id: 'diagnosis',
			route: 'diagnosis',
			icon: firstDiagnosisIcon,
			enabled: navConfig.diagnosis.enabled,
			labelKey: 'diagnosis'
		},
		{
			id: 'tnm',
			route: 'tnm',
			icon: tnmIcon,
			enabled: navConfig.tnm.enabled,
			labelType: 'tnm',
			labelKey: 'metastases'
		}
	];

	const topLinks: LinkItem[] = [
		{
			id: 'survival',
			route: 'survival',
			icon: survivalIcon,
			enabled: navConfig.survival.enabled,
			labelType: 'text',
			text: 'Survival'
		},
		{
			id: 'supplementary',
			route: 'supplementary',
			icon: supplementaryIcon,
			enabled: navConfig.supplementary.enabled,
			labelType: 'supplementary',
			labelKey: 'supplementary'
		},
		{
			id: 'molecular',
			route: 'molecular-marker',
			icon: molecularDiagnosticIcon,
			enabled: navConfig.molecular.enabled,
			labelKey: 'molecularDiagnostic'
		},
		{
			id: 'bio-material',
			route: 'bio-material',
			icon: bioMaterialIcon,
			enabled: navConfig.bioMaterial.enabled,
			labelKey: 'bioMaterial',
			requireCcp: true
		},
		{
			id: 'study',
			route: 'study',
			icon: studyIcon,
			enabled: navConfig.study.enabled,
			labelKey: 'studies',
			requireNonCcp: true
		},
		{
			id: 'user-management',
			route: 'user-management',
			icon: userManagementIcon,
			enabled: navConfig.userManagement.enabled,
			labelKey: 'userManagement',
			hideForRoles: ['user']
		}
	];

	$: currentRouteText = $page.url.pathname;
	const routePath = (route: string) => appPath(route);

	let showSinglePatient = false;

	let visiblePatientItems: DropdownItem[] = [];
	let visibleTherapyItems: DropdownItem[] = [];
	let visibleTimelineItems: DropdownItem[] = [];
	let patientMenuVisible = false;
	let therapyMenuVisible = false;
	let timelineMenuVisible = false;
	let mainLinksFiltered: LinkItem[] = [];
	let topLinksFiltered: LinkItem[] = [];

	const isDropdownItemVisible = (item: DropdownItem) => item.enabled && !(item.hideForCcp && isCCP);

	const isLinkVisible = (item: LinkItem) => {
		if (!item.enabled) return false;
		if (item.requireCcp && !isCCP) return false;
		if (item.requireNonCcp && isCCP) return false;
		if (item.hideForRoles?.includes(currentRole)) return false;
		return true;
	};

	$: visiblePatientItems = patientItems.filter((item) => item.enabled);
	$: patientMenuVisible = visiblePatientItems.length > 0;
	$: visibleTherapyItems = therapyItems.filter((item) => isDropdownItemVisible(item));
	$: therapyMenuVisible = visibleTherapyItems.length > 0;
	$: visibleTimelineItems = timelineItems.filter((item) => isDropdownItemVisible(item));
	$: timelineMenuVisible = visibleTimelineItems.length > 0;
	$: mainLinksFiltered = mainLinks.filter((item) => isLinkVisible(item));
	$: topLinksFiltered = topLinks.filter((item) => isLinkVisible(item));
</script>
<lens-data-passer bind:this={dataPasser} />
<div>

</div>
<div class="navbar box_style box_level2">
	{#if patientMenuVisible}
		<div
			class="dropdown {visiblePatientItems.some(item => currentRouteText === '/' + item.route)
				? 'current_selection'
				: ''}"
		>
			<button class="dropbtn">
			<img src={patientCohortIcon} alt="patient-cohort" class="menuebar-icon" />{$t("patient")}
			<img src={caretDownIcon} alt="carretDown" class="caret-down-icon" />
		</button>
			<div class="dropdown-content">
				{#each visiblePatientItems as item (item.id)}
					{#if item.requiresSelection}
						{#if showSinglePatient}
							<a href={item.route}>
									<img src={item.icon} alt={item.id} class="menuebar-icon no-invert" />{$t(item.labelKey)}
								<img style="margin-left: 15px" src={unlockedIcon} alt="patient-single" class="menuebar-icon" />
							</a>
						{:else}
							<a class="tooltip notallowed">
								<span class="tooltiptext">Einzelnen Patient auswählen um Seite zu betreten.</span>
								<img src={item.icon} alt={item.id} class="menuebar-icon no-invert" />{$t(item.labelKey)}
								<img style="margin-left: 15px" src={lockedIcon} alt="patient-single" class="menuebar-icon" />
							</a>
						{/if}
					{:else}
						<a href={item.route}>
							<img src={item.icon} alt={item.id} class="menuebar-icon no-invert" />{$t(item.labelKey)}
						</a>
					{/if}
				{/each}
			</div>
		</div>
	{/if}
	{#each mainLinksFiltered as link (link.id)}
		<a href={link.route} class={currentRouteText === `/${link.route}` ? 'current_selection' : ''}>
			<img src={link.icon} alt={link.id} class="menuebar-icon" />
			{#if link.labelType === 'tnm'}
				TNM / {$t(link.labelKey ?? '')}
			{:else}
				{$t(link.labelKey ?? '')}
			{/if}
		</a>
	{/each}

	{#if therapyMenuVisible}
		<div
			class="dropdown {visibleTherapyItems.some(item => currentRouteText === '/' + item.route)
				? 'current_selection'
				: ''}"
		>
			<button class="dropbtn">
				<img src={therapyGeneralIcon} alt="therapy-general" class="menuebar-icon" />{$t("therapies")}
				<img src={caretDownIcon} alt="carretDown" class="caret-down-icon" />
			</button>
			<div class="dropdown-content">
				{#each visibleTherapyItems as item (item.id)}
					<a href={item.route}>
						<img src={item.icon} alt={item.id} class="menuebar-icon no-invert" />{$t(item.labelKey)}
					</a>
				{/each}
			</div>
		</div>
	{/if}
	{#if timelineMenuVisible}
		<div
			class="dropdown {visibleTimelineItems.some(item => currentRouteText === '/' + item.route)
				? 'current_selection'
				: ''}"
		>
			<button class="dropbtn">
				<img src={progresIcon} alt="timeLine" class="menuebar-icon" />Time-Lines
				<img src={caretDownIcon} alt="carretDown" class="caret-down-icon" />
			</button>

			<div class="dropdown-content">
				{#each visibleTimelineItems as item (item.id)}
					<a href={item.route}>
						<img src={item.icon} alt={item.id} class="menuebar-icon no-invert" />
						{item.id === 'tumorboard'
							? `${$t("tumorboards")} / ${$t("recommendations")}`
							: $t(item.labelKey)}
					</a>
				{/each}
			</div>
		</div>
	{/if}
	{#each topLinksFiltered as link (link.id)}
		<a href={link.route} class={currentRouteText === `/${link.route}` ? 'current_selection' : ''}>
			<img src={link.icon} alt={link.id} class="menuebar-icon" />
			{#if link.labelType === 'text'}
				{link.text}
			{:else if link.labelType === 'supplementary'}
				{$t("staging")} / {$t("supplementary")}
			{:else}
				{$t(link.labelKey ?? '')}
			{/if}
		</a>
	{/each}
</div>

<style>
	/* The dropdown container */
	.dropdown {
		float: left;
		overflow: hidden;
	}
	/* Navbar container */

	.caret-down-icon {
		width: 0.7em; /* Breite anpassen */
		height: 0.7em; /* Höhe anpassen */
		margin-left: 5px;
	}


	/* Dropdown button */
	.dropdown .dropbtn {
		font-size: 15px;
		border: none;
		outline: none;
		color: rgb(0, 0, 0);
		padding: 14px 16px;
		background-color: inherit;
		font-family: inherit; /* Important for vertical align on mobile phones */
		margin: 0; /* Important for vertical align on mobile phones */

	}

	/* Dropdown content (hidden by default) */
	.dropdown-content {
		display: none;
		position: absolute;
		background-color: #f9f9f9;
		min-width: 160px;
		box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.2);
		z-index: 1;
		margin-top: 45px;
	}

	.notallowed{
		cursor: not-allowed; /* zeigt den durchgestrichenen Kreis als Cursor an */
		opacity: 0.6; /* optional, um das Element etwas "disabled" aussehen zu lassen */
	}

	/* Links inside the dropdown */
	.dropdown-content a {
		float: none;
		color: black;
		padding: 12px 16px;
		text-decoration: none;
		display: block;
		text-align: left;

	}

	/* Add a grey background color to dropdown links on hover */
	.dropdown-content a:hover {
		background-color: rgb(235, 235, 235);
	}

	/* Show the dropdown menu on hover */
	.dropdown:hover .dropdown-content {
		display: block;
	}
</style>
