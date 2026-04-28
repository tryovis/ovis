import json
from datetime import datetime
from .utils import (
    safe_get_nested,
    safe_profile_check,
    safe_reference_extract,
    safe_get_tumor_ids_from_condition
)

class TumorBoard:
    def __init__(self, fhir_data):
        self.fhir_data = fhir_data

    def get_tumor_ids(self, reference_id, tumorboard_info):
        """Get tumor IDs from a Condition reference"""
        conditions = safe_get_nested(tumorboard_info, "Resources", "Condition", default=[])
        for condition in conditions:
            if safe_get_nested(condition, "id") == reference_id:
                # Use safe utility to get tumor IDs from condition
                return safe_get_tumor_ids_from_condition(condition, default=[])
        return []

    def getTumorBoardInfo(self, tumorboard_info):
        observations = safe_get_nested(tumorboard_info, "Resources", "CarePlan", default=[])
        tumorboard_list = []

        # Loop through each observation
        for observation in observations:
            if safe_profile_check(observation, "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-CarePlan-Therapieempfehlung"):
                    # Get tumor IDs from addresses.reference
                    tumor_ids = []
                    addresses = safe_get_nested(observation, "addresses", default=[])
                    for address in addresses:
                        reference = safe_get_nested(address, "reference", default="")
                        condition_id = safe_reference_extract(reference, "Condition/")
                        if condition_id:
                            tumor_ids.extend(self.get_tumor_ids(condition_id, tumorboard_info))

                    # If no tumor IDs found, use [None] to create at least one entry
                    if not tumor_ids:
                        tumor_ids = [None]

                    occurenceDate = safe_get_nested(observation, "created")
                    
                    if occurenceDate:
                        # Create an entry for each tumor ID
                        for tumor_id in tumor_ids:
                            tumorboard_list.append({
                                "occurenceDate": occurenceDate,
                                "tumorID": tumor_id
                            })

        return tumorboard_list

    def convert_tumorboard(self):
        new_tumorboard_list = []

        for patient_id, patient_info in self.fhir_data.items():
            # Get tumorboard information
            tumorboard_info = self.getTumorBoardInfo(patient_info)

            # Add all valid tumorboard entries to the list
            for tumorboard in tumorboard_info:
                if any(value for value in tumorboard.values()):
                    new_tumorboard_list.append(tumorboard)

        # Return the final list of tumorboard
        return {"tumorboard": new_tumorboard_list}