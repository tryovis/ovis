"""
Null-safe utility functions for FHIR data processing.
These utilities ensure that missing or malformed FHIR data converts to null
instead of causing KeyErrors, AttributeErrors, or TypeErrors.
"""

def safe_get_nested(obj, *keys, default=None):
    """
    Safely traverse nested dictionary/object structure.
    Returns default if any key is missing or obj is None.
    """
    if obj is None:
        return default
    
    for key in keys:
        if isinstance(obj, dict) and key in obj:
            obj = obj[key]
        else:
            return default
    return obj

def safe_get_first_coding(obj, system=None, default=None):
    """
    Safely get the first coding from a CodeableConcept.
    Returns default if coding array is empty or missing.
    """
    coding_array = safe_get_nested(obj, "coding", default=[])
    if not coding_array:
        return default
    
    first_coding = coding_array[0] if isinstance(coding_array, list) else coding_array
    
    if system:
        # Find coding with matching system
        for coding in coding_array if isinstance(coding_array, list) else [coding_array]:
            if safe_get_nested(coding, "system") == system:
                return coding
        return default
    
    return first_coding

def safe_get_coding_value(obj, key="code", system=None, default=None):
    """
    Safely extract a value (code, display, etc.) from the first matching coding.
    """
    coding = safe_get_first_coding(obj, system=system)
    if coding is None:
        return default
    return safe_get_nested(coding, key, default=default)

def safe_get_extension(extensions, url, default=None):
    """
    Safely find an extension by URL in an extensions array.
    """
    if not isinstance(extensions, list):
        return default
    
    for ext in extensions:
        if safe_get_nested(ext, "url") == url:
            return ext
    return default

def safe_get_extension_value(extensions, url, value_key="valueCodeableConcept", default=None):
    """
    Safely get a value from an extension by URL.
    """
    ext = safe_get_extension(extensions, url)
    if ext is None:
        return default
    return safe_get_nested(ext, value_key, default=default)

def safe_profile_check(resource, profile_url):
    """
    Safely check if a resource has a specific profile.
    Returns False if meta/profile structure is missing.
    """
    profiles = safe_get_nested(resource, "meta", "profile", default=[])
    if isinstance(profiles, list):
        return profile_url in profiles
    return profiles == profile_url

def safe_reference_extract(reference_str, prefix="", default=None):
    """
    Safely extract ID from a FHIR resource reference string.
    Example: "Patient/123" -> "123" (when prefix="Patient/")
    """
    if not isinstance(reference_str, str):
        return default
    
    if prefix and reference_str.startswith(prefix):
        return reference_str.replace(prefix, "")
    return reference_str if not prefix else default

def safe_date_format(date_str, add_time=True, default=None):
    """
    Safely format a date string, optionally adding time component.
    """
    if not isinstance(date_str, str) or not date_str.strip():
        return default
    
    if add_time and not date_str.endswith("Z") and "T" not in date_str:
        return date_str + "T00:00:00.000Z"
    return date_str

def safe_array_access(arr, index=0, default=None):
    """
    Safely access array element by index.
    """
    if not isinstance(arr, list) or len(arr) <= index:
        return default
    return arr[index]

def safe_find_resource(resources, resource_type, resource_id, default=None):
    """
    Safely find a resource by type and ID in a resources collection.
    """
    resource_list = safe_get_nested(resources, resource_type, default=[])
    for resource in resource_list:
        if safe_get_nested(resource, "id") == resource_id:
            return resource
    return default

def safe_get_patient_identifier(patient, identifier_type="Lokal", default=None):
    """
    Safely extract patient identifier of specific type.
    """
    identifiers = safe_get_nested(patient, "identifier", default=[])
    for identifier in identifiers:
        type_coding = safe_get_nested(identifier, "type", "coding", default=[])
        for coding in type_coding:
            if safe_get_nested(coding, "code") == identifier_type:
                return safe_get_nested(identifier, "value", default=default)
    return default

def safe_get_tumor_ids_from_condition(condition, default=None):
    """
    Safely extract tumor IDs from a condition's stage assessments.
    Falls back to condition ID if no TNM references found.
    """
    tumor_ids = []
    stages = safe_get_nested(condition, "stage", default=[])
    for stage in stages:
        assessments = safe_get_nested(stage, "assessment", default=[])
        for assessment in assessments:
            ref = safe_get_nested(assessment, "reference", default="")
            if ref.startswith("Observation/tnm"):
                tumor_ids.append(ref.replace("Observation/", ""))
    
    # NEW: Fallback to condition ID if no TNM found
    if not tumor_ids:
        condition_id = safe_get_nested(condition, "id")
        if condition_id:
            return [condition_id]
    
    return tumor_ids if tumor_ids else (default if default is not None else [None])

def safe_map_code_to_display(code, mapping_dict, default=None):
    """
    Safely map a code to its display value using a mapping dictionary.
    """
    if code is None:
        return default
    return mapping_dict.get(code, default if default is not None else code)

def safe_get_effective_date_from_clinical_impression(fhir_data, observation_id, default=None):
    """
    Safely find effective date from ClinicalImpression that references an observation.
    """
    for resource_id, resource_data in fhir_data.items():
        impressions = safe_get_nested(resource_data, "Resources", "ClinicalImpression", default=[])
        for impression in impressions:
            if safe_profile_check(impression, "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-ClinicalImpression-Verlauf"):
                findings = safe_get_nested(impression, "finding", default=[])
                for finding in findings:
                    item_ref = safe_get_nested(finding, "itemReference", "reference")
                    if item_ref == f"Observation/{observation_id}":
                        return safe_get_nested(impression, "effectiveDateTime", default=default)
    return default

def safe_get_focus_condition_ids(observation, default=None):
    """
    Safely extract condition IDs from observation focus references.
    """
    condition_ids = []
    focus_refs = safe_get_nested(observation, "focus", default=[])
    for ref in focus_refs:
        reference = safe_get_nested(ref, "reference", default="")
        condition_id = safe_reference_extract(reference, "Condition/")
        if condition_id:
            condition_ids.append(condition_id)
    
    return condition_ids if condition_ids else (default if default is not None else [])

def safe_get_reason_condition_ids(resource, default=None):
    """
    Safely extract condition IDs from reasonReference array.
    """
    condition_ids = []
    reason_refs = safe_get_nested(resource, "reasonReference", default=[])
    for ref in reason_refs:
        reference = safe_get_nested(ref, "reference", default="")
        condition_id = safe_reference_extract(reference, "Condition/")
        if condition_id:
            condition_ids.append(condition_id)
    
    return condition_ids if condition_ids else (default if default is not None else [])

def safe_process_substance_from_medication(medication_concept, default=None):
    """
    Safely process substance information from medicationCodeableConcept.
    """
    if safe_get_nested(medication_concept, "coding"):
        substance_parts = []
        codings = safe_get_nested(medication_concept, "coding", default=[])
        for coding in codings:
            display = safe_get_nested(coding, "display", default="")
            code = safe_get_nested(coding, "code", default="")
            if display or code:
                substance_parts.extend([display, code])
        return "§".join(filter(None, substance_parts)) if substance_parts else default
    
    text = safe_get_nested(medication_concept, "text")
    return text if text else default

def extract_tumor_id_from_observation(observation, fallback_id=None):
    """
    Extract tumor ID from observation focus field with fallback.
    Used by TNM, SingleRadiation, and other observation-based converters.
    
    Args:
        observation: FHIR Observation resource
        fallback_id: ID to use if no focus reference found
        
    Returns:
        Condition ID from focus field, or fallback ID
    """
    condition_ids = safe_get_focus_condition_ids(observation)
    if condition_ids:
        return condition_ids[0]
    
    # If no focus field, use fallback (could be observation ID or None)
    return fallback_id if fallback_id is not None else safe_get_nested(observation, "id")