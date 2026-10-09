import type { navConfig } from './navigation';

export type NavigationConfig = typeof navConfig;

/** Shared feature visibility for the navigation and the export catalogue. */
export function getNavigationAvailability(
	config: NavigationConfig,
	isCCP: boolean
): Record<string, boolean> {
	return {
		'patient-cohort': config.patient.cohort,
		'patient-single': config.patient.single,
		diagnosis: config.diagnosis.enabled,
		tnm: config.tnm.enabled,
		'therapy-general': config.therapy.general,
		'therapy-operation': config.therapy.operation,
		'therapy-systemic': config.therapy.systemic,
		'therapy-radiation': config.therapy.radiation,
		'therapy-nuclear': config.therapy.nuclear,
		'therapy-other': config.therapy.other,
		progress: config.timeline.progress,
		tumorboard: config.timeline.tumorboard,
		consultation: config.timeline.consultation && !isCCP,
		status: config.timeline.status,
		survival: config.survival.enabled,
		supplementary: config.supplementary.enabled,
		molecular: config.molecular.enabled,
		'bio-material': config.bioMaterial.enabled && isCCP,
		study: config.study.enabled && !isCCP,
		export: config.export.enabled
	};
}
