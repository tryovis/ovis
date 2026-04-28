<script lang="ts">
	import GenericTable from '../../components/GenericTable.svelte';

	import {
		getPatientCohortOverviewTable,
		getPatientCohortOverviewCCPTable,
		getPatientCohortOverviewPseudoTable,
		getPatientCohortHistoryTable
	} from '../../graphQl/gql-patient-cohort';
	import { maxStore } from '../../store/maxStore';
	import { variantStore } from '../../store/variantStore.js';
	import { t, locale, locales } from "../../store/languageStore";
	import { userStore } from '../../store/userStore';
	import { configStore } from '../../store/configStore';

	let patientCohortOverviewTableTab: string;
	configStore.subscribe((value: any) => {
		({ patientCohortOverviewTableTab } = value);
	});

	let pseudonymization: boolean;
	userStore.subscribe((value: any) => {
		({ pseudonymization } = value);
	});

	let isCCP: boolean;
	variantStore.subscribe((value: any) => {
		({ isCCP } = value);
	});

	let maximizePatientCohortOverviewTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizePatientCohortOverviewTable } = value);
	});

	function handleMaximized(event: any) {
		maximizePatientCohortOverviewTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizePatientCohortOverviewTable =
				!storeValues.maximizePatientCohortOverviewTable;
			return storeValues;
		});
	}

	let sortingIndex1 = 8;
	let sortingIndex1_ccp = 5;
	let sortingIndex2 = 2;

	let columnsOverview: any = [
		{ data: 'patID', header: $t("PID"), tooltip: $t("patientID") },
		{ data: 'firstName', header: $t("firstName"), tooltip: $t("firstNameLong") },
		{ data: 'lastName', header: $t("lastName"), tooltip: $t("lastNameLong") },
		{ data: 'gender', header: "G", tooltip: $t("gender") },
		{ data: 'birthDate', header: $t("birthDateShort"), date: true, tooltip: $t("birthDateLong") },
		{ data: 'postalCode', header: $t("ZIPCode"), tooltip: $t("ZIPCode") },
		{ data: 'area', header: $t("city"), tooltip: $t("city") },
		{ data: 'countryCode', header: $t("countryShort"), tooltip: $t("countryLong") },
		{ data: 'vitalDate', header: $t("vitalDate"), date: true, tooltip: $t("vitalDateLong") },
		{ data: 'vitalState', header: "V-Status", tooltip: "Vitalstatus" }
	];

	let columnsOverviewPseudo = [
		{ data: 'patID', header: "Pseudonym", tooltip: $t("patientID") },
		{ data: 'gender', header: "G", tooltip: $t("gender") },
		{ data: 'birthDate', header: $t("birthDateShort"), date: true, tooltip: $t("birthDateLong") },
		{ data: 'postalCode', header: $t("ZIPCode"), tooltip: $t("ZIPCode") },
		{ data: 'area', header: $t("city"), tooltip: $t("city") },
		{ data: 'countryCode', header: $t("countryShort"), tooltip: $t("countryLong") },
		{ data: 'vitalDate', header: $t("vitalDate"), date: true, tooltip: $t("vitalDateLong") },
		{ data: 'vitalState', header: "V-Status", tooltip: "Vitalstatus" }
	];

	let columnsOverview_ccp = [
		{ data: 'patID', header: $t("PID"), tooltip: $t("patientID") },
		{ data: 'patID', header: $t("IDType"), tooltip: "ID" },
		{ data: 'gender', header: "Geschlecht", tooltip: $t("gender") },
		{ data: 'birthDate', header: $t("birthDateShort"), date: true },
		{ data: 'vitalDate', header: $t("vitalDate"), date: true, tooltip: $t("vitalDateLong") },
		{ data: 'vitalState', header: "V-Status", tooltip: "Vitalstatus" }
	];

	let columnsHistory = [
		{ data: 'patID', header: $t("PID"), tooltip: $t("patientID") },
		{ data: 'tumorID', header: $t("TID"), tooltip: $t("tumorID") },
		{ data: 'diagnosisDate', header: $t("diagnosisDate"), date: true, tooltip: $t("diagnosisDateLong") },
		{ data: 'ICD.ICD10', header: $t("ICD10"), tooltip: `<a target="_blank" href="https://www.dimdi.de/static/de/klassifikationen/icd/icd-10-gm/kode-suche/htmlgm2022/">${$t("ICD10DiagnosisCode")}</a>` },
		{ data: 'ICDO.localizationCode', header: $t("localizationCode"), tooltip: `<a target="_blank" href="https://www.dimdi.de/dynamic/de/klassifikationen/icd/icd-o-3/icd03rev2html/">${$t("localizationCodeLong")}</a>` },
		{ data: 'ICDO.histologyCode', header: $t("histologyCode"), tooltip: `<a target="_blank" href="https://www.dimdi.de/dynamic/de/klassifikationen/icd/icd-o-3/icd03rev2html/">${$t("histologyCodeLong")}</a>` },
		{ data: 'ageAtDiagnosis', header: $t("diagnosisAge"), tooltip: $t("ageAtDiagnosis") },
		{ data: 'reportID', header: $t("reportID"), ccp: false, tooltip: $t("reportID") }
	];

	let showOverview = patientCohortOverviewTableTab !== 'history';
	let showHistory = patientCohortOverviewTableTab === 'history';
	let showDoctors = false;

	async function showTable(category: string) {
		if (category === 'overview') {
			showOverview = true;
			showHistory = false;
			showDoctors = false;
			configStore.update((storeValues) => {
				storeValues.patientCohortOverviewTableTab = 'overview';
				return storeValues;
			});
		}
		if (category === 'history') {
			showOverview = false;
			showHistory = true;
			showDoctors = false;
			configStore.update((storeValues) => {
				storeValues.patientCohortOverviewTableTab = 'history';
				return storeValues;
			});
		}
	}
</script>

<div class="straight-line-container">
	<div class="navbar">
		<button class={showOverview ? 'current_selection' : ''} on:click={() => showTable('overview')}>
			{$t("patientInformation")}
		</button>
		<button class={showHistory ? 'current_selection' : ''} on:click={() => showTable('history')}>
			{$t("diagnosisHistory")}
		</button>
	</div>
</div>
{#if showOverview}
	{#if isCCP}
		<GenericTable
			collection="patient"
			columns={columnsOverview_ccp}
			getTableData={getPatientCohortOverviewCCPTable}
			sortingIndex={sortingIndex1_ccp}
			tableIdName={"patientCohortOverviewCCPTable"}
			headlineTitle={$t("patientInformation")}
			loadingActive={true}
			maxStoreValue={maximizePatientCohortOverviewTable}
			on:maximized={handleMaximized}
		/>
	{:else if pseudonymization}
		<GenericTable
			collection="patient"
			columns={columnsOverviewPseudo}
			getTableData={getPatientCohortOverviewPseudoTable}
			sortingIndex={6}
			tableIdName={"patientCohortOverviewPseudoTable"}
			headlineTitle={$t("patientInformation")}
			loadingActive={true}
			maxStoreValue={maximizePatientCohortOverviewTable}
			on:maximized={handleMaximized}
		/>
	{:else}
		<GenericTable
			collection="patient"
			columns={columnsOverview}
			getTableData={getPatientCohortOverviewTable}
			sortingIndex={sortingIndex1}
			tableIdName={"patientCohortOverviewTable"}
			headlineTitle={$t("patientInformation")}
			loadingActive={true}
			maxStoreValue={maximizePatientCohortOverviewTable}
			on:maximized={handleMaximized}
		/>
	{/if}
{/if}

{#if showHistory}
    <GenericTable
		collection="diagnosis"
        columns={columnsHistory}
        getTableData={getPatientCohortHistoryTable}
        sortingIndex={sortingIndex2}
        tableIdName={"patientCohortHistoryTable"}
        headlineTitle={$t("diagnosisHistory")}
        loadingActive={true}
        maxStoreValue={maximizePatientCohortOverviewTable}
        on:maximized={handleMaximized}
    />
{/if}
