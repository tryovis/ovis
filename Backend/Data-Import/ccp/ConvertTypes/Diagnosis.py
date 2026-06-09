from .utils import safe_get_nested, safe_profile_check, safe_get_coding_value, safe_reference_extract, safe_get_tumor_ids_from_condition, safe_get_patient_identifier, safe_map_code_to_display, safe_array_access, safe_date_format

class Diagnosis:
    def __init__(self, fhir_data):
        self.fhir_data = fhir_data

    def getDiagnosisInfo(self, diagnosis_info):
        conditions = safe_get_nested(diagnosis_info, "Resources", "Condition", default=[])
        observations = safe_get_nested(diagnosis_info, "Resources", "Observation", default=[])
        patient = safe_get_nested(diagnosis_info, "Patient")
        diagnosis_list = []

        def get_patient_identifier(patient_ref):
            """Get patient identifier from patient reference"""
            patient_id = safe_reference_extract(patient_ref, "Patient/")
            # Since we have direct access to the patient resource
            if patient and safe_get_nested(patient, "id") == patient_id:
                # Try "Lokal" first (for Patient-Patient profile)
                pat_id = safe_get_patient_identifier(patient, "Lokal")
                if pat_id:
                    return pat_id
                # Fall back to "Global" (for Patient-Pseudonym profile)
                pat_id = safe_get_patient_identifier(patient, "Global")
                if pat_id:
                    return pat_id
            return patient_id  # fallback to reference id if identifier not found

        def get_tumor_ids(condition):
            """Get tumor IDs from a Condition's stage assessments"""
            return safe_get_tumor_ids_from_condition(condition)

        for condition in conditions:
            if safe_profile_check(condition, "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Condition-Primaerdiagnose"):
                    # Get tumor IDs for this condition
                    tumor_ids = get_tumor_ids(condition)
                    
                    # If no tumor IDs found, use [None] to create at least one entry
                    if not tumor_ids:
                        tumor_ids = [None]

                    # Create base diagnosis for each tumor ID
                    for tumor_id in tumor_ids:
                        base_diagnosis = {
                            "tumorID": tumor_id,
                            "diagnosisDate": safe_date_format(safe_get_nested(condition, "onsetDateTime")),
                            "ICDO_localizationCode": None,
                            "ICD_ICD10": None,
                            "ICD_ICD10Text": None,
                            "diagnosisReason": None,
                            "side": None,
                            "patID": get_patient_identifier(safe_get_nested(condition, "subject", "reference", default=""))
                        }

                        # Extract ICD-10 code and text
                        code_concept = safe_get_nested(condition, "code")
                        base_diagnosis["ICD_ICD10"] = safe_get_coding_value(code_concept, "code", "http://fhir.de/CodeSystem/bfarm/icd-10-gm")
                        base_diagnosis["ICD_ICD10Text"] = safe_get_nested(code_concept, "text")

                        # Extract localization code and side
                        body_sites = safe_get_nested(condition, "bodySite", default=[])
                        for body_site in body_sites:
                            # Extract localization code
                            localization_code = safe_get_coding_value(body_site, "code", "urn:oid:2.16.840.1.113883.6.43.1")
                            if localization_code:
                                base_diagnosis["ICDO_localizationCode"] = localization_code
                            
                            # Extract side
                            side_code = safe_get_coding_value(body_site, "code", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/SeitenlokalisationCS")
                            side_mapping = {"R": "Rechts", "L": "Links"}
                            if side_code:
                                base_diagnosis["side"] = safe_map_code_to_display(side_code, side_mapping)

                        # Extract diagnosis reason
                        evidences = safe_get_nested(condition, "evidence", default=[])
                        for evidence in evidences:
                            code_items = safe_get_nested(evidence, "code", default=[])
                            for code_item in code_items:
                                reason_code = safe_get_coding_value(code_item, "code", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/DiagnosesicherungCS")
                                if reason_code:
                                    reason_mapping = {
                                        "1": "Klinisch ohne tumorspezifische Diagnostik (nur körperliche Untersuchung)",
                                        "2": "Klinisch: Klinische Diagnose vor dem Sterbedatum durchgeführt; schließt diagnostische Techniken, inklusive Röntgen, Endoskopie, weitere bildgebende Verfahren, Ultraschall, exploratorische Chirurgie (Laparatomie, etc.) und Autopsie, ohne mikroskopische Gewebediagnose, ein.",
                                        "4": "Spezifische Tumormarker",
                                        "5": "Zytologisch: Untersuchung von Zellen aus primären Lokalisationen inklusive Flüssigkeitsaspirationen mittels Endoskopien oder Nadeln. Schließt mikroskopische Untersuchungen von peripheren Blutausstrichen und Ausstrichen von Beckenkammaspirationen ein.",
                                        "6": "Histologie einer Metastase.",
                                        "7": "Histologisch: Histologie des Primärtumors: Histologische Untersuchung von Gewebe des Primärtumors einschließlich aller Schnitttechniken und Knochenmarksbiopsien. Dies schließt Proben des Primärtumors aus Autopsien ein. Histologische Untersuchung des Gewebes aus einer Metastase, einschließlich bei Autopsie.",
                                        "9": "Unbekannt"
                                    }
                                    base_diagnosis["diagnosisReason"] = safe_map_code_to_display(reason_code, reason_mapping)
                                    break
                                        

                        # Extract histologies
                        histologies = []
                        evidences = safe_get_nested(condition, "evidence", default=[])
                        for evidence in evidences:
                            details = safe_get_nested(evidence, "detail", default=[])
                            for detail in details:
                                reference = safe_get_nested(detail, "reference", default="")
                                if reference.startswith("Observation/hist"):
                                    obs_id = safe_reference_extract(reference, "Observation/")
                                    histology_obs = next((obs for obs in observations if safe_get_nested(obs, "id") == obs_id), None)
                                    if histology_obs:
                                        code = safe_get_coding_value(safe_get_nested(histology_obs, "code"), "code")
                                        if code == "59847-4":
                                            value_concept = safe_get_nested(histology_obs, "valueCodeableConcept")
                                            histology = {
                                                "ICDO_histologyCode": safe_get_coding_value(value_concept, "code", "urn:oid:2.16.840.1.113883.6.43.1"),
                                                "ICDO_histologyDescription": safe_get_nested(value_concept, "text"),
                                                "ICDO_histologyDate": safe_date_format(safe_get_nested(histology_obs, "effectiveDateTime"))
                                            }
                                            histologies.append(histology)

                        # Create a separate diagnosis entry for each histology
                        if histologies:
                            for histology in histologies:
                                diagnosis = base_diagnosis.copy()
                                diagnosis.update(histology)
                                diagnosis_list.append(diagnosis)
                        else:
                            # If no histologies, add the base diagnosis
                            diagnosis_list.append(base_diagnosis)

        return diagnosis_list

    def convert_diagnosis(self):
        new_diagnosis_list = []

        for patient_id, patient_info in self.fhir_data.items():
            # Get diagnosis information
            diagnosis_info = self.getDiagnosisInfo(patient_info)

            # Add all valid diagnosis entries to the list
            for diagnosis in diagnosis_info:
                if any(value for value in diagnosis.values()):
                    new_diagnosis_list.append(diagnosis)

        # Return the final list of diagnosis
        return {"diagnosis": new_diagnosis_list}