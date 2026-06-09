import json
from ConvertTypes.Patient import Patient
from ConvertTypes.Histology import Histology
from ConvertTypes.Metastasis import Metastasis
from ConvertTypes.TumorBoard import TumorBoard
from ConvertTypes.MolecularMarker import MolecularMarker
from ConvertTypes.Diagnosis import Diagnosis
from ConvertTypes.Status import Status
from ConvertTypes.Progress import Progress
from ConvertTypes.TNM import TNM
from ConvertTypes.Therapy import Therapy
from ConvertTypes.Supplementary import Supplementary
from ConvertTypes.SingleRadiation import SingleRadiation

def post_process_histology(data):
    """
    Post-process histology data to remove duplicates and maintain consistency.
    
    Args:
        data (dict): The complete converted patient data dictionary
    
    Returns:
        dict: The processed data with updated histology and diagnosis sections
    """
    # Remove diagnosis entries with null ICD_ICD10
    data["diagnosis"] = [
        diagnosis for diagnosis in data.get("diagnosis", [])
        if diagnosis.get("ICD_ICD10") is not None
    ]
    
    # Group diagnosis entries by tumorID
    diagnosis_by_tumor = {}
    for diagnosis in data.get("diagnosis", []):
        tumorID = diagnosis.get("tumorID")
        if not tumorID:  # Skip entries without tumorID
            continue
            
        if tumorID not in diagnosis_by_tumor:
            diagnosis_by_tumor[tumorID] = []
        diagnosis_by_tumor[tumorID].append(diagnosis)
    
    # Keep only the oldest histology entry for each tumorID in diagnosis
    kept_diagnoses = []
    for tumorID, diagnoses in diagnosis_by_tumor.items():
        # Sort by ICDO_histologyDate and keep the oldest
        sorted_diagnoses = sorted(
            diagnoses,
            key=lambda x: x.get("ICDO_histologyDate", "9999-12-31T00:00:00.000Z")
        )
        kept_diagnoses.append(sorted_diagnoses[0])
    
    # Update diagnosis section with kept entries
    data["diagnosis"] = kept_diagnoses
    
    # Remove matching entries from histology section
    histology_to_keep = []
    for histology in data.get("histology", []):
        should_keep = True
        
        # Check against each kept diagnosis
        for diagnosis in kept_diagnoses:
            if (
                histology.get("tumorID") == diagnosis.get("tumorID") and
                histology.get("ICDO_histologyCode") == diagnosis.get("ICDO_histologyCode") and
                histology.get("ICDO_histologyDescription") == diagnosis.get("ICDO_histologyDescription") and
                histology.get("ICDO_histologyDate") == diagnosis.get("ICDO_histologyDate")
            ):
                should_keep = False
                break
        
        if should_keep:
            histology_to_keep.append(histology)
    
    # Update histology section with kept entries
    data["histology"] = histology_to_keep
    
    return data


