import httpx
import logging
import asyncio
from typing import List, Dict, Union
import json
from datetime import datetime
import os
import shutil
def transform_datetime(iso_datetime_str: str) -> str:
    """
    Transform ISO datetime string to desired format
    
    Args:
        iso_datetime_str: Datetime string in ISO format (e.g. "2025-01-22T09:16:20.594Z")
        
    Returns:
        Formatted datetime string (e.g. "2025-01-22 09:16:20.594000+00:00")
    """
    try:
        # Parse the ISO datetime string
        dt = datetime.fromisoformat(iso_datetime_str.replace('Z', '+00:00'))
        # Format to desired string format with microseconds and timezone
        return dt.strftime('%Y-%m-%d %H:%M:%S.%f%z')
    except Exception as e:
        logging.error(f"Error transforming datetime {iso_datetime_str}: {str(e)}")
        return iso_datetime_str

def transform_lastUpdated_recursive(data: Union[Dict, List]) -> None:
    """
    Recursively transform all "lastUpdated" fields in the data structure
    
    Args:
        data: Dictionary or list to transform
    """
    if isinstance(data, dict):
        for key, value in data.items():
            if key == "lastUpdated" and isinstance(value, str):
                data[key] = transform_datetime(value)
            elif isinstance(value, (dict, list)):
                transform_lastUpdated_recursive(value)
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, (dict, list)):
                transform_lastUpdated_recursive(item)

async def fetch_resources_with_continuation(client, base_url: str, resource_type: str, chunk_size: int = 5000, icd10_filter: str = '') -> List[dict]:
    """
    Fetch FHIR resources using continuation tokens
    
    Args:
        client: httpx.AsyncClient instance
        base_url: Base URL of the FHIR server
        resource_type: Type of FHIR resource to fetch (e.g., "Patient", "Observation", etc.)
        chunk_size: Number of records per request
        icd10_filter: Optional ICD-10 code filter for Condition resources (semicolon-separated)
        
    Returns:
        List of resources
    """
    all_resources = []
    seen_ids = set()
    
    # Initial URL
    url = f"{base_url}/{resource_type}?_count={chunk_size}"
    
    # RADICAL FIX: Don't apply ICD-10 filter at the server level at all
    # Instead, we'll retrieve ALL conditions and filter client-side
    # This approach is less efficient but more reliable since server-side filtering is inconsistent
    if resource_type == "Condition" and icd10_filter:
        logging.info(f"ICD-10 filter specified ({icd10_filter}), but we'll apply it client-side only")
        logging.info(f"Retrieving ALL Condition resources without server-side filtering")
    
    while url:
        try:
            # Ensure the URL maintains the correct structure
            if 'ccp-localdatamanagement' not in url and 'ccp-localdatamanagement' in base_url:
                url = url.replace('/fhir/', '/ccp-localdatamanagement/fhir/')
            
            logging.info(f"Fetching from URL: {url}")
            response = await client.get(url)
            response.raise_for_status()
            bundle = response.json()
            
            if not bundle.get('entry'):
                logging.warning(f"No {resource_type} entries found in response")
                break
            
            # Process entries
            new_count = 0
            for entry in bundle['entry']:
                resource = entry.get('resource', {})
                resource_id = resource.get('id')
                
                if resource_id not in seen_ids:
                    seen_ids.add(resource_id)
                    all_resources.append(resource)
                    new_count += 1
            
            logging.info(f"Added {new_count} new {resource_type}s. Total unique {resource_type}s so far: {len(seen_ids)}")
            
            # Get the URL for the next page and ensure correct path
            next_link = None
            for link in bundle.get('link', []):
                if link.get('relation') == 'next':
                    next_url = link.get('url')
                    if next_url and 'ccp-localdatamanagement' not in next_url and 'ccp-localdatamanagement' in base_url:
                        next_url = next_url.replace('/fhir/', '/ccp-localdatamanagement/fhir/')
                    next_link = next_url
                    break
            
            if not next_link:
                logging.info(f"No more {resource_type} pages to fetch")
                break
                
            url = next_link
            
        except Exception as e:
            logging.error(f"Error fetching {resource_type} data: {str(e)}")
            # Wait a bit before retrying
            await asyncio.sleep(1)
            continue
    
    logging.info(f"Completed fetching. Total unique {resource_type}s: {len(seen_ids)}")
    return all_resources

async def collect_patient_resources(client, base_url: str, patients: List[dict], icd10_filter: str = '') -> Dict[str, Dict[str, Union[dict, Dict[str, List[dict]]]]]:
    """
    Collect all resources for each patient with the specified structure
    
    Args:
        client: httpx.AsyncClient instance
        base_url: Base URL of the FHIR server
        patients: List of patient resources
        icd10_filter: Optional ICD-10 code filter for Condition resources (semicolon-separated)
        
    Returns:
        Dict with structure {patient_id: {"Patient": patient_data, "Resources": {resource_type: [resources]}}}
    """
    # List of all FHIR resource types to check
    # Only fetch the resource types that are actually used by the converters
    resource_types = [
        "Condition",           # Used by Diagnosis.py
        "Observation",         # Used by Patient.py (vital status), TNM.py, Histology.py
        "Procedure",           # Used by SYST.py, OP.py, Radiation.py
        "MedicationStatement", # Used by SYST.py
        "Specimen",            # Used by Histology.py
        "ClinicalImpression",  # Used for finding effective dates
        "ServiceRequest"       # May be needed for certain references
    ]
    
    # Initialize result structure
    result = {}
    patient_ids = [p.get("id") for p in patients]
    
    # Initialize structure for each patient
    for patient in patients:
        patient_id = patient.get("id")
        if patient_id:
            result[patient_id] = {
                "Patient": patient,
                "Resources": {rt: [] for rt in resource_types}
            }
    
    # Parse ICD-10 filter codes (if provided)
    icd10_codes = [code.strip() for code in icd10_filter.split(';')] if icd10_filter else []
    # Set to track patient IDs matching the ICD-10 filter
    patients_with_matching_icd10 = set()
    
    # Fetch and organize resources
    for resource_type in resource_types:
        logging.info(f"Fetching {resource_type} resources...")
        try:
            # We need to pass the ICD10 filter to the Condition resources fetch,
            # but not to other resource types
            current_icd10_filter = icd10_filter if resource_type == "Condition" else ""
            
            # For Condition resources, we need to ensure we capture all possible matches
            # Even if the server-side filter misses some due to system URI differences
            if resource_type == "Condition" and icd10_filter:
                # Log the query parameters being used
                logging.info(f"Using ICD10 filter parameters for server query: {icd10_filter}")
                
            resources = await fetch_resources_with_continuation(
                client, base_url, resource_type, 
                icd10_filter=current_icd10_filter
            )
            
            # Process each resource
            for resource in resources:
                subject_ref = resource.get("subject", {}).get("reference", "")
                if subject_ref.startswith("Patient/"):
                    patient_id = subject_ref.split("/")[1]
                    
                    # For Condition resources with ICD-10 filter, track matching patients
                    if resource_type == "Condition" and icd10_codes:
                        # Check if this condition has any of the specified ICD-10 codes
                        # Check against valid system URIs as requested
                        
                        # Define valid system URIs for ICD-10 codes
                        valid_systems = [
                            "http://fhir.de/CodeSystem/bfarm/icd-10-gm",  # From the XML data examples
                            "http://fhir.de/CodeSystem/dimdi/icd-10-gm"   # Alternative system that might be used
                        ]
                        
                        for coding in resource.get("code", {}).get("coding", []):
                            code = coding.get("code", "")
                            system = coding.get("system", "")
                            
                            # Log every condition code we examine for more visibility
                            logging.info(f"Examining Condition {resource.get('id')} for patient {patient_id}: code={code}, system={system}")
                            
                            # Only continue if the system is in our valid list
                            if system in valid_systems:
                                # Matching patterns as requested:
                                # 1. Exact match (C34 matches C34)
                                # 2. Hierarchical matching (C34 matches C34.1, C34.2, etc)
                                for filter_code in icd10_codes:
                                    # Check if code matches filter (exactly or as subcategory)
                                    if code == filter_code or code.startswith(filter_code + "."):
                                        patients_with_matching_icd10.add(patient_id)
                                        logging.info(f"MATCH FOUND: Patient {patient_id} has ICD-10 code {code} matching filter {filter_code} (system: {system})")
                                        break
                            else:
                                logging.debug(f"Skipping condition with non-matching system URI: {system}")
                    
                    # Add the resource to the patient's data
                    if patient_id in result:
                        result[patient_id]["Resources"][resource_type].append(resource)
            
            logging.info(f"Processed {resource_type} resources")
        except Exception as e:
            logging.error(f"Error processing {resource_type}: {str(e)}")
            continue
    
    # If ICD-10 filter is active, filter the result to only include matching patients
    if icd10_codes:
        logging.info(f"Filtering patients based on ICD-10 codes: {icd10_filter}")
        logging.info(f"Found {len(patients_with_matching_icd10)} patients with matching ICD-10 codes out of {len(result)} total patients")
        
        # List all matching patient IDs for debugging
        logging.info(f"Matching patient IDs: {sorted(list(patients_with_matching_icd10))}")
        
        # Create a new result dictionary with only matching patients
        filtered_result = {}
        for patient_id, patient_data in result.items():
            if patient_id in patients_with_matching_icd10:
                filtered_result[patient_id] = patient_data
                
                # Extra logging about matching patients
                condition_count = len(patient_data["Resources"].get("Condition", []))
                logging.info(f"Including patient {patient_id} with {condition_count} conditions in final result")
        
        return filtered_result
    
    return result

async def fetch_fhir_data(url: str, username: str, password: str, verify_ssl: bool = False, output_dir: str = None, icd10_filter: str = '') -> Dict[str, Dict[str, Union[dict, Dict[str, List[dict]]]]]:
    """Fetch all FHIR data organized by patient with the specified structure"""
    auth = httpx.BasicAuth(username=username, password=password)
    headers = {
        "Accept": "application/fhir+json",
        "Content-Type": "application/fhir+json",
        "Prefer": "handling=lenient"
    }
    
    base_url = url
    
    # Log ICD-10 filter information
    if icd10_filter:
        icd10_codes = [code.strip() for code in icd10_filter.split(';')]
        logging.info(f"Using ICD-10 filter with {len(icd10_codes)} codes: {icd10_filter}")
        logging.info("Filter will include patients with any diagnosis matching these ICD-10 code families")
    else:
        logging.info("No ICD-10 filter applied - including all patients")
    
    async with httpx.AsyncClient(
        verify=verify_ssl, 
        auth=auth, 
        headers=headers,
        timeout=60.0,
        limits=httpx.Limits(max_keepalive_connections=5, max_connections=10)
    ) as client:
        # First, fetch all patients
        logging.info("Fetching all patients...")
        patients = await fetch_resources_with_continuation(
            client=client,
            base_url=base_url,
            resource_type="Patient",
            chunk_size=5000
        )
        logging.info(f"Retrieved {len(patients)} patients from FHIR server")
        
        # Collect resources for each patient with ICD-10 filtering
        patient_resources = await collect_patient_resources(client, base_url, patients, icd10_filter=icd10_filter)
        logging.info(f"After ICD-10 filtering, {len(patient_resources)} patients remain in the dataset")
        
        # Transform all lastUpdated fields before saving
        transform_lastUpdated_recursive(patient_resources)
        
        # Save the organized data to the mounted volume
        output_filename = os.path.join(output_dir, 'patient_organized_resources_self_result.json')
        with open(output_filename, 'w') as f:
            json.dump(patient_resources, f, indent=2, default=str)
        
        return patient_resources
    

async def check_fhir_server(url: str, username: str, password: str, verify_ssl: bool = False) -> bool:
    """
    Check if the FHIR server is reachable by attempting to fetch a single Patient resource
    
    Args:
        url: Base URL of the FHIR server
        username: Username for authentication
        password: Password for authentication
        verify_ssl: Whether to verify SSL certificates
        
    Returns:
        bool: True if server is reachable, False otherwise
    """
    auth = httpx.BasicAuth(username=username, password=password)
    headers = {
        "Accept": "application/fhir+json",
        "Content-Type": "application/fhir+json",
        "Prefer": "handling=lenient"
    }
    
    try:
        async with httpx.AsyncClient(
            verify=verify_ssl, 
            auth=auth, 
            headers=headers,
            timeout=10.0
        ) as client:
            # Try to fetch just one Patient to test connection
            logging.info(f"Testing connection to FHIR server at {url}...")
            test_url = f"{url}/Patient?_count=1"
            
            # Ensure the URL maintains the correct structure
            if 'ccp-localdatamanagement' not in test_url and 'ccp-localdatamanagement' in url:
                test_url = test_url.replace('/fhir/', '/ccp-localdatamanagement/fhir/')
            
            response = await client.get(test_url)
            response.raise_for_status()
            
            # Check if we got a valid FHIR response
            bundle = response.json()
            if "resourceType" in bundle and bundle["resourceType"] == "Bundle":
                return True
            else:
                logging.warning("Server response does not contain a valid FHIR Bundle")
                return False
    except Exception as e:
        logging.error(f"Error connecting to FHIR server: {str(e)}")
        return False

def copy_placeholder_omock(output_dir: str, output_file: str) -> None:
    """
    Copy placeholder omock.json file to the output directory when the FHIR server is unreachable
    
    Args:
        output_dir: Directory to copy the file to
        output_file: Path for the output file
    """
    try:
        # Look for the placeholder file in these locations
        placeholder_paths = [
            '/app/placeholder_omock/omock.json',  # Docker container path
            os.path.join(os.path.dirname(os.path.abspath(__file__)), 'placeholder_omock/omock.json'),  # Same directory
            os.path.join(os.path.dirname(os.path.abspath(__file__)), '../placeholder_omock/omock.json'),  # Parent directory
        ]
        
        # Try each possible location
        for placeholder_path in placeholder_paths:
            if os.path.exists(placeholder_path):
                # Make sure output directory exists
                os.makedirs(output_dir, exist_ok=True)
                
                # Copy the placeholder file
                shutil.copy2(placeholder_path, output_file)
                logging.info(f"Copied placeholder omock.json from {placeholder_path} to {output_file}")
                return
        
        # If placeholder file wasn't found, create a minimal empty one
        logging.warning("Placeholder omock.json not found, creating empty file")
        with open(output_file, 'w') as f:
            f.write('{"patients": []}')
        logging.info(f"Created empty omock.json at {output_file}")
    except Exception as e:
        logging.error(f"Error copying placeholder file: {str(e)}")
        # Create minimal file even if copy failed
        with open(output_file, 'w') as f:
            f.write('{"patients": []}')