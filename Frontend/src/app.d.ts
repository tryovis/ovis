// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}
}

// Declare module for environment variables
declare module '$env/static/public' {
	export const PUBLIC_LOGIN_ENABLED: string | undefined;
	export const PUBLIC_IMPORT_MODE: string | undefined;
	export const PUBLIC_SITE_SPECIFIC_TECHNICAL_ADMIN_NAME: string | undefined;
	export const PUBLIC_SITE_SPECIFIC_TECHNICAL_ADMIN_EMAIL: string | undefined;
	export const PUBLIC_SYSTEM_START_LANGUAGE: string | undefined;
	export const PUBLIC_LDAP_ENABLED: string | undefined;
	export const PUBLIC_NAV_PATIENT_COHORT_ENABLED: string | undefined;
	export const PUBLIC_NAV_PATIENT_SINGLE_ENABLED: string | undefined;
	export const PUBLIC_NAV_DIAGNOSIS_ENABLED: string | undefined;
	export const PUBLIC_NAV_TNM_ENABLED: string | undefined;
	export const PUBLIC_NAV_THERAPY_GENERAL_ENABLED: string | undefined;
	export const PUBLIC_NAV_THERAPY_OPERATION_ENABLED: string | undefined;
	export const PUBLIC_NAV_THERAPY_SYSTEMIC_ENABLED: string | undefined;
	export const PUBLIC_NAV_THERAPY_RADIATION_ENABLED: string | undefined;
	export const PUBLIC_NAV_PROGRESS_ENABLED: string | undefined;
	export const PUBLIC_NAV_TUMORBOARD_ENABLED: string | undefined;
	export const PUBLIC_NAV_CONSULTATION_ENABLED: string | undefined;
	export const PUBLIC_NAV_STATUS_ENABLED: string | undefined;
	export const PUBLIC_NAV_SURVIVAL_ENABLED: string | undefined;
	export const PUBLIC_NAV_SUPPLEMENTARY_ENABLED: string | undefined;
	export const PUBLIC_NAV_MOLECULAR_ENABLED: string | undefined;
	export const PUBLIC_NAV_BIO_MATERIAL_ENABLED: string | undefined;
	export const PUBLIC_NAV_STUDY_ENABLED: string | undefined;
	export const PUBLIC_NAV_USER_MANAGEMENT_ENABLED: string | undefined;
	export const PUBLIC_QUICKTOOLS_GENDER_BUTTONS: string | undefined;
	export const PUBLIC_QUICKTOOLS_GENDER_OTHER_EXCLUSIONS: string | undefined;
	export const PUBLIC_QUICKTOOLS_CERT_CASES_POS: string | undefined;
	export const PUBLIC_QUICKTOOLS_CERT_CASES_NEG: string | undefined;
	export const PUBLIC_QUICKTOOLS_CERT_INTERNAL_LABEL: string | undefined;
}

export {};
