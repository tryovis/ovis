import json
from datetime import datetime
from .utils import safe_get_nested, safe_get_coding_value, safe_profile_check, extract_tumor_id_from_observation

class SingleRadiation:
    def __init__(self, fhir_data):
        self.fhir_data = fhir_data

    def get_tumor_ids(self, reference_id, tumorboard_info):
        """Get tumor IDs from a Condition reference"""
        tumor_ids = []
        conditions = safe_get_nested(tumorboard_info, "Resources", "Condition", default=[])
        for condition in conditions:
            if safe_get_nested(condition, "id") == reference_id:
                # Get all TNM references from stage assessments
                stages = safe_get_nested(condition, "stage", default=[])
                for stage in stages:
                    assessments = safe_get_nested(stage, "assessment", default=[])
                    for assessment in assessments:
                        ref = safe_get_nested(assessment, "reference", default="")
                        if ref.startswith("Observation/tnm"):
                            tumor_ids.append(ref.replace("Observation/", ""))
                
                # NEW: Fallback to condition ID if no TNM found
                if not tumor_ids:
                    tumor_ids = [reference_id]
                    
        return tumor_ids

    def getSingleRadiationInfo(self, single_radiation_info):
        observations = single_radiation_info.get("Resources", {}).get("Procedure", [])
        single_radiation_list = []

        # Loop through each observation
        for observation in observations:
            if safe_profile_check(observation, "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Procedure-Strahlentherapie"):
                    
                    # Extract parameters from extensions
                    therapy_id = observation.get("id")
                    type_code = None
                    area_code = None
                    side_code = None
                    radio_type_code = None
                    single_dose = None

                    for ext in observation.get("extension", []):
                        for sub_ext in ext.get("extension", []):
                            url = sub_ext.get("url")
                            if url == "Applikationsart":
                                type_code = safe_get_coding_value(safe_get_nested(sub_ext, "valueCodeableConcept"), "code")
                            elif url == "Zielgebiet":
                                area_code = safe_get_coding_value(safe_get_nested(sub_ext, "valueCodeableConcept"), "code")
                            elif url == "SeiteZielgebiet":
                                side_code = safe_get_coding_value(safe_get_nested(sub_ext, "valueCodeableConcept"), "code")
                            elif url == "Strahlenart":
                                radio_type_code = safe_get_coding_value(safe_get_nested(sub_ext, "valueCodeableConcept"), "code")
                            elif url == "Einzeldosis":
                                single_dose = safe_get_nested(sub_ext, "valueQuantity", "value")


                    single_radiation_list.append({
                        "therapyID": therapy_id,
                        "type": type_code,
                        "area": area_code,
                        "side": side_code,
                        "radioType": radio_type_code,
                        "singleDose": single_dose
                    })

        return single_radiation_list

    def convert_single_radiation(self):
        new_single_radiation_list = []

        for patient_id, patient_info in self.fhir_data.items():
            # Get single radiation information
            single_radiation_info = self.getSingleRadiationInfo(patient_info)

            # Add all valid single radiation entries to the list
            for single_radiation in single_radiation_info:
                if any(value for value in single_radiation.values()):
                    new_single_radiation_list.append(single_radiation)

        # Return the final list of single radiation
        return {"singleRadiation": new_single_radiation_list}