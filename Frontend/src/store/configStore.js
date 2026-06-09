import { writable } from 'svelte/store';
import TherapyGeneralComplicationChart from '../routes/therapy-general/TherapyGeneralComplicationChart.svelte';
import { t, locale, locales } from "../store/languageStore";
import { get } from "svelte/store";
import SurvivalKaplanMeierChart from '../routes/survival/SurvivalKaplanMeierChart.svelte';
import SurvivalFollowUpAssessment from '../routes/survival/SurvivalFollowUpAssessment.svelte';

const currentYear = new Date().getFullYear();
const selectedFollowUpYear = currentYear - 1;

export const configStore = writable({
    patientCohortOverviewTableTab: "overview",

    patientCohortAgeChartShowChart: true,
    patientCohortAgeChartShowLogarithm: false,

    patientCohortDeathChartShowChart: true, 
    patientCohortDeathChartShowLogarithm: false ,

    patientCohortGenderChartShowChart: true, 
    patientCohortGenderChartShowLogarithm: false,

    TNMChartShowChart: true,
    TNMChartShowTop5: true,
    TNMChartShowNull: false,
    TNMChartShowLogarithm: false,
    TNMChartInitialDropdown: "UICC",

    TherapyGeneralChartShowChart: true,
    TherapyGeneralChartShowTop5: true,
    TherapyGeneralChartShowNull: false,
    TherapyGeneralChartShowLogarithm: false,
    TherapyGeneralChartInitialDropdown: "generalType",

    TherapyOperationChartShowChart: true,
    TherapyOperationChartShowTop5: true,
    TherapyOperationChartShowNull: false,
    TherapyOperationChartShowLogarithm: false,
    TherapyOperationChartInitialDropdown: "resectionType",

    TherapySystemicChartShowChart: true,
    TherapySystemicChartShowTop5: true,
    TherapySystemicChartShowNull: false,
    TherapySystemicChartShowLogarithm: false,
    TherapySystemicChartInitialDropdown: "subType",

    TherapyRadiationChartShowChart: true,
    TherapyRadiationChartShowTop5: true,
    TherapyRadiationChartShowNull: false,
    TherapyRadiationChartShowLogarithm: false,
    TherapyRadiationChartInitialDropdown: "radiation_type",

    ProgressChartShowChart: true,
    ProgressChartShowTop5: true,
    ProgressChartShowNull: false,
    ProgressChartShowLogarithm: false,
    ProgressChartInitialDropdown: "overallAssessment",

    BioMaterialChartShowChart: true,
    BioMaterialChartShowTop5: true,
    BioMaterialChartShowNull: false,
    BioMaterialChartShowLogarithm: false,
    BioMaterialChartInitialDropdown: "project",

    ConsultationChartShowChart: true,
    ConsultationChartShowTop5: true,
    ConsultationChartShowNull: false,
    ConsultationChartShowLogarithm: false,
    ConsultationChartInitialDropdown: "type",

    StatusChartShowChart: true,
    StatusChartShowTop5: true,
    StatusChartShowNull: false,
    StatusChartShowLogarithm: false,
    StatusChartInitialDropdown: "type",

    TumorboardChartShowChart: true,
    TumorboardChartShowTop5: true,
    TumorboardChartShowNull: false,
    TumorboardChartShowLogarithm: false,
    TumorboardChartInitialDropdown: "type",

    StudyChartShowChart: true,
    StudyChartShowTop5: true,
    StudyChartShowNull: false,
    StudyChartShowLogarithm: false,
    StudyChartInitialDropdown: "organisationFull",

    ProgressTimeChartShowLogarithm: false,
    ProgressTimeChartTimeUnit: "years",
    ProgressTimeChartDatediff: false,
    ProgressTimeChartMedian:"indicatorDeactivated",
    ProgressTimeChartEvent:"all",
    ProgressTimeChartDropdown:"overallAssessment",

    TherapyGeneralTimeChartShowLogarithm: false,
    TherapyGeneralTimeChartTimeUnit: "years",
    TherapyGeneralTimeChartDatediff: false,
    TherapyGeneralTimeChartMedian:"indicatorDeactivated",
    TherapyGeneralTimeChartEvent:"all",
    TherapyGeneralTimeChartDropdown:"generalType",

    ConsultationTimeChartShowLogarithm: false,
    ConsultationTimeChartTimeUnit: "years",
    ConsultationTimeChartDatediff: false,
    ConsultationTimeChartMedian:"indicatorDeactivated",
    ConsultationTimeChartEvent:"all",
    ConsultationTimeChartDropdown:"type",

    StatusTimeChartShowLogarithm: false,
    StatusTimeChartTimeUnit: "years",
    StatusTimeChartDatediff: false,
    StatusTimeChartMedian:"indicatorDeactivated",
    StatusTimeChartEvent:"all",
    StatusTimeChartDropdown:"type",

    TumorboardTimeChartShowLogarithm: false,
    TumorboardTimeChartTimeUnit: "years",
    TumorboardTimeChartDatediff: false,
    TumorboardTimeChartMedian:"indicatorDeactivated",
    TumorboardTimeChartEvent:"all",
    TumorboardTimeChartDropdown:"type",

    DiagnosisBodymapShowLogarithm: false,
    DiagnosisBodymapShowChart: true,

    PatientCohortMapChartShowLogarithm: false,
    PatientCohortMapChartShowChart: true,

    TherapyRadiationMapShowLogarithm: false,
    TherapyRadiationMapShowChart: true,

    TNMBodyMapShowLogarithm: false,
    TNMBodyMapShowChart: true,

    TherapyGeneralComplicationChartShowChart: true,
    TherapyGeneralComplicationChartShowTop5: true,

    MolecularMarkerChartShowChart: true,
    MolecularMarkerChartShowTop5: true,

    SupplementaryChartShowChart: true,
    SupplementaryChartShowTop5: true,

    DiagnosisBarChartShowChart: true,
    DiagnosisBarChartShowTop5: true,
    DiagnosisBarChartSelectedFeature: { value: "ICD_ICD10Group", label: "ICD-10 (grouped)" },
    DiagnosisBarChartSelectedGender: false,
    DiagnosisBarChartSelectedAbscissa: { value: "years", label: get(t)("year") },

    TNM3DChartShowChart: true,
    TNM3DChartSelectedTNMType: { label: "Gesamt", value: 'total'},
    TNM3DChartSelectedTType:  { label: 'T ' + get(t)("grouped") + get(t)("withoutUnknowns"), value: 'groupnull' },
    TNM3DChartSelectedNType:  { label: 'N ' + get(t)("grouped") + get(t)("withoutUnknowns"), value: 'groupnull' },
    TNM3DChartSelectedMType: { label: 'M ' + get(t)("grouped") + get(t)("withoutUnknowns"), value: 'groupnull' },
    TNM3DChartSelectedTimeType:  { label: get(t)("showTNMData"), value: 'all' },

    SurvivalKaplanMeierChartShowChart: true,
    SurvivalKaplanMeierChartSelectedTimeType:'Jahr',
    SurvivalKaplanMeierChartSelectedChartType: 'overallSurvival',
    SurvivalKaplanMeierChartSelectedConfidenceType: 'Kein Konf.-Intervall',
    SurvivalKaplanMeierChartSelectedStratificationType: 'none',

    SurvivalFollowUpAssessmentShowChart: true,
    SurvivalFollowUpAssessmentShowLogarithm: false,
    SurvivalFollowUpAssessmentIncludeTherapy: true,
    SurvivalFollowUpAssessmentIncludeVitaldate: true,
    SurvivalFollowUpAssessmentIsYearInterval: false,
    SurvivalFollowUpAssessmentSelectedFollowUpYear: selectedFollowUpYear,
    SurvivalFollowUpAssessmentIntervalStart: `${selectedFollowUpYear}-01-01`,
    SurvivalFollowUpAssessmentIntervalEnd: `${selectedFollowUpYear}-12-31`,

    StudyPatientChartShowLogarithm: false,

    PatientSingleMetastasisMapShowLogarithm: false,
    PatientSingleMetastasisMapShowChart: true,

    PatientSingleDiagnosisMapShowLogarithm: false,
    PatientSingleDiagnosisMapShowChart: true,
});
