import os
import asyncio
import logging
from pathlib import Path
from dotenv import load_dotenv
from fhir_server_patient_ressources_extraction import fetch_fhir_data, check_fhir_server
from transform_extracted_patient_ressources_to_omock import convert_fhir_to_omock

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

RETRY_INTERVAL_SECONDS = 5


def wait_for_fhir_server(server_url: str, username: str, password: str) -> None:
    attempt = 1
    while True:
        logging.info(
            "Checking if FHIR server is reachable (attempt %s) at %s...",
            attempt,
            server_url,
        )
        server_available = asyncio.run(
            check_fhir_server(server_url, username, password, verify_ssl=False)
        )
        if server_available:
            logging.info(
                "FHIR server became reachable at %s after %s attempt(s)",
                server_url,
                attempt,
            )
            return
        logging.warning(
            "FHIR server not ready yet at %s; retrying in %ss (attempt %s)",
            server_url,
            RETRY_INTERVAL_SECONDS,
            attempt,
        )
        attempt += 1
        asyncio.run(asyncio.sleep(RETRY_INTERVAL_SECONDS))


def main():
    # Load environment variables
    load_dotenv()

    # Get environment variables
    server_url = os.getenv('FHIR_SERVER_URL', 'http://localhost:8080/fhir')
    username = os.getenv('FHIR_USERNAME', '')
    password = os.getenv('FHIR_PASSWORD', '')
    icd10_filter = os.getenv('ICD10_FILTER', '')

    # Use paths in the mounted volume
    output_dir = '/shared'
    intermediate_file = os.path.join(output_dir, 'patient_organized_resources_self_result.json')
    output_file = os.path.join(output_dir, 'omock.json')

    try:
        logging.info(
            "CCP importer startup: FHIR_SERVER_URL=%s, FHIR_USERNAME_set=%s, FHIR_PASSWORD_set=%s",
            server_url,
            bool(username),
            bool(password),
        )
        wait_for_fhir_server(server_url, username, password)

        # Step 1: Fetch FHIR data
        logging.info("Starting FHIR data extraction...")
        asyncio.run(
            fetch_fhir_data(
                url=server_url,
                username=username,
                password=password,
                verify_ssl=False,
                output_dir=output_dir,
                icd10_filter=icd10_filter
            )
        )
        logging.info("FHIR data extraction completed")

        # Step 2: Convert to OMOCK format
        logging.info("Starting conversion to OMOCK format...")
        convert_fhir_to_omock(
            output_filename=output_file,
            patient_data_filename=intermediate_file
        )
        logging.info("Conversion to OMOCK format completed")

        # Step 3: Clean up intermediate file
        if Path(intermediate_file).exists():
            Path(intermediate_file).unlink()
            logging.info("Cleaned up intermediate file")

        logging.info(f"Process completed successfully. Output saved to {output_file}")

    except Exception as e:
        logging.error(f"Error during processing: {str(e)}")
        raise

if __name__ == "__main__":
    main()