def convert_fhir_to_omock(output_filename: str = "converted_patient_data.json", patient_data_filename: str = "patient_data.json"):
    """
    Converts FHIR server data to OMOCK format and saves it to a file.
    
    Args:
        output_filename (str, optional): Name of the output JSON file. Defaults to "converted_patient_data.json"
        intermediate_filename (str, optional): Name of the intermediate raw FHIR data file. Defaults to "patient_data.json"
    
    Example:
        convert_fhir_to_omock(
            output_filename="my_converted_data.json",
            patient_data_filename="patient_organized_resources_fhir_kindling_result.json"
        )
    """
    # Ensure output path is in the mounted volume
    output_path = f"{output_filename}"
    
    # Load the FHIR data for conversion
    with open(patient_data_filename, "r") as f:
        fhir_data = json.load(f)

    # Convert different types of medical data to OMOCK format with enhanced error handling
    # Each converter handles specific medical data transformation
    converters = {}
    
    # Initialize converters with try/catch blocks for null safety
    try:
        converters["patient"] = (Patient(fhir_data).convert_patient(), "Patient")
    except Exception as e:
        print(f"Warning: Patient conversion failed: {e}")
        converters["patient"] = ({"patient": []}, "Patient")
    
    try:
        converters["histology"] = (Histology(fhir_data).convert_histology(), "Histology")
    except Exception as e:
        print(f"Warning: Histology conversion failed: {e}")
        converters["histology"] = ({"histology": []}, "Histology")
    
    try:
        converters["metastasis"] = (Metastasis(fhir_data).convert_metastasis(), "Metastasis")
    except Exception as e:
        print(f"Warning: Metastasis conversion failed: {e}")
        converters["metastasis"] = ({"metastasis": []}, "Metastasis")
    
    try:
        converters["tumorboard"] = (TumorBoard(fhir_data).convert_tumorboard(), "Tumorboard")
    except Exception as e:
        print(f"Warning: Tumorboard conversion failed: {e}")
        converters["tumorboard"] = ({"tumorboard": []}, "Tumorboard")
    
    try:
        converters["molecularMarker"] = (MolecularMarker(fhir_data).convert_molecularmarker(), "MolecularMarker")
    except Exception as e:
        print(f"Warning: MolecularMarker conversion failed: {e}")
        converters["molecularMarker"] = ({"molecularMarker": []}, "MolecularMarker")
    
    try:
        converters["diagnosis"] = (Diagnosis(fhir_data).convert_diagnosis(), "Diagnosis")
    except Exception as e:
        print(f"Warning: Diagnosis conversion failed: {e}")
        converters["diagnosis"] = ({"diagnosis": []}, "Diagnosis")
    
    try:
        converters["status"] = (Status(fhir_data).convert_status(), "Status")
    except Exception as e:
        print(f"Warning: Status conversion failed: {e}")
        converters["status"] = ({"status": []}, "Status")
    
    try:
        converters["progress"] = (Progress(fhir_data).convert_progress(), "Progress")
    except Exception as e:
        print(f"Warning: Progress conversion failed: {e}")
        converters["progress"] = ({"progress": []}, "Progress")
    
    try:
        converters["tnm"] = (TNM(fhir_data).convert_tnm(), "TNM")
    except Exception as e:
        print(f"Warning: TNM conversion failed: {e}")
        converters["tnm"] = ({"tnm": []}, "TNM")
    
    try:
        converters["therapy"] = (Therapy(fhir_data).convert_therapy(), "Therapy")
    except Exception as e:
        print(f"Warning: Therapy conversion failed: {e}")
        converters["therapy"] = ({"therapy": []}, "Therapy")
    
    try:
        converters["supplementary"] = (Supplementary(fhir_data).convert_supplementary(), "Supplementary")
    except Exception as e:
        print(f"Warning: Supplementary conversion failed: {e}")
        converters["supplementary"] = ({"supplementary": []}, "Supplementary")
    
    try:
        converters["singleRadiation"] = (SingleRadiation(fhir_data).convert_single_radiation(), "SingleRadiation")
    except Exception as e:
        print(f"Warning: SingleRadiation conversion failed: {e}")
        converters["singleRadiation"] = ({"singleRadiation": []}, "SingleRadiation")
    
    # Static converters (unchanged)
    converters["consultation"] = ({"consultation": []}, "Consultation")
    converters["diagnostic"] = ({"diagnostic": []}, "Diagnostic")
    converters["kaplanMeier"] = ({"kaplanMeier": []}, "KaplanMeier")

    # Convert and collect all data
    combined_data = {}
    for key, (converter_result, display_name) in converters.items():
        print(f"\nConvert {display_name} to omock.json Format.")
        combined_data[key] = converter_result.get(key, [])
    
    # Post-process the combined data
    combined_data = post_process_histology(combined_data)

    # Save the final converted data to JSON file in the output directory
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(combined_data, f, indent=2, ensure_ascii=False)

    # Print absolute path of the output file
    import os
    print(f"Output file saved to: {os.path.abspath(output_path)}")

    print(f"\nConversion complete. Output saved to '{output_path}'.")