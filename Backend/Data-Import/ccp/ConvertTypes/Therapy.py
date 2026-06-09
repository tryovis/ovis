import json
from datetime import datetime
from .utils import safe_get_nested, safe_profile_check, safe_get_coding_value, safe_reference_extract, safe_get_tumor_ids_from_condition, safe_map_code_to_display, safe_get_reason_condition_ids, safe_process_substance_from_medication, safe_date_format

class Therapy:
    def __init__(self, fhir_data):
        self.fhir_data = fhir_data

    def getTherapyInfo(self, therapy_info):
        therapy_list = []
        
        # Initialize parameters dictionary with null values
        def init_therapy_params():
            return {
                "therapyID": None,
                "intention": None,
                "occurenceDate": None,
                "therapyEndDate": None,
                "protocol": None,
                "surgeryContext": None,
                "generalType": None,
                "subType": None,
                "localRState": None,
                "totalDose": None,
                "terminationReason": None,
                "tumorID": None,
                "substance": None  # Added new parameter
            }

        def get_tumor_ids(reference_id):
            """Get tumor IDs from a Condition reference"""
            conditions = safe_get_nested(therapy_info, "Resources", "Condition", default=[])
            for condition in conditions:
                if safe_get_nested(condition, "id") == reference_id:
                    return safe_get_tumor_ids_from_condition(condition)
            return []

        # Check for Systemtherapie
        medication_statements = safe_get_nested(therapy_info, "Resources", "MedicationStatement", default=[])
        for med in medication_statements:
            if safe_profile_check(med, "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-MedicationStatement-Systemtherapie"):
                    # Get condition reference
                    condition_ids = safe_get_reason_condition_ids(med, default=[])
                    for condition_id in condition_ids:
                        tumor_ids = get_tumor_ids(condition_id)
                        
                        # Create entry for each tumor ID
                        for tumor_id in tumor_ids or [None]:
                            therapy_params = init_therapy_params()
                            therapy_params["therapyID"] = safe_get_nested(med, "id")
                            therapy_params["generalType"] = "systemic"
                            therapy_params["tumorID"] = tumor_id

                            # Process extensions
                            extensions = safe_get_nested(med, "extension", default=[])
                            for ext in extensions:
                                if safe_get_nested(ext, "url") == "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Extension-SYSTIntention":
                                    intention_code = safe_get_coding_value(safe_get_nested(ext, "valueCodeableConcept"), "code", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/SYSTIntentionCS")
                                    intention_mapping = {
                                        "K": "kurativ",
                                        "P": "palliativ",
                                        "S": "sonstiges",
                                        "X": "keine Angabe"
                                    }
                                    if intention_code:
                                        therapy_params["intention"] = safe_map_code_to_display(intention_code, intention_mapping)
                                
                                elif safe_get_nested(ext, "url") == "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Extension-SystemischeTherapieProtokoll":
                                    therapy_params["protocol"] = safe_get_nested(ext, "valueCodeableConcept", "text")
                                
                                elif safe_get_nested(ext, "url") == "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Extension-StellungZurOp":
                                    surgery_code = safe_get_coding_value(safe_get_nested(ext, "valueCodeableConcept"), "code", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/SYSTStellungOPCS")
                                    if surgery_code:
                                        therapy_params["surgeryContext"] = surgery_code

                            # Process category
                            for coding in med.get("category", {}).get("coding", []):
                                if (coding.get("system") == "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/SYSTTherapieartCS"):
                                    code = coding.get("code")
                                    # Map the code to its corresponding display value
                                    subtype_mapping = {
                                        "CH": "Chemotherapie",
                                        "HO": "Hormontherapie",
                                        "IM": "Immun- und Antikörpertherapie",
                                        "KM": "Knochenmarkstransplantation",
                                        "WS": "Wait and see",
                                        "AS": "Active Surveillance",
                                        "ZS": "Zielgerichtete Substanzen",
                                        "SO": "Sonstiges",
                                        "ST": "Strahlentherapie",
                                        "OP": "Operation",
                                        "CI": "Chemo- + Immun-/Antikörpertherapie",
                                        "CZ": "Chemotherapie + zielgerichtete Substanzen",
                                        "IZ": "Immun-/Antikörpertherapie + zielgerichtete Substanzen",
                                        "SZ": "Stammzelltransplantation (inkl. Knochenmarktransplantation)",
                                        "WW": "Watchful Waiting"
                                    }
                                    therapy_params["subType"] = subtype_mapping.get(code, code)
                                    if code == "CH":
                                        period = med.get("effectivePeriod", {})
                                        therapy_params["occurenceDate"] = period.get("start") 
                                        if period.get("start"):
                                            therapy_params["occurenceDate"] += "T00:00:00.000Z"
                                        else:
                                            therapy_params["occurenceDate"] = None
                                        therapy_params["therapyEndDate"] = period.get("end") 
                                        if period.get("end"):
                                            therapy_params["therapyEndDate"] += "T00:00:00.000Z"
                                        else:
                                            therapy_params["therapyEndDate"] = None
                            
                            medication_concept = med.get("medicationCodeableConcept", {})
                            if "coding" in medication_concept:
                                # Process coding entries
                                substance_parts = []
                                for coding in medication_concept.get("coding", []):
                                    display = coding.get("display", "")
                                    code = coding.get("code", "")
                                    if display or code:
                                        substance_parts.extend([display, code])
                                therapy_params["substance"] = "§".join(filter(None, substance_parts))
                            elif "text" in medication_concept:
                                # If no coding, use text
                                therapy_params["substance"] = medication_concept.get("text")

                            therapy_list.append(therapy_params)

        # Check for Strahlentherapie and Operation
        procedures = therapy_info.get("Resources", {}).get("Procedure", [])
        for proc in procedures:
            if safe_get_nested(proc, "meta", "profile"):
                # Get condition reference
                reason_refs = proc.get("reasonReference", [])
                for ref in reason_refs:
                    condition_id = ref.get("reference", "").replace("Condition/", "")
                    tumor_ids = get_tumor_ids(condition_id)
                    
                    # Create entry for each tumor ID
                    for tumor_id in tumor_ids or [None]:
                        therapy_params = init_therapy_params()
                        therapy_params["tumorID"] = tumor_id
                        
                        # Strahlentherapie
                        if "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Procedure-Strahlentherapie" in safe_get_nested(proc, "meta", "profile", default=[]):
                            therapy_params["therapyID"] = proc.get("id")
                            therapy_params["generalType"] = "radiation"

                            # Process extensions
                            for ext in proc.get("extension", []):
                                if ext.get("url") == "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Extension-SYSTIntention":
                                    coding = ext.get("valueCodeableConcept", {}).get("coding", [])
                                    for code in coding:
                                        if code.get("system") == "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/SYSTIntentionCS":
                                            code = code.get("code")
                                            if code == "K":
                                                therapy_params["intention"] = "kurativ"
                                            elif code == "P":
                                                therapy_params["intention"] = "palliativ"
                                            elif code == "S":
                                                therapy_params["intention"] = "sonstiges"
                                            elif code == "X":
                                                therapy_params["intention"] = "keine Angabe"
                                
                                elif safe_get_nested(ext, "url") == "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Extension-StellungZurOp":
                                    surgery_code = safe_get_coding_value(safe_get_nested(ext, "valueCodeableConcept"), "code", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/SYSTStellungOPCS")
                                    if surgery_code:
                                        therapy_params["surgeryContext"] = surgery_code
                                
                                # Check for Gesamtdosis in Bestrahlung extension
                                elif ext.get("url") == "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Extension-Bestrahlung":
                                    for nested_ext in ext.get("extension", []):
                                        if nested_ext.get("url") == "Gesamtdosis":
                                            therapy_params["totalDose"] = nested_ext.get("valueQuantity", {}).get("value")

                            # Process category and dates
                            for coding in proc.get("category", {}).get("coding", []):
                                if (coding.get("system") == "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/SYSTTherapieartCS" and
                                    coding.get("code") == "ST"):
                                    period = proc.get("performedPeriod", {})
                                    therapy_params["occurenceDate"] = period.get("start") 
                                    if period.get("start"):
                                        therapy_params["occurenceDate"] += "T00:00:00.000Z"
                                    else:
                                        therapy_params["occurenceDate"] = None
                                    therapy_params["therapyEndDate"] = period.get("end") 
                                    if period.get("end"):
                                        therapy_params["therapyEndDate"] += "T00:00:00.000Z"
                                    else:
                                        therapy_params["therapyEndDate"] = None

                            # Process termination reason
                            category_coding = safe_get_nested(proc, "category", "coding", default=[])
                            if category_coding and category_coding[0].get("code") == "ST":
                                for coding in proc.get("outcome", {}).get("coding", []):
                                    if coding.get("system") == "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/EndeGrundCS":
                                        therapy_params["terminationReason"] = coding.get("code")

                            therapy_list.append(therapy_params)

                        # Operation
                        elif "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Procedure-Operation" in safe_get_nested(proc, "meta", "profile", default=[]):
                            therapy_params["therapyID"] = proc.get("id")
                            therapy_params["generalType"] = "operation"

                            # Process extensions
                            for ext in proc.get("extension", []):
                                if ext.get("url") == "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Extension-OPIntention":
                                    coding = ext.get("valueCodeableConcept", {}).get("coding", [])
                                    for code in coding:
                                        if code.get("system") == "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/OPIntentionCS":
                                            code = code.get("code")
                                            if code == "K":
                                                therapy_params["intention"] = "kurativ"
                                            elif code == "P":
                                                therapy_params["intention"] = "palliativ"
                                            elif code == "S":
                                                therapy_params["intention"] = "sonstiges"
                                            elif code == "X":
                                                therapy_params["intention"] = "keine Angabe"

                            # Process category and date
                            for coding in proc.get("category", {}).get("coding", []):
                                if (coding.get("system") == "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/SYSTTherapieartCS" and
                                    coding.get("code") == "OP"):
                                    therapy_params["occurenceDate"] = proc.get("performedDateTime")
                                    if proc.get("performedDateTime"):
                                        therapy_params["occurenceDate"] += "T00:00:00.000Z"
                                    else:
                                        therapy_params["occurenceDate"] = None

                            # Process local residual state
                            category_coding = safe_get_nested(proc, "category", "coding", default=[])
                            if category_coding and category_coding[0].get("code") == "OP":
                                for coding in proc.get("outcome", {}).get("coding", []):
                                    if coding.get("system") == "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/LokaleBeurteilungResidualstatusCS":
                                        therapy_params["localRState"] = coding.get("code")

                           # Process procedure code
                            procedure_code = proc.get("code", {})
                            if "coding" in procedure_code:
                                # Process coding entries
                                ops_parts = []
                                for coding in procedure_code.get("coding", []):
                                    display = coding.get("display", "")
                                    code = coding.get("code", "")
                                    if display:
                                        ops_parts.extend([display, code] if code else [display])
                                    elif code:
                                        ops_parts.append(code)
                                therapy_params["ops"] = "§".join(filter(None, ops_parts))
                            elif "text" in procedure_code:
                                # If no coding, use text
                                therapy_params["ops"] = procedure_code.get("text")

                            therapy_list.append(therapy_params)

        return therapy_list

    def convert_therapy(self):
        new_therapy_list = []

        for patient_id, patient_info in self.fhir_data.items():
            # Get therapy information
            therapy_info = self.getTherapyInfo(patient_info)

            # Add all valid therapy entries to the list
            for therapy in therapy_info:
                if any(value for value in therapy.values()):
                    new_therapy_list.append(therapy)

        # Return the final list of therapy
        return {"therapy": new_therapy_list}