/** Invented test fixtures only; never imported by application runtime code. */
import type { DataRows } from '../../src/lib/export-builder/model';

/** Deliberately includes multiple matches, absent children, and invalid/missing link keys. */
export const exportBuilderRows: DataRows = {
	patient: [
		{
			_id: 'DEMO-PAT-01',
			patID: 'DEMO-P01',
			gender: 'weiblich',
			birthDate: '1964-04-12',
			vitalState: 'lebend',
			vitalDate: '2026-08-10',
			ageAtDiagnosis: 60,
			countryCode: 'DE',
			countryName: 'Deutschland',
			state: 'Baden-Württemberg',
			district: 'Tübingen',
			county: 'Ulm',
			postalCode: '89073'
		},
		{
			_id: 'DEMO-PAT-02',
			patID: 'DEMO-P02',
			gender: 'männlich',
			birthDate: '1958-11-23',
			vitalState: 'lebend',
			vitalDate: '2026-08-21',
			ageAtDiagnosis: 66,
			countryCode: 'DE',
			countryName: 'Deutschland',
			state: 'Bayern',
			postalCode: '89231'
		},
		{
			_id: 'DEMO-PAT-03',
			patID: 'DEMO-P03',
			gender: 'weiblich',
			birthDate: '1972-02-08',
			vitalState: 'lebend',
			vitalDate: '2026-09-02',
			ageAtDiagnosis: 52,
			countryCode: 'DE',
			countryName: 'Deutschland',
			state: 'Baden-Württemberg'
		},
		{
			_id: 'DEMO-PAT-04',
			patID: 'DEMO-P04',
			gender: 'männlich',
			birthDate: '1949-07-30',
			vitalState: 'verstorben',
			vitalDate: '2026-06-17',
			deathDate: '2026-06-17',
			ageAtDiagnosis: 75
		},
		{
			_id: 'DEMO-PAT-05',
			patID: 'DEMO-P05',
			gender: 'weiblich',
			birthDate: '1985-01-14',
			vitalState: 'lebend',
			vitalDate: '2026-09-18'
		}
	],
	diagnosis: [
		{
			_id: 'DEMO-D01',
			tumorID: 'DEMO-T01',
			patID: 'DEMO-P01',
			diagnosisDate: '2025-01-14',
			'ICD.ICD10': 'C50.9',
			ICDO_histologyCode: '8500/3',
			ICDO_histologyCodeText: 'Invasives duktales Karzinom',
			ICDO_localizationCode: 'C50.9',
			side: 'links',
			ageAtDiagnosis: 60,
			ECOG: '0',
			centerCase: 'Ja',
			primaryCase: 'Ja',
			diagnosisAssurance: 'Histologie',
			diagnosisReason: 'Screening',
			organizationalUnit: 'Demo-Zentrum A'
		},
		{
			_id: 'DEMO-D02',
			tumorID: 'DEMO-T02',
			patID: 'DEMO-P01',
			diagnosisDate: '2025-06-03',
			'ICD.ICD10': 'C18.7',
			ICDO_histologyCode: '8140/3',
			ICDO_histologyCodeText: 'Adenokarzinom',
			ageAtDiagnosis: 61,
			ECOG: '1',
			primaryCase: 'Ja'
		},
		{
			_id: 'DEMO-D03',
			tumorID: 'DEMO-T03',
			patID: 'DEMO-P02',
			diagnosisDate: '2025-02-19',
			'ICD.ICD10': 'C34.1',
			ICDO_histologyCode: '8140/3',
			ICDO_histologyCodeText: 'Adenokarzinom',
			side: 'rechts',
			ageAtDiagnosis: 66,
			ECOG: '1'
		},
		{
			_id: 'DEMO-D04',
			tumorID: 'DEMO-T04',
			patID: 'DEMO-P03',
			diagnosisDate: '2025-03-07',
			'ICD.ICD10': 'C53.9',
			ageAtDiagnosis: 53,
			ECOG: '0'
		},
		{
			_id: 'DEMO-D05',
			tumorID: 'DEMO-T05',
			patID: 'DEMO-P04',
			diagnosisDate: '2025-04-22',
			'ICD.ICD10': 'C61',
			ageAtDiagnosis: 75,
			ECOG: '2'
		},
		{
			_id: 'DEMO-D06',
			tumorID: 'DEMO-T06',
			patID: null,
			diagnosisDate: '2025-08-11',
			'ICD.ICD10': 'C43.9',
			ECOG: '0'
		}
	],
	therapy: [
		{
			_id: 'DEMO-TH-ROW-01',
			therapyID: 'DEMO-TH01',
			tumorID: 'DEMO-T01',
			patID: 'DEMO-P01',
			generalType: 'Bestrahlung',
			therapyOccurrenceDate: '2025-03-10',
			therapyEndDate: '2025-04-07',
			intention: 'kurativ',
			phase: 'adjuvant',
			ECOG: '0',
			therapyDaysSinceDiagnosis: 55
		},
		{
			_id: 'DEMO-TH-ROW-02',
			therapyID: 'DEMO-TH02',
			tumorID: 'DEMO-T01',
			patID: 'DEMO-P01',
			generalType: 'Operation',
			therapyOccurrenceDate: '2025-02-03',
			therapyEndDate: '2025-02-03',
			intention: 'kurativ',
			localRState: 'R0',
			therapyDaysSinceDiagnosis: 20
		},
		{
			_id: 'DEMO-TH-ROW-03',
			therapyID: 'DEMO-TH03',
			tumorID: 'DEMO-T02',
			patID: 'DEMO-P01',
			generalType: 'Systemtherapie',
			therapyOccurrenceDate: '2025-07-01',
			intention: 'kurativ',
			protocol: 'Demo-Protokoll A',
			therapyLine: '1',
			therapyDaysSinceDiagnosis: 28
		},
		{
			_id: 'DEMO-TH-ROW-04',
			therapyID: 'DEMO-TH04',
			tumorID: 'DEMO-T03',
			patID: 'DEMO-P02',
			generalType: 'Bestrahlung',
			therapyOccurrenceDate: '2025-04-02',
			therapyEndDate: '2025-05-14',
			intention: 'kurativ',
			ECOG: '1',
			therapyDaysSinceDiagnosis: 42
		},
		{
			_id: 'DEMO-TH-ROW-05',
			therapyID: 'DEMO-TH05',
			tumorID: 'DEMO-T04',
			patID: 'DEMO-P03',
			generalType: 'Bestrahlung',
			therapyOccurrenceDate: '2025-04-15',
			intention: 'kurativ',
			therapyDaysSinceDiagnosis: 39
		},
		{
			_id: 'DEMO-TH-ROW-06',
			therapyID: null,
			tumorID: 'DEMO-T05',
			patID: 'DEMO-P04',
			generalType: 'Bestrahlung',
			therapyOccurrenceDate: '2025-05-20',
			intention: 'palliativ',
			therapyDaysSinceDiagnosis: 28
		},
		{
			_id: 'DEMO-TH-ROW-07',
			tumorID: 'DEMO-T06',
			patID: null,
			generalType: 'Operation',
			therapyOccurrenceDate: '2025-08-25',
			intention: 'kurativ',
			therapyDaysSinceDiagnosis: 14
		}
	],
	radiation: [
		{
			_id: 'DEMO-TH-ROW-01',
			therapyID: 'DEMO-TH01',
			tumorID: 'DEMO-T01',
			patID: 'DEMO-P01',
			type: 'Teletherapie',
			areaDetailed: 'Linke Brust',
			areaGrouped: 'Thorax',
			singleDose: 2,
			singleDoseUnit: 'Gy',
			totalDose: 50,
			totalDoseUnit: 'Gy',
			boost: 'Nein',
			side: 'links',
			tech: 'IMRT',
			radioType: 'Photonen',
			therapyOccurrenceDate: '2025-03-10'
		},
		{
			_id: 'DEMO-TH-ROW-01',
			therapyID: 'DEMO-TH01',
			tumorID: 'DEMO-T01',
			patID: 'DEMO-P01',
			type: 'Teletherapie',
			areaDetailed: 'Tumorbett',
			areaGrouped: 'Thorax',
			singleDose: 2,
			singleDoseUnit: 'Gy',
			totalDose: 10,
			totalDoseUnit: 'Gy',
			boost: 'Sequenziell',
			side: 'links',
			radioType: 'Photonen',
			therapyOccurrenceDate: '2025-03-10'
		},
		{
			_id: 'DEMO-TH-ROW-01',
			therapyID: 'DEMO-TH01',
			tumorID: 'DEMO-T01',
			patID: 'DEMO-P01',
			type: 'Teletherapie',
			areaDetailed: 'Regionäre Lymphknoten',
			areaGrouped: 'Thorax',
			singleDose: 2,
			singleDoseUnit: 'Gy',
			totalDose: 50,
			totalDoseUnit: 'Gy',
			boost: 'Nein',
			side: 'links',
			therapyOccurrenceDate: '2025-03-10'
		},
		{
			_id: 'DEMO-TH-ROW-04',
			therapyID: 'DEMO-TH04',
			tumorID: 'DEMO-T03',
			patID: 'DEMO-P02',
			type: 'Teletherapie',
			areaDetailed: 'Rechte Lunge',
			areaGrouped: 'Thorax',
			singleDose: 2,
			singleDoseUnit: 'Gy',
			totalDose: 60,
			totalDoseUnit: 'Gy',
			side: 'rechts',
			therapyOccurrenceDate: '2025-04-02'
		},
		{
			_id: 'DEMO-TH-ROW-04',
			therapyID: 'DEMO-TH04',
			tumorID: 'DEMO-T03',
			patID: 'DEMO-P02',
			type: 'Teletherapie',
			areaDetailed: 'Mediastinum',
			areaGrouped: 'Thorax',
			singleDose: 2,
			singleDoseUnit: 'Gy',
			totalDose: 50,
			totalDoseUnit: 'Gy',
			therapyOccurrenceDate: '2025-04-02'
		},
		{
			_id: null,
			therapyID: null,
			tumorID: 'DEMO-T05',
			patID: 'DEMO-P04',
			type: 'Teletherapie',
			areaDetailed: 'Demo: fehlende Therapiezuordnung',
			totalDose: 20
		},
		{
			tumorID: 'DEMO-T06',
			patID: null,
			type: 'Teletherapie',
			areaDetailed: 'Demo: unbekannte Therapiezuordnung',
			totalDose: 30
		}
	],
	histology: [
		{
			_id: 'DEMO-H01',
			tumorID: 'DEMO-T01',
			patID: 'DEMO-P01',
			ICDO_histologyCode: '8500/3',
			ICDO_histologyCodeText: 'Invasives duktales Karzinom',
			ICDO_histologyDate: '2025-01-14',
			ICDO_source: 'Biopsie',
			ICDO_grading: 'G2'
		},
		{
			_id: 'DEMO-H02',
			tumorID: 'DEMO-T01',
			patID: 'DEMO-P01',
			ICDO_histologyCode: '8500/3',
			ICDO_histologyCodeText: 'Invasives duktales Karzinom',
			ICDO_histologyDate: '2025-02-03',
			ICDO_source: 'Resektat',
			ICDO_grading: 'G2',
			ICDO_Nb: '0',
			ICDO_Nu: '3'
		},
		{
			_id: 'DEMO-H03',
			tumorID: 'DEMO-T02',
			patID: 'DEMO-P01',
			ICDO_histologyCode: '8140/3',
			ICDO_histologyCodeText: 'Adenokarzinom',
			ICDO_histologyDate: '2025-06-03',
			ICDO_source: 'Biopsie',
			ICDO_grading: 'G2'
		},
		{
			_id: 'DEMO-H04',
			tumorID: 'DEMO-T03',
			patID: 'DEMO-P02',
			ICDO_histologyCode: '8140/3',
			ICDO_histologyCodeText: 'Adenokarzinom',
			ICDO_histologyDate: '2025-02-19',
			ICDO_grading: 'G3'
		}
	],
	tnm: [
		{
			_id: 'DEMO-TNM01',
			tumorID: 'DEMO-T01',
			patID: 'DEMO-P01',
			tnmOccurrenceDate: '2025-01-20',
			type: 'klinisch',
			T: 'T2',
			N: 'N0',
			M: 'M0',
			UICC: 'IIA',
			version: '8'
		},
		{
			_id: 'DEMO-TNM02',
			tumorID: 'DEMO-T01',
			patID: 'DEMO-P01',
			tnmOccurrenceDate: '2025-02-03',
			type: 'pathologisch',
			T: 'T2',
			N: 'N0',
			M: 'M0',
			UICC: 'IIA',
			RClass: 'R0',
			L: 'L0',
			V: 'V0',
			Pn: 'Pn0',
			version: '8'
		},
		{
			_id: 'DEMO-TNM03',
			tumorID: 'DEMO-T03',
			patID: 'DEMO-P02',
			tnmOccurrenceDate: '2025-02-21',
			type: 'klinisch',
			T: 'T3',
			N: 'N2',
			M: 'M0',
			UICC: 'IIIB',
			version: '8'
		}
	],
	progress: [
		{
			_id: 'DEMO-V01',
			tumorID: 'DEMO-T01',
			patID: 'DEMO-P01',
			progressOccurrenceDate: '2025-06-10',
			overallAssessment: 'Vollremission',
			tumorState: 'Kein Tumor nachweisbar',
			vitalState: 'lebend',
			progressReason: 'Nachsorge',
			progressDaysSinceDiagnosis: 147
		},
		{
			_id: 'DEMO-V02',
			tumorID: 'DEMO-T01',
			patID: 'DEMO-P01',
			progressOccurrenceDate: '2025-12-10',
			overallAssessment: 'Vollremission',
			tumorState: 'Kein Tumor nachweisbar',
			vitalState: 'lebend',
			progressReason: 'Nachsorge',
			progressDaysSinceDiagnosis: 330
		},
		{
			_id: 'DEMO-V03',
			tumorID: 'DEMO-T03',
			patID: 'DEMO-P02',
			progressOccurrenceDate: '2025-07-14',
			overallAssessment: 'Teilremission',
			tumorState: 'Regredient',
			vitalState: 'lebend',
			progressDaysSinceDiagnosis: 145
		}
	],
	metastasis: [
		{
			_id: 'DEMO-M01',
			tumorID: 'DEMO-T05',
			patID: 'DEMO-P04',
			metastasisDate: '2025-04-29',
			metastasisLocation: 'Knochen',
			type: 'synchron',
			spread: 'multipel'
		}
	],
	tumorBoard: [
		{
			_id: 'DEMO-TB01',
			tumorID: 'DEMO-T01',
			patID: 'DEMO-P01',
			tumorBoardOccurrenceDate: '2025-01-22',
			type: 'Interdisziplinär',
			recommendation: 'Operation und adjuvante Therapie',
			praepost: 'prätherapeutisch',
			tbInternal: 'intern'
		}
	],
	consultation: [
		{
			_id: 'DEMO-K01',
			tumorID: 'DEMO-T01',
			patID: 'DEMO-P01',
			consultationOccurrenceDate: '2025-01-27',
			type: 'Psychoonkologie',
			status: 'durchgeführt',
			consultationDaysSinceDiagnosis: 13
		}
	],
	status: [
		{
			_id: 'DEMO-S01',
			tumorID: 'DEMO-T01',
			patID: 'DEMO-P01',
			statusOccurrenceDate: '2025-01-22',
			type: 'ECOG',
			status: '0',
			statusDaysSinceDiagnosis: 8
		}
	],
	molecularMarker: [
		{
			_id: 'DEMO-MM01',
			tumorID: 'DEMO-T01',
			patID: 'DEMO-P01',
			molecularMarkerOccurrenceDate: '2025-01-16',
			type: 'HER2',
			status: 'negativ',
			method: 'Immunhistochemie',
			project: 'Demo-Projekt'
		}
	],
	bioMaterial: [
		{
			_id: 'DEMO-B01',
			tumorID: 'DEMO-T01',
			patID: 'DEMO-P01',
			bioMaterialOccurrenceDate: '2025-02-03',
			type: 'Tumorgewebe',
			status: 'verfügbar',
			project: 'Demo-Biobank',
			reference: 'DEMO-PROBE-01',
			amount: '2',
			amountUnit: 'Blöcke'
		}
	],
	studyPatient: [
		{
			_id: 'DEMO-SP01',
			patID: 'DEMO-P01',
			studyID: 'DEMO-ST01',
			shortname: 'Demo-Studie A',
			recruitmentDate: '2025-02-01'
		},
		{
			_id: 'DEMO-SP02',
			patID: 'DEMO-P01',
			studyID: 'DEMO-ST02',
			shortname: 'Demo-Studie B',
			recruitmentDate: '2025-07-15'
		},
		{
			_id: 'DEMO-SP03',
			patID: 'DEMO-P02',
			studyID: 'DEMO-ST01',
			shortname: 'Demo-Studie A',
			recruitmentDate: '2025-03-01'
		}
	],
	supplementary: [
		{
			_id: 'DEMO-Z01',
			tumorID: 'DEMO-T01',
			patID: 'DEMO-P01',
			therapyID: 'DEMO-TH02',
			supplementaryOccurrenceDate: '2025-02-03',
			type: 'Zusatzdokumentation',
			status: 'vollständig'
		}
	]
};
