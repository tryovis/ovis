import json
from datetime import datetime
from .utils import safe_get_nested, safe_profile_check, safe_get_coding_value, safe_get_tumor_ids_from_condition, safe_get_focus_condition_ids, safe_date_format

class Metastasis:
    def __init__(self, fhir_data):
        self.fhir_data = fhir_data

    def getMetastasisInfo(self, metastasis_info):
        observations = safe_get_nested(metastasis_info, "Resources", "Observation", default=[])
        metastasis_list = []

        def get_tumor_ids(reference_id):
            """Get tumor IDs from a Condition reference"""
            conditions = safe_get_nested(metastasis_info, "Resources", "Condition", default=[])
            for condition in conditions:
                if safe_get_nested(condition, "id") == reference_id:
                    return safe_get_tumor_ids_from_condition(condition)
            return []

        # Loop through each observation
        for observation in observations:
            if safe_profile_check(observation, "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Observation-Fernmetastasen"):
                code = safe_get_coding_value(safe_get_nested(observation, "code"), "code")
                if code == "21907-1":
                    # Get tumor IDs from focus/reasonReference
                    condition_ids = safe_get_focus_condition_ids(observation, default=[])
                    tumor_ids = []
                    for condition_id in condition_ids:
                        tumor_ids.extend(get_tumor_ids(condition_id))

                    # If no tumor IDs found, use [None] to create at least one entry
                    if not tumor_ids:
                        tumor_ids = [None]

                    metastasisDate = safe_get_nested(observation, "effectiveDateTime")
                    
                    # Extract metastasis location from bodySite
                    metastasisLocation = safe_get_coding_value(safe_get_nested(observation, "bodySite"), "code", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/FMLokalisationCS") or ""
                    
                    # Create an entry for each tumor ID if we have both date and location
                    if metastasisDate and metastasisLocation:
                        for tumor_id in tumor_ids:
                            metastasis_list.append({
                                "metastasisDate": metastasisDate,
                                "metastasisLocation": metastasisLocation,
                                "tumorID": tumor_id
                            })

        return metastasis_list

    def convert_metastasis(self):
        new_metastasis_list = []

        for patient_id, patient_info in self.fhir_data.items():
            # Get metastasis information
            metastasis_info = self.getMetastasisInfo(patient_info)

            # Add all valid metastasis entries to the list
            for metastasis in metastasis_info:
                if any(value for value in metastasis.values()):
                    new_metastasis_list.append(metastasis)

        # Return the final list of metastases
        return {"metastasis": new_metastasis_list}