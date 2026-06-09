import { env } from '$env/dynamic/public';

const flag = (value: string | undefined, fallback: boolean) => {
  if (value == null || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  return fallback;
};

export const navConfig = {
  patient: {
    cohort: flag(env.PUBLIC_NAV_PATIENT_COHORT_ENABLED, true),
    single: flag(env.PUBLIC_NAV_PATIENT_SINGLE_ENABLED, true)
  },
  diagnosis: {
    enabled: flag(env.PUBLIC_NAV_DIAGNOSIS_ENABLED, true)
  },
  tnm: {
    enabled: flag(env.PUBLIC_NAV_TNM_ENABLED, true)
  },
  therapy: {
    general: flag(env.PUBLIC_NAV_THERAPY_GENERAL_ENABLED, true),
    operation: flag(env.PUBLIC_NAV_THERAPY_OPERATION_ENABLED, true),
    systemic: flag(env.PUBLIC_NAV_THERAPY_SYSTEMIC_ENABLED, true),
    radiation: flag(env.PUBLIC_NAV_THERAPY_RADIATION_ENABLED, true)
  },
  timeline: {
    progress: flag(env.PUBLIC_NAV_PROGRESS_ENABLED, true),
    tumorboard: flag(env.PUBLIC_NAV_TUMORBOARD_ENABLED, true),
    consultation: flag(env.PUBLIC_NAV_CONSULTATION_ENABLED, true),
    status: flag(env.PUBLIC_NAV_STATUS_ENABLED, true)
  },
  survival: {
    enabled: flag(env.PUBLIC_NAV_SURVIVAL_ENABLED, true)
  },
  supplementary: {
    enabled: flag(env.PUBLIC_NAV_SUPPLEMENTARY_ENABLED, true)
  },
  molecular: {
    enabled: flag(env.PUBLIC_NAV_MOLECULAR_ENABLED, true)
  },
  bioMaterial: {
    enabled: flag(env.PUBLIC_NAV_BIO_MATERIAL_ENABLED, true)
  },
  study: {
    enabled: flag(env.PUBLIC_NAV_STUDY_ENABLED, true)
  },
  userManagement: {
    enabled: flag(env.PUBLIC_NAV_USER_MANAGEMENT_ENABLED, true)
  }
};

export { flag };
