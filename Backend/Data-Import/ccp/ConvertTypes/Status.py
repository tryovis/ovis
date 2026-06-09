import json
from datetime import datetime
from .utils import safe_get_nested, safe_profile_check, safe_get_coding_value, safe_reference_extract, safe_get_tumor_ids_from_condition, safe_map_code_to_display, safe_get_focus_condition_ids, safe_date_format

class Status:
    def __init__(self, fhir_data):
        self.fhir_data = fhir_data

    def getStatusInfo(self, status_info):
        observations = status_info.get("Resources", {}).get("Observation", [])
        status_list = []

        def get_tumor_ids(reference_id):
            """Get tumor IDs from a Condition reference"""
            conditions = safe_get_nested(status_info, "Resources", "Condition", default=[])
            for condition in conditions:
                if safe_get_nested(condition, "id") == reference_id:
                    return safe_get_tumor_ids_from_condition(condition)
            return []

        # Loop through each observation
        for observation in observations:
            if safe_profile_check(observation, "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Observation-Ecog"):
                    # Get tumor IDs from focus/reasonReference
                    condition_ids = safe_get_focus_condition_ids(observation, default=[])
                    tumor_ids = []
                    for condition_id in condition_ids:
                        tumor_ids.extend(get_tumor_ids(condition_id))

                    # If no tumor IDs found, use [None] to create at least one entry
                    if not tumor_ids:
                        tumor_ids = [None]

                    occurenceDate = safe_get_nested(observation, "effectiveDateTime")
                    
                    if occurenceDate:
                        # Create an entry for each tumor ID
                        for tumor_id in tumor_ids:
                            code = safe_get_coding_value(safe_get_nested(observation, "valueCodeableConcept"), "code")
                            # Map ECOG codes to descriptions
                            ecog_mapping = {
                                "0": "Normale, uneingeschränkte Aktivität wie vor der Erkrankung (90 - 100 % nach Karnofsky)",
                                "1": "Einschränkung bei körperlicher Anstrengung, aber gehfähig; leichte körperliche Arbeit bzw. Arbeit im Sitzen (z.B. leichte Hausarbeit oder Büroarbeit) möglich (70 - 80 % nach Karnofsky)",
                                "2": "Gehfähig, Selbstversorgung möglich, aber nicht arbeitsfähig; kann mehr als 50% der Wachzeit aufstehen (50 - 60 % nach Karnofsky)",
                                "3": "Nur begrenzte Selbstversorgung möglich; ist 50% oder mehr der Wachzeit an Bett oder Stuhl gebunden (30 - 40 % nach Karnofsky)",
                                "4": "Völlig pflegebedürftig, keinerlei Selbstversorgung möglich; völlig an Bett oder Stuhl gebunden (10 - 20% nach Karnofsky)",
                                "U": "Unbekannt"
                            }
                            status_list.append({
                                "occurenceDate": safe_date_format(occurenceDate, add_time=True, default=None),
                                "tumorID": tumor_id,
                                "status": "ECOG",
                                "type": safe_map_code_to_display(code, ecog_mapping)
                            })

        return status_list

    def convert_status(self):
        new_status_list = []

        if not isinstance(self.fhir_data, dict):
            return {"status": new_status_list}

        for patient_id, patient_info in self.fhir_data.items():
            # Get status information
            status_info = self.getStatusInfo(patient_info)

            # Add all valid status entries to the list
            for status in status_info:
                if any(value for value in status.values()):
                    new_status_list.append(status)

        # Return the final list of status
        return {"status": new_status_list}