import json
from datetime import datetime
from .utils import (
    safe_get_nested,
    safe_profile_check,
    safe_get_coding_value,
    safe_reference_extract,
    safe_get_focus_condition_ids,
    safe_get_tumor_ids_from_condition
)

class MolecularMarker:
    def __init__(self, fhir_data):
        self.fhir_data = fhir_data

    def getMolecularMarkerInfo(self, molecularmarker_info):
        observations = safe_get_nested(molecularmarker_info, "Resources", "Observation", default=[])
        molecularmarker_list = []

        def get_tumor_ids(reference_id):
            """Get tumor IDs from a Condition reference"""
            conditions = safe_get_nested(molecularmarker_info, "Resources", "Condition", default=[])
            for condition in conditions:
                if safe_get_nested(condition, "id") == reference_id:
                    return safe_get_tumor_ids_from_condition(condition)
            return [None]

        # Loop through each observation
        for observation in observations:
            if safe_profile_check(observation, "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Observation-GenetischeVariante"):
                codings = safe_get_nested(observation, "code", "coding", default=[])
                for coding in codings:
                    if safe_get_nested(coding, "code") == "69548-6":
                        # Get tumor IDs from focus/reasonReference
                        tumor_ids = []
                        condition_ids = safe_get_focus_condition_ids(observation)
                        for condition_id in condition_ids:
                            tumor_ids.extend(get_tumor_ids(condition_id))

                        # If no tumor IDs found, use [None] to create at least one entry
                        if not tumor_ids:
                            tumor_ids = [None]

                        # Create base molecularmarker entry
                        base_molecularmarker = {
                            "occurenceDate": safe_get_nested(observation, "effectiveDateTime"),
                            "status": safe_get_nested(observation, "status"),
                            "type": None,
                            "miscellaneous": None
                        }
                        
                        # Extract type and miscellaneous information from components
                        components = safe_get_nested(observation, "component", default=[])
                        for component in components:
                            component_codings = safe_get_nested(component, "code", "coding", default=[])
                            for coding in component_codings:
                                system = safe_get_nested(coding, "system")
                                if system == "http://loinc.org":
                                    base_molecularmarker["type"] = safe_get_nested(coding, "code")
                                elif system == "http://www.genenames.org":
                                    base_molecularmarker["miscellaneous"] = safe_get_nested(coding, "display")
                        
                        # Create an entry for each tumor ID if we have at least occurenceDate
                        if base_molecularmarker.get("occurenceDate"):
                            for tumor_id in tumor_ids:
                                molecularmarker = base_molecularmarker.copy()
                                molecularmarker["tumorID"] = tumor_id
                                molecularmarker_list.append(molecularmarker)

        return molecularmarker_list

    def convert_molecularmarker(self):
        new_molecularmarker_list = []

        for patient_id, patient_info in self.fhir_data.items():
            # Get molecularmarker information
            molecularmarker_info = self.getMolecularMarkerInfo(patient_info)

            # Add all valid molecularmarker entries to the list
            for molecularmarker in molecularmarker_info:
                if any(value for value in molecularmarker.values()):
                    new_molecularmarker_list.append(molecularmarker)

        # Return the final list of molecularmarker
        return {"molecularmarker": new_molecularmarker_list}