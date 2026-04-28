import json
from datetime import datetime
from .utils import (
    safe_get_nested, 
    safe_profile_check, 
    safe_reference_extract, 
    safe_date_format,
    safe_get_focus_condition_ids,
    safe_get_tumor_ids_from_condition
)

class Histology:
    def __init__(self, fhir_data):
        self.fhir_data = fhir_data

    def get_tumor_ids(self, reference_id, histology_info):
        """Get tumor IDs from a Condition reference"""
        tumor_ids = []
        conditions = histology_info.get("Resources", {}).get("Condition", [])
        for condition in conditions:
            if condition.get("id") == reference_id:
                # Get all TNM references from stage assessments
                tumor_ids.extend(safe_get_tumor_ids_from_condition(condition))
        return tumor_ids

    def getHistologyInfo(self, histology_info):
        observations = histology_info.get("Resources", {}).get("Observation", [])
        histology_list = []

        # Loop through each observation
        for observation in observations:
            if safe_profile_check(observation, "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Observation-Histologie"):
                codings = safe_get_nested(observation, "code", "coding", default=[])
                for coding in codings:
                    if coding.get("code") == "59847-4":
                                # Get tumor IDs from focus/reasonReference
                                tumor_ids = []
                                focus_refs = safe_get_nested(observation, "focus", default=[])
                                for reason_ref in focus_refs:
                                    condition_id = safe_reference_extract(safe_get_nested(reason_ref, "reference"), "Condition/")
                                    if condition_id:
                                        tumor_ids.extend(self.get_tumor_ids(condition_id, histology_info))

                                effective_date = observation.get("effectiveDateTime")
                                if effective_date is None:
                                    # TEMPORARY FALLBACK - Remove this block when proper date handling is implemented
                                    effective_date = "1111-11-11 11:11:11+11:11"
                                    # END TEMPORARY FALLBACK

                                # Create base histology entry
                                base_histology = {
                                    "ICDO_histologyDate": safe_date_format(effective_date, add_time=True),
                                    "ICDO_histologyDescription": safe_get_nested(observation, "valueCodeableConcept", "text"),
                                    "ICDO_histologyCode": None,
                                    "grading": None
                                }

                                # Get histology code
                                histology_codings = safe_get_nested(observation, "valueCodeableConcept", "coding", default=[])
                                for histology_coding in histology_codings:
                                    if histology_coding.get("system") == "urn:oid:2.16.840.1.113883.6.43.1":
                                        base_histology["ICDO_histologyCode"] = histology_coding.get("code")

                                # Get grading
                                grading = self.getGrading(histology_info)
                                if grading:
                                    base_histology["grading"] = grading

                                # Create an entry for each tumor ID if we have required fields
                                if base_histology["ICDO_histologyDate"] and base_histology["ICDO_histologyCode"]:
                                    for tumor_id in tumor_ids:
                                        histology = base_histology.copy()
                                        histology["tumorID"] = tumor_id
                                        histology_list.append(histology)

        return histology_list
    
    def getGrading(self, histology_info):
        observations = histology_info.get("Resources", {}).get("Observation", [])
        
        metaProfile = "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Observation-Grading"
        codeCodingCode = "59542-1"
        codingSystem = "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/GradingCS"

        for observation in observations:
            if safe_profile_check(observation, metaProfile):
                codings = safe_get_nested(observation, "code", "coding", default=[])
                for coding in codings:
                    if coding.get("code") == codeCodingCode:
                                grading_codings = safe_get_nested(observation, "valueCodeableConcept", "coding", default=[])
                                for grading_coding in grading_codings:
                                    if grading_coding.get("system") == codingSystem:
                                        return grading_coding.get("code")
        return None

    def convert_histology(self):
        new_histology_list = []

        for patient_id, patient_info in self.fhir_data.items():
            # Get histology information
            histology_info = self.getHistologyInfo(patient_info)

            # Add all valid histology entries to the list
            for histology in histology_info:
                if any(value for value in histology.values() if value is not None):
                    new_histology_list.append(histology)

        return {"histology": new_histology_list}