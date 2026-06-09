import json
import logging
from datetime import datetime
from .utils import safe_get_nested, safe_profile_check, safe_get_coding_value, safe_get_patient_identifier, safe_date_format, safe_reference_extract

class Patient:
    def __init__(self, fhir_data):
        self.fhir_data = fhir_data
        self.patient_observations = {}  # Store observations by patient ID

    def convertToPatID(self, patient_info, fallback_id=None):
        # Try "Lokal" first (for Patient-Patient profile)
        pat_id = safe_get_patient_identifier(patient_info, "Lokal")
        if pat_id:
            return pat_id
        
        # Fall back to "Global" (for Patient-Pseudonym profile)
        pat_id = safe_get_patient_identifier(patient_info, "Global")
        if pat_id:
            return pat_id
            
        # If neither found, use resource ID as fallback
        return fallback_id

    def getArea(self):
        return None

    def getPostalCode(self):
        return None

    def getCountryCode(self):
        return None

    def getVitalInfo(self, patient_id):
        if patient_id not in self.patient_observations:
            return None
            
        observations = self.patient_observations[patient_id]
        vital_dates = []
        vitalDate = ""
        vitalState = ""

        for observation in observations:
            if safe_profile_check(observation, "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Observation-Vitalstatus"):
                
                code = safe_get_coding_value(safe_get_nested(observation, "code"), "code")
                if code == "75186-7":
                    effective_date = safe_get_nested(observation, "effectiveDateTime")
                    if effective_date:
                        vital_dates.append(effective_date)
                    
                    vitalState = safe_get_coding_value(safe_get_nested(observation, "valueCodeableConcept"), "code", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/VitalstatusCS")
                    if vitalState:

                        if vitalState == "verstorben":
                            # Look for death cause observation
                            for death_obs in observations:
                                if safe_profile_check(death_obs, "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Observation-TodUrsache"):
                                    cause_code = safe_get_coding_value(safe_get_nested(death_obs, "valueCodeableConcept"), "code", "http://dktk.dkfz.de/fhir/onco/core/CodeSystem/JNUCS")
                                    if cause_code == "J":
                                        vitalState = "Verstorben (Tumorbedingt: Ja)"
                                    elif cause_code == "N":
                                        vitalState = "Verstorben (Tumorbedingt: Nein)"
                                    elif cause_code == "U":
                                        vitalState = "Verstorben (Tumorbedingt: Unbekannt)"

        if vital_dates:
            parsed_dates = []
            for date_str in vital_dates:
                # Try multiple datetime formats
                parsed_date = None
                # First try formats with timezone
                for fmt in ["%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S.%f%z"]:
                    try:
                        parsed_date = datetime.strptime(date_str.replace("+01:00", "+0100").replace("+02:00", "+0200"), fmt)
                        break
                    except ValueError:
                        continue
                
                # Then try formats without timezone
                if parsed_date is None:
                    for fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"]:
                        try:
                            parsed_date = datetime.strptime(date_str, fmt)
                            # Make it timezone-aware by assuming UTC
                            from datetime import timezone
                            parsed_date = parsed_date.replace(tzinfo=timezone.utc)
                            break
                        except ValueError:
                            continue
                
                if parsed_date:
                    parsed_dates.append(parsed_date)
            
            if parsed_dates:
                latest_date = max(parsed_dates)
                vitalDate = latest_date.strftime("%Y-%m-%d") + "T00:00:00.000Z"
            
        if vitalDate and vitalState:
            return vitalDate, vitalState
        
        return None

    def getBirthDate(self, patient_info):
        birth_date = safe_get_nested(patient_info, "birthDate")
        return safe_date_format(birth_date)

    def getGender(self, patient_info):
        gender = safe_get_nested(patient_info, "gender")
        gender_mapping = {"male": "m", "female": "f"}
        return gender_mapping.get(gender)

    def getFirstName(self):
        return None

    def getLastName(self):
        return None

    def _parse_fhir_datetime(self, datetime_str):
        """
        Parse FHIR datetime string to datetime object.
        Handles various FHIR timestamp formats robustly.
        """
        if not datetime_str:
            return None
            
        try:
            # Use dateutil.parser for robust parsing
            from dateutil import parser
            dt = parser.isoparse(datetime_str)
            # Ensure timezone-aware
            if dt.tzinfo is None:
                from datetime import timezone
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except (ValueError, ImportError):
            try:
                # Fallback: try multiple datetime formats similar to existing code
                formats = [
                    "%Y-%m-%dT%H:%M:%S%z",
                    "%Y-%m-%dT%H:%M:%S.%f%z", 
                    "%Y-%m-%dT%H:%M:%S",
                    "%Y-%m-%d"
                ]
                
                # Handle Z suffix
                test_str = datetime_str.replace('Z', '+00:00') if datetime_str.endswith('Z') else datetime_str
                
                for fmt in formats:
                    try:
                        dt = datetime.strptime(test_str, fmt)
                        # Make timezone-aware if not already
                        if dt.tzinfo is None:
                            from datetime import timezone
                            dt = dt.replace(tzinfo=timezone.utc)
                        return dt
                    except ValueError:
                        continue
            except Exception:
                pass
        
        return None

    def _is_resource_newer(self, resource_a, resource_b):
        """
        Compare two FHIR Patient resources to determine which is newer.
        Returns True if resource_a is newer than resource_b.
        
        Comparison order (following HL7 best practices):
        1. meta.lastUpdated (newer timestamp wins)
        2. meta.versionId (higher version wins, if numeric)
        3. Processing order (resource_a wins ties - last processed wins)
        """
        logger = logging.getLogger(__name__)
        
        # Get metadata safely
        meta_a = resource_a.get('meta', {})
        meta_b = resource_b.get('meta', {})
        
        # Compare lastUpdated timestamps
        last_updated_a = meta_a.get('lastUpdated')
        last_updated_b = meta_b.get('lastUpdated')
        
        if last_updated_a and last_updated_b:
            dt_a = self._parse_fhir_datetime(last_updated_a)
            dt_b = self._parse_fhir_datetime(last_updated_b)
            
            if dt_a and dt_b:
                if dt_a != dt_b:
                    logger.debug(f"Comparing lastUpdated: {last_updated_a} vs {last_updated_b}")
                    return dt_a > dt_b
            elif dt_a:
                return True  # A has valid timestamp, B doesn't
            elif dt_b:
                return False  # B has valid timestamp, A doesn't
        elif last_updated_a:
            return True  # A has timestamp, B doesn't
        elif last_updated_b:
            return False  # B has timestamp, A doesn't
        
        # Fallback to versionId comparison
        version_a = meta_a.get('versionId')
        version_b = meta_b.get('versionId')
        
        if version_a and version_b:
            try:
                # Try numeric comparison first (most common case)
                version_num_a = int(version_a)
                version_num_b = int(version_b)
                logger.debug(f"Comparing versionId (numeric): {version_a} vs {version_b}")
                return version_num_a > version_num_b
            except ValueError:
                # Fallback to string comparison for non-numeric versions
                logger.debug(f"Comparing versionId (string): {version_a} vs {version_b}")
                return version_a > version_b
        elif version_a:
            return True  # A has version, B doesn't
        elif version_b:
            return False  # B has version, A doesn't
        
        # Final fallback: prefer resource_a (last processed wins)
        logger.debug("No metadata available for comparison, preferring newer resource")
        return True

    def _deduplicate_patient_resources(self, patient_resources):
        """
        Deduplicate patient resources by DKTK-ID, keeping the latest version.
        
        Uses single-pass algorithm with O(n) time complexity and O(u) memory 
        where u is the number of unique patients.
        
        Args:
            patient_resources: List of FHIR Patient resource dictionaries
            
        Returns:
            List of deduplicated FHIR Patient resources (latest version per DKTK-ID)
        """
        logger = logging.getLogger(__name__)
        
        if not patient_resources:
            return []
        
        latest_patients = {}
        duplicate_count = 0
        skipped_count = 0
        
        for resource in patient_resources:
            # Extract patient ID using existing logic
            patient_id = self.convertToPatID(resource, resource.get('id'))
            
            if not patient_id:
                logger.warning(f"Patient resource {resource.get('id', 'unknown')} has no identifier, skipping deduplication")
                skipped_count += 1
                continue
                
            if patient_id not in latest_patients:
                latest_patients[patient_id] = resource
                logger.debug(f"First resource for patient {patient_id}: {resource.get('id', 'unknown')}")
            else:
                duplicate_count += 1
                existing_resource = latest_patients[patient_id]
                
                if self._is_resource_newer(resource, existing_resource):
                    logger.info(f"Patient {patient_id}: Replacing resource {existing_resource.get('id', 'unknown')} with newer resource {resource.get('id', 'unknown')}")
                    latest_patients[patient_id] = resource
                else:
                    logger.info(f"Patient {patient_id}: Keeping existing resource {existing_resource.get('id', 'unknown')}, discarding older resource {resource.get('id', 'unknown')}")
        
        unique_resources = list(latest_patients.values())
        
        # Log summary
        if duplicate_count > 0:
            logger.info(f"Deduplication complete: Found {duplicate_count} duplicates, returning {len(unique_resources)} unique patient resources")
        if skipped_count > 0:
            logger.warning(f"Skipped {skipped_count} patient resources without identifiers")
        
        return unique_resources

    def organize_observations(self):
        # First, collect all observations and organize them by patient reference
        for resource_id, resource_data in self.fhir_data.items():
            observations = safe_get_nested(resource_data, "Resources", "Observation", default=[])
            for observation in observations:
                patient_ref = safe_get_nested(observation, "subject", "reference")
                if patient_ref and patient_ref.startswith("Patient/"):
                    patient_id = safe_reference_extract(patient_ref, "Patient/")
                    if patient_id:
                            if patient_id not in self.patient_observations:
                                self.patient_observations[patient_id] = []
                            self.patient_observations[patient_id].append(observation)

    def convert_patient(self):
        new_patient_list = []
        self.organize_observations()
        
        # Define accepted patient profiles (supporting both full and pseudonymized patients)
        ACCEPTED_PATIENT_PROFILES = {
            "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Patient-Patient",
            "http://dktk.dkfz.de/fhir/StructureDefinition/onco-core-Patient-Pseudonym"
        }
        
        logger = logging.getLogger(__name__)
        
        # Phase 1: Collect all patient resources that match accepted profiles
        all_patient_resources = []
        for resource_id, resource_data in self.fhir_data.items():
            patient = safe_get_nested(resource_data, "Patient")
            if patient:
                # Check if patient has any of the accepted profiles
                profiles = safe_get_nested(patient, "meta", "profile", default=[])
                if any(profile in ACCEPTED_PATIENT_PROFILES for profile in profiles):
                    all_patient_resources.append(patient)
        
        # Phase 2: Deduplicate patient resources with error handling
        try:
            unique_patient_resources = self._deduplicate_patient_resources(all_patient_resources)
            logger.info(f"Successfully deduplicated {len(all_patient_resources)} patient resources to {len(unique_patient_resources)} unique patients")
        except Exception as e:
            logger.error(f"Patient deduplication failed: {e}, processing all {len(all_patient_resources)} resources without deduplication")
            unique_patient_resources = all_patient_resources
        
        # Phase 3: Process deduplicated patient resources
        for patient in unique_patient_resources:
            patient_id = safe_get_nested(patient, "id")
            vital_info = self.getVitalInfo(patient_id)
            vital_date = None
            vital_state = None
            if vital_info:
                vital_date, vital_state = vital_info

            new_patient = {
                "area": self.getArea(),
                "patID": self.convertToPatID(patient, patient_id),
                "postalCode": self.getPostalCode(),
                "countryCode": self.getCountryCode(),
                "vitalDate": vital_date,
                "vitalState": vital_state,
                "birthDate": self.getBirthDate(patient),
                "gender": self.getGender(patient),
                "firstName": self.getFirstName(),
                "lastName": self.getLastName()
            }
            new_patient_list.append(new_patient)

        return {"patient": new_patient_list}