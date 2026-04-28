import json
from datetime import datetime
from .utils import safe_get_nested, safe_profile_check, safe_get_coding_value, safe_reference_extract, safe_get_tumor_ids_from_condition, safe_map_code_to_display, safe_get_focus_condition_ids, safe_get_effective_date_from_clinical_impression

class Progress:
    def __init__(self, fhir_data):
        print("Initializing Progress converter...")
        self.fhir_data = fhir_data
        self.patient_observations = {}  # Store observations by patient ID

    def organize_observations(self):
        print("Starting organize_observations...")
        count = 0
        # First, collect all observations and organize them by patient reference
        for resource_id, resource_data in self.fhir_data.items():
            observations = safe_get_nested(resource_data, "Resources", "Observation", default=[])
            if observations:
                print(f"Processing {len(observations)} observations for resource {resource_id}")
                
                for observation in observations:
                    patient_ref = safe_get_nested(observation, "subject", "reference")
                    if patient_ref and patient_ref.startswith("Patient/"):
                        patient_id = safe_reference_extract(patient_ref, "Patient/")
                        if patient_id:
                            if patient_id not in self.patient_observations:
                                self.patient_observations[patient_id] = []
                            self.patient_observations[patient_id].append(observation)
                            count += 1
                            
                            if count % 1000 == 0:  # Progress update every 1000 observations
                                print(f"Processed {count} observations so far...")
        
        print(f"Finished organizing {count} observations for {len(self.patient_observations)} patients")

    def getProgressInfo(self, patient_id):
        print(f"\nProcessing progress info for patient {patient_id}")
        if patient_id not in self.patient_observations:
            print(f"No observations found for patient {patient_id}")
            return []
            
        observations = self.patient_observations[patient_id]
        print(f"Found {len(observations)} observations for patient {patient_id}")
        progress_by_date = {}

        def get_tumor_ids(reference_id):
            """Get tumor IDs from a Condition reference"""
            print(f"Getting tumor IDs for reference {reference_id}")
            for resource_id, resource_data in self.fhir_data.items():
                conditions = safe_get_nested(resource_data, "Resources", "Condition", default=[])
                for condition in conditions:
                    if safe_get_nested(condition, "id") == reference_id:
                        tumor_ids = safe_get_tumor_ids_from_condition(condition)
                        print(f"Found {len(tumor_ids)} tumor IDs")
                        return tumor_ids
            print("Found 0 tumor IDs")
            return []

        # First, find all GesamtbeurteilungTumorstatus observations
        print("Processing GesamtbeurteilungTumorstatus observations...")
        gesamt_count = 0
        for observation in observations:
            if safe_profile_check(observation, "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Observation-GesamtbeurteilungTumorstatus"):
                
                gesamt_count += 1
                print(f"Processing GesamtbeurteilungTumorstatus observation {gesamt_count}")
                
                # Get tumor IDs from reasonReference
                condition_ids = safe_get_focus_condition_ids(observation, default=[])
                tumor_ids = []
                for condition_id in condition_ids:
                    tumor_ids.extend(get_tumor_ids(condition_id))

                # If no tumor IDs found, create one entry with None
                if not tumor_ids:
                    tumor_ids = [None]

                observation_id = safe_get_nested(observation, "id")
                effective_date = None

                print("Searching for observation reference in ClinicalImpressions...")
                # Search for this observation reference in ClinicalImpressions
                effective_date = safe_get_effective_date_from_clinical_impression(self.fhir_data, observation_id)

                # If no date found in ClinicalImpressions, use the observation's date
                if not effective_date:
                    effective_date = safe_get_nested(observation, "effectiveDateTime")

                if effective_date:
                    print(f"Processing entries for date {effective_date}")
                    # Create an entry for each tumor ID
                    for tumor_id in tumor_ids:
                        progress_entry = {
                            "occurenceDate": effective_date,
                            "overallAssessment": None,
                            "metastasisState": None,
                            "tumorState": None,
                            "lymphNodeState": None,
                            "tumorID": tumor_id
                        }
                        
                        # Get the overallAssessment value
                        code = safe_get_coding_value(safe_get_nested(observation, "code"), "code")
                        if code == "21976-6":
                            value_concept = safe_get_nested(observation, "valueCodeableConcept")
                            assessment_code = safe_get_coding_value(value_concept, "code", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/GesamtbeurteilungTumorstatusCS")
                            if assessment_code:
                                progress_entry["overallAssessment"] = assessment_code
                                assessment_mapping = {
                                    "V": "Vollremission (complete remission, CR)",
                                    "T": "Teilremission / mindestens 50% Rückgang des Tumors (partial remission, PR)",
                                    "K": "Keine Änderung (no change, NC) = stable disease",
                                    "P": "Progression",
                                    "D": "Divergentes Geschehen",
                                    "B": "Klinische Besserung des Zustandes, Kriterien für Teilremission jedoch nicht erfüllt (minimal response, MR)",
                                    "R": "Vollremission mit residualen Auffälligkeiten (CRr)",
                                    "U": "Beurteilung unmöglich",
                                    "X": "Fehlende Angabe"
                                }
                                progress_entry["overallAssessment"] = safe_map_code_to_display(assessment_code, assessment_mapping)

                        progress_by_date[f"{effective_date}_{tumor_id}"] = progress_entry

        print(f"Processed {gesamt_count} GesamtbeurteilungTumorstatus observations")

        # Now process other observation types for these dates
        print("Processing other observation types...")
        other_obs_count = 0
        for observation in observations:
            if safe_get_nested(observation, "meta", "profile"):
                other_obs_count += 1
                if other_obs_count % 100 == 0:
                    print(f"Processed {other_obs_count} other observations...")
                    
                profiles = safe_get_nested(observation, "meta", "profile", default=[])
                meta_profile = profiles[0] if profiles else ""
                effective_date = safe_get_nested(observation, "effectiveDateTime")
                
                # Get tumor IDs for this observation
                condition_ids = safe_get_focus_condition_ids(observation, default=[])
                tumor_ids = []
                for condition_id in condition_ids:
                    tumor_ids.extend(get_tumor_ids(condition_id))

                if not tumor_ids:
                    tumor_ids = [None]

                for tumor_id in tumor_ids:
                    date_key = f"{effective_date}_{tumor_id}"
                    if not effective_date or date_key not in progress_by_date:
                        continue

                    # Check for different observation types
                    if "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Observation-TumorstatusFernmetastasen" in meta_profile:
                        code = safe_get_coding_value(safe_get_nested(observation, "code"), "code")
                        if code == "LA4226-2":
                            metastasis_code = safe_get_coding_value(safe_get_nested(observation, "valueCodeableConcept"), "code", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/VerlaufTumorstatusFernmetastasenCS")
                            if metastasis_code:
                                progress_by_date[date_key]["metastasisState"] = metastasis_code
                                metastasis_mapping = {
                                    "K": "Keine Fernmetastasen nachweisbar",
                                    "M": "Verbliebene Fernmetastase(n)",
                                    "R": "Neu aufgetretene Fernmetastase(n) bzw. Metastasenrezidiv",
                                    "T": "Fernmetastasen Residuen",
                                    "P": "Fernmetastasen Progress",
                                    "N": "Fernmetastasen No Change",
                                    "F": "Fraglicher Befund",
                                    "U": "Unbekannt",
                                    "X": "Fehlende Angabe"
                                }
                                progress_by_date[date_key]["metastasisState"] = safe_map_code_to_display(metastasis_code, metastasis_mapping)

                    elif "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Observation-LokalerTumorstatus" in meta_profile:
                        code = safe_get_coding_value(safe_get_nested(observation, "code"), "code")
                        if code == "LA4583-6":
                            tumor_code = safe_get_coding_value(safe_get_nested(observation, "valueCodeableConcept"), "code", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/VerlaufLokalerTumorstatusCS")
                            if tumor_code:
                                progress_by_date[date_key]["tumorState"] = tumor_code
                                tumor_mapping = {
                                    "K": "Kein Tumor nachweisbar",
                                    "T": "Tumorreste (Residualtumor)",
                                    "P": "Tumorreste Residualtumor Progress",
                                    "N": "Tumorreste Residualtumor No Change",
                                    "R": "Lokalrezidiv",
                                    "F": "Fraglicher Befund",
                                    "U": "unbekannt",
                                    "X": "Fehlende Angabe"
                                }
                                progress_by_date[date_key]["tumorState"] = safe_map_code_to_display(tumor_code, tumor_mapping)

                    elif "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Observation-TumorstatusLymphknoten" in meta_profile:
                        code = safe_get_coding_value(safe_get_nested(observation, "code"), "code")
                        if code == "LA4370-8":
                            lymph_code = safe_get_coding_value(safe_get_nested(observation, "valueCodeableConcept"), "code", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/VerlaufTumorstatusLymphknotenCS")
                            if lymph_code:
                                progress_by_date[date_key]["lymphNodeState"] = lymph_code
                                lymph_mapping = {
                                    "K": "Kein Lymphknotenbefall nachweisbar",
                                    "R": "Neu aufgetretenes Lymphknotenrezidiv",
                                    "T": "bekannter Lymphknotenbefall Residuen",
                                    "P": "bekannter Lymphknotenbefall Progress",
                                    "N": "bekannter Lymphknotenbefall No Change",
                                    "F": "Fraglicher Befund",
                                    "U": "unbekannt",
                                    "X": "Fehlende Angabe"
                                }
                                progress_by_date[date_key]["lymphNodeState"] = safe_map_code_to_display(lymph_code, lymph_mapping)

        print(f"Finished processing {other_obs_count} other observations")
        print(f"Returning {len(progress_by_date)} progress entries")
        return list(progress_by_date.values())

    def convert_progress(self):
        print("\nStarting progress conversion...")
        new_progress_list = []
        self.organize_observations()
        
        patient_count = 0
        for resource_id, resource_data in self.fhir_data.items():
            patient = safe_get_nested(resource_data, "Patient")
            if patient:
                patient_count += 1
                patient_id = safe_get_nested(patient, "id")
                print(f"\nProcessing patient {patient_count}: {patient_id}")
                
                if patient_id:
                    progress_info = self.getProgressInfo(patient_id)
                    for progress in progress_info:
                        if any(value for value in progress.values() if value is not None):
                            new_progress_list.append(progress)

        print(f"\nFinished converting progress. Found {len(new_progress_list)} total progress entries")
        return {"progress": new_progress_list}