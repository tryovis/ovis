import json
from datetime import datetime
from .utils import safe_get_nested, safe_profile_check, safe_get_coding_value, safe_array_access, safe_date_format, extract_tumor_id_from_observation

class TNM:
    def __init__(self, fhir_data):
        self.fhir_data = fhir_data

    def getTNMInfo(self, tnm_info):
        observations = safe_get_nested(tnm_info, "Resources", "Observation", default=[])
        tnm_list = []

        for observation in observations:
            profiles = safe_get_nested(observation, "meta", "profile", default=[])
            if profiles:
                profile = safe_array_access(profiles, 0)
                code = safe_get_coding_value(safe_get_nested(observation, "code"), "code")
                
                # Added "Version" to the initialization
                # Extract tumorID from focus field (condition reference)
                tumor_id = extract_tumor_id_from_observation(observation)
                
                tnm_data = {
                    "occurenceDate": None, "y": None, "r": None, "preT": None, "T": None,
                    "preN": None, "N": None, "preM": None, "M": None, "UICC": None,
                    "multipleT": None, "S": None, "Pn": None, "V": None, "L": None,
                    "tumorID": tumor_id, "type": None, "Version": None
                }

                # Process TNMc profile and set type to "clinical"
                if profile == "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Observation-TNMc" and code == "21908-9":
                    tnm_data["type"] = "clinical"
                    self._extract_tnm_values(observation, tnm_data, "21908-9")
                    tnm_list.append(tnm_data)
                
                # Process TNMp profile and set type to "pathological"
                elif profile == "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Observation-TNMp" and code == "21902-2":
                    tnm_data["type"] = "pathological"
                    self._extract_tnm_values(observation, tnm_data, "21902-2")
                    tnm_list.append(tnm_data)

        return tnm_list

    def _extract_tnm_values(self, observation, tnm_data, code_type):
        # Extract effectiveDateTime
        effective_date = safe_get_nested(observation, "effectiveDateTime")
        if effective_date is None:
            # TEMPORARY FALLBACK - Remove this block when proper date handling is implemented
            effective_date = "2020-11-11 11:11:11+11:11"
            # END TEMPORARY FALLBACK
        tnm_data["occurenceDate"] = safe_date_format(effective_date)
        
        # Extract UICC and Version
        value_concept_obj = safe_get_nested(observation, "valueCodeableConcept")
        uicc_code = safe_get_coding_value(value_concept_obj, "code", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/UiccstadiumCS")
        if uicc_code:
            tnm_data["UICC"] = uicc_code
            # Extract version from the same coding
            codings = safe_get_nested(value_concept_obj, "coding", default=[])
            for coding in codings:
                if safe_get_nested(coding, "system") == "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/UiccstadiumCS":
                    tnm_data["Version"] = safe_get_nested(coding, "version")
                    break

        # Process components
        components = safe_get_nested(observation, "component", default=[])
        for component in components:
            component_code = safe_get_coding_value(safe_get_nested(component, "code"), "code")
            value_concept = safe_get_nested(component, "valueCodeableConcept")
            
            # Extract values based on component codes
            self._extract_component_values(component, component_code, value_concept, tnm_data, code_type)

        # Calculate total string after all values have been extracted
        total_parts = []
        # Add r and y values if they exist
        for field in ['r', 'y']:
            if tnm_data.get(field):
                total_parts.append(str(tnm_data[field]))
        
        # Add preT, then 'T' label, then T value
        if tnm_data.get('preT'):
            total_parts.append(str(tnm_data['preT']))
        if tnm_data.get('T'):
            total_parts.append('T')
            total_parts.append(str(tnm_data['T']))

        # Add preN, then 'N' label, then N value
        if tnm_data.get('preN'):
            total_parts.append(str(tnm_data['preN']))
        if tnm_data.get('N'):
            total_parts.append('N')
            total_parts.append(str(tnm_data['N']))

        # Add preM, then 'M' label, then M value
        if tnm_data.get('preM'):
            total_parts.append(str(tnm_data['preM']))
        if tnm_data.get('M'):
            total_parts.append('M')
            total_parts.append(str(tnm_data['M']))

        tnm_data['total'] = ''.join(total_parts)
        
    def _extract_component_values(self, component, component_code, value_concept, tnm_data, code_type):
        # Map of component codes to their corresponding fields and systems
        # Common mappings for both TNMc and TNMp
        component_mappings = {
            "59479-6": ("y", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/TNMySymbolCS"),
            "21983-2": ("r", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/TNMrSymbolCS"),
            "42030-7": ("multipleT", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/TNMmSymbolCS"),
            "21924-6": ("S", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/TNMSKategorieCS"),
            "92837-4": ("Pn", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/TNMPnKategorieCS"),
            "33740-2": ("V", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/TNMVKategorieCS"),
            "33739-4": ("L", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/TNMLKategorieCS")
        }

        # TNMc specific mappings
        tnmc_mappings = {
            "21905-5": ("T", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/TNMTCS"),
            "21906-3": ("N", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/TNMNCS"),
            "21907-1": ("M", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/TNMMCS")
        }

        # TNMp specific mappings
        tnmp_mappings = {
            "21899-0": ("T", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/TNMTCS"),
            "21900-6": ("N", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/TNMNCS"),
            "21901-4": ("M", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/TNMMCS")
        }

        # Combine mappings based on code_type
        if code_type == "21908-9":  # TNMc
            component_mappings.update(tnmc_mappings)
        else:  # TNMp
            component_mappings.update(tnmp_mappings)

        # Extract value if component code matches
        if component_code in component_mappings:
            field, system = component_mappings[component_code]
            code_value = safe_get_coding_value(value_concept, "code", system)
            if code_value:
                tnm_data[field] = code_value

        # Extract prefix values
        extensions = safe_get_nested(component, "extension", default=[])
        for ext in extensions:
            if safe_get_nested(ext, "url") == "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Extension-TNMcpuPraefix":
                prefix = safe_get_coding_value(safe_get_nested(ext, "valueCodeableConcept"), "code")
                if prefix:
                    # TNMc prefix mappings
                    if code_type == "21908-9":
                        if component_code == "21905-5":
                            tnm_data["preT"] = prefix
                        elif component_code == "21906-3":
                            tnm_data["preN"] = prefix
                        elif component_code == "21907-1":
                            tnm_data["preM"] = prefix
                    # TNMp prefix mappings
                    else:
                        if component_code == "21899-0":
                            tnm_data["preT"] = prefix
                        elif component_code == "21900-6":
                            tnm_data["preN"] = prefix
                        elif component_code == "21901-4":
                            tnm_data["preM"] = prefix

    def convert_tnm(self):
        new_tnm_list = []

        for patient_id, patient_info in self.fhir_data.items():
            # Get TNM information
            tnm_info = self.getTNMInfo(patient_info)

            # Add all valid TNM entries to the list
            for tnm in tnm_info:
                if any(value for value in tnm.values()):
                    new_tnm_list.append(tnm)

        # Return the final list of TNM
        return {"tnm": new_tnm_list}
