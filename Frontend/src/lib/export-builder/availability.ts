import {
	getNavigationAvailability,
	type NavigationConfig
} from '../../config/navigation-availability';
import { datasets, type Dataset } from './model';

/** A dataset follows the page or navigation group that presents its records. */
export function getAvailableExportDatasets(
	config: NavigationConfig,
	isCCP: boolean,
	catalog: readonly Dataset[] = datasets
): Dataset[] {
	const navigation = getNavigationAvailability(config, isCCP);
	if (!navigation.export) return [];
	const enabled: Record<string, boolean> = {
		patient: navigation['patient-cohort'] || navigation['patient-single'],
		diagnosis: navigation.diagnosis,
		diagnostic: navigation.diagnosis,
		histology: navigation.diagnosis,
		tnm: navigation.tnm,
		metastasis: navigation.tnm,
		therapy: navigation['therapy-general'],
		radiation: navigation['therapy-radiation'],
		progress: navigation.progress,
		tumorBoard: navigation.tumorboard,
		consultation: navigation.consultation,
		status: navigation.status,
		molecularMarker: navigation.molecular,
		bioMaterial: navigation['bio-material'],
		studyPatient: navigation.study,
		study: navigation.study,
		kaplanMeier: navigation.survival,
		followUp: navigation.survival,
		supplementary: navigation.supplementary
	};
	return catalog.filter((dataset) => enabled[dataset.id]);
}
