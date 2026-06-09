import json
from datetime import datetime
from .utils import safe_get_nested, safe_profile_check, safe_get_coding_value, safe_reference_extract, safe_get_tumor_ids_from_condition, safe_get_focus_condition_ids

class Supplementary:
    def __init__(self, fhir_data):
        self.fhir_data = fhir_data

    def getSupplementaryInfo(self, supplementary_info):
        observations = supplementary_info.get("Resources", {}).get("Observation", [])
        supplementary_list = []

        def get_tumor_ids(reference_id):
            """Get tumor IDs from a Condition reference"""
            conditions = safe_get_nested(supplementary_info, "Resources", "Condition", default=[])
            for condition in conditions:
                if safe_get_nested(condition, "id") == reference_id:
                    return safe_get_tumor_ids_from_condition(condition)
            return [None]

        # Loop through each observation
        for observation in observations:
            if safe_profile_check(observation, "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Observation-WeitereKlassifikation"):
                    # Get tumor IDs from focus/reasonReference
                    tumor_ids = []
                    condition_ids = safe_get_focus_condition_ids(observation)
                    for condition_id in condition_ids:
                        tumor_ids.extend(get_tumor_ids(condition_id))

                    # If no tumor IDs found, use [None] to create at least one entry
                    if not tumor_ids:
                        tumor_ids = [None]

                    occurenceDate = safe_get_nested(observation, "effectiveDateTime")
                    if occurenceDate is None:
                        # TEMPORARY FALLBACK - Remove this block when proper date handling is implemented
                        occurenceDate = "2020-11-11 11:11:11+11:11"
                        # END TEMPORARY FALLBACK
                    
                    # Get type and status from code.coding
                    code_concept = safe_get_nested(observation, "code")
                    type_code = safe_get_coding_value(code_concept, "code")
                    status_system = safe_get_coding_value(code_concept, "system")
                    
                    if occurenceDate:
                        # Create an entry for each tumor ID
                        for tumor_id in tumor_ids:
                            supplementary_list.append({
                                "occurenceDate": occurenceDate,
                                "tumorID": tumor_id,
                                "type": type_code,
                                "status": status_system
                            })

        return supplementary_list

    def convert_supplementary(self):
        new_supplementary_list = []

        for patient_id, patient_info in self.fhir_data.items():
            # Get supplementary information
            supplementary_info = self.getSupplementaryInfo(patient_info)

            # Add all valid supplementary entries to the list
            for supplementary in supplementary_info:
                if any(value for value in supplementary.values()):
                    new_supplementary_list.append(supplementary)

        # Return the final list of supplementary
        return {"supplementary": new_supplementary_list}