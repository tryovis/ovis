#!/bin/bash
#
# Build and push multi-arch standalone OVIS images to the general registry.
#
# Usage:
#   ./scripts/push-verbis-images.sh
#   ./scripts/push-general-images.sh
#
# This script publishes the standalone/general image set used by compose-image.yaml:
#   - ovis-frontend
#   - ovis-backend-apollo
#   - ovis-backend-mongodb
#   - ovis-backend-preprocessor
#   - ovis-keycloak
#   - ovis-keycloak-config
#   - ovis-express-auth
#   - ovis-backend-data-import-demo
#   - ovis-backend-data-import-ccp
#   - ovis-backend-data-import-onkostar
#
# The importer runtime choice stays a deployment concern. This script always publishes
# all importer images. OVIS_IMPORT_MODE only selects the standalone frontend flavor.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

ENV_FILE="${PROJECT_ROOT}/.env"
if [[ -f "$ENV_FILE" ]]; then
    echo -e "${GREEN}Loading configuration from .env${NC}"
    while IFS= read -r line || [[ -n "$line" ]]; do
        case "$line" in
            ''|'#'*) continue ;;
        esac
        key=${line%%=*}
        value=${line#*=}
        value=${value%$'\r'}
        if [[ $value == \"*\" && $value == *\" ]]; then
            value=${value:1:-1}
        elif [[ $value == \'*\' && $value == *\' ]]; then
            value=${value:1:-1}
        fi
        if [[ -z "${!key+x}" ]]; then
            export "$key=$value"
        fi
    done < "$ENV_FILE"
else
    echo -e "${YELLOW}Warning: .env file not found at ${ENV_FILE}${NC}"
fi

OVIS_IMAGE_TAG="latest"
OVIS_IMPORT_MODE="${OVIS_IMPORT_MODE:-demo}"
OVIS_IMAGE_BUILD_PLATFORMS="linux/amd64,linux/arm64"
GENERAL_NAMESPACE="${OVIS_GENERAL_IMAGE_NAMESPACE:-}"
GENERAL_USERNAME="${OVIS_GENERAL_IMAGE_REGISTRY_USERNAME:-}"
GENERAL_PASSWORD="${OVIS_GENERAL_IMAGE_REGISTRY_PASSWORD:-}"

ALL_IMAGES=(
    "ovis-frontend"
    "ovis-backend-apollo"
    "ovis-backend-mongodb"
    "ovis-backend-preprocessor"
    "ovis-keycloak"
    "ovis-keycloak-config"
    "ovis-express-auth"
    "ovis-backend-data-import-demo"
    "ovis-backend-data-import-ccp"
    "ovis-backend-data-import-onkostar"
)

echo "=========================================="
echo "OVIS Standalone Image Push Script"
echo "=========================================="
echo "General Namespace: ${GENERAL_NAMESPACE:-<missing>}"
echo "Tag: ${OVIS_IMAGE_TAG} (fixed)"
echo "Frontend Runtime Mode: ${OVIS_IMPORT_MODE}"
echo "Platforms: ${OVIS_IMAGE_BUILD_PLATFORMS} (mandatory multi-arch)"
echo "Images: ${ALL_IMAGES[*]}"
echo "=========================================="

case "$OVIS_IMPORT_MODE" in
    demo|ccp|onkostar)
        ;;
    *)
        echo -e "${RED}Error: OVIS_IMPORT_MODE must be one of: demo, ccp, onkostar${NC}"
        exit 1
        ;;
esac

if [[ -z "$GENERAL_NAMESPACE" ]]; then
    echo -e "${RED}Error: OVIS_GENERAL_IMAGE_NAMESPACE must be set${NC}"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: docker command not found${NC}"
    exit 1
fi

if ! docker buildx version &> /dev/null; then
    echo -e "${RED}Error: docker buildx not available. Install Docker Desktop or enable buildx.${NC}"
    exit 1
fi

require_existing_path() {
    local path=$1
    if [[ ! -e "$path" ]]; then
        echo -e "${RED}Error: required path not found: ${path}${NC}"
        exit 1
    fi
}

verify_multiarch() {
    local image=$1
    echo -e "${GREEN}Verifying multi-arch manifest for ${image}...${NC}"

    local manifest
    manifest=$(docker buildx imagetools inspect "$image" 2>&1) || {
        echo -e "${YELLOW}⚠ Could not inspect manifest for ${image}${NC}"
        return 0
    }

    if echo "$manifest" | grep -q "linux/amd64" && echo "$manifest" | grep -q "linux/arm64"; then
        echo -e "${GREEN}✓ Multi-arch verified: linux/amd64 + linux/arm64${NC}"
        return 0
    fi

    echo -e "${RED}✗ ERROR: Image ${image} is NOT multi-arch!${NC}"
    echo "$manifest" | head -20
    return 1
}

frontend_build_args() {
    local args=(
        --build-arg "HTTP_PROXY=${OVIS_HTTP_PROXY:-}"
        --build-arg "HTTPS_PROXY=${OVIS_HTTPS_PROXY:-}"
        --build-arg "NO_PROXY=${OVIS_NO_PROXY:-}"
        --build-arg "http_proxy=${OVIS_HTTP_PROXY:-}"
        --build-arg "https_proxy=${OVIS_HTTPS_PROXY:-}"
        --build-arg "no_proxy=${OVIS_NO_PROXY:-}"
        --build-arg "HEALTHCHECK_PATH=/"
        --build-arg "NGINX_PROXY_MODE=${NGINX_PROXY_MODE:-true}"
        --build-arg "APP_DOMAIN=${APP_DOMAIN:-localhost}"
        --build-arg "EXPRESS_PORT=${EXPRESS_PORT:-8251}"
        --build-arg "APOLLO_PORT=${APOLLO_PORT:-4001}"
        --build-arg "NGINX_SSL_ENABLED=${NGINX_SSL_ENABLED:-false}"
        --build-arg "PUBLIC_IMPORT_MODE=${OVIS_IMPORT_MODE}"
        --build-arg "PUBLIC_LOGIN_ENABLED=${PUBLIC_LOGIN_ENABLED:-false}"
        --build-arg "PUBLIC_LDAP_ENABLED=${PUBLIC_LDAP_ENABLED:-false}"
        --build-arg "OVIS_PUBLIC_BASE_PATH="
        --build-arg "VITE_EXPRESS_USERNAME=${EXPRESS_AUTH_USERNAME:-admin}"
        --build-arg "VITE_EXPRESS_PASSWORT=${EXPRESS_AUTH_PASSWORD:-admin}"
        --build-arg "PUBLIC_SITE_SPECIFIC_TECHNICAL_ADMIN_NAME=${PUBLIC_SITE_SPECIFIC_TECHNICAL_ADMIN_NAME:-}"
        --build-arg "PUBLIC_SITE_SPECIFIC_TECHNICAL_ADMIN_EMAIL=${PUBLIC_SITE_SPECIFIC_TECHNICAL_ADMIN_EMAIL:-}"
        --build-arg "PUBLIC_SITE_SPECIFIC_SHOW_USERAGREEMENT=${PUBLIC_SITE_SPECIFIC_SHOW_USERAGREEMENT:-}"
        --build-arg "PUBLIC_SITE_SPECIFIC_SHOW_IMPRINT=${PUBLIC_SITE_SPECIFIC_SHOW_IMPRINT:-}"
        --build-arg "PUBLIC_SITE_SPECIFIC_IMPRINT_RESPONSIBLE_WEBHOST_ORGANIZATION=${PUBLIC_SITE_SPECIFIC_IMPRINT_RESPONSIBLE_WEBHOST_ORGANIZATION:-}"
        --build-arg "PUBLIC_SITE_SPECIFIC_IMPRINT_RESPONSIBLE_WEBHOST_PERSON=${PUBLIC_SITE_SPECIFIC_IMPRINT_RESPONSIBLE_WEBHOST_PERSON:-}"
        --build-arg "PUBLIC_SITE_SPECIFIC_IMPRINT_RESPONSIBLE_WEBHOST_ADDRESS_STREET=${PUBLIC_SITE_SPECIFIC_IMPRINT_RESPONSIBLE_WEBHOST_ADDRESS_STREET:-}"
        --build-arg "PUBLIC_SITE_SPECIFIC_IMPRINT_RESPONSIBLE_WEBHOST_ADDRESS_AREA=${PUBLIC_SITE_SPECIFIC_IMPRINT_RESPONSIBLE_WEBHOST_ADDRESS_AREA:-}"
        --build-arg "PUBLIC_SITE_SPECIFIC_IMPRINT_HOSPITAL_PASSUS=${PUBLIC_SITE_SPECIFIC_IMPRINT_HOSPITAL_PASSUS:-}"
        --build-arg "PUBLIC_SITE_SPECIFIC_IMPRINT_RESPONSIBLE_HOSPITAL_DIRECTOR=${PUBLIC_SITE_SPECIFIC_IMPRINT_RESPONSIBLE_HOSPITAL_DIRECTOR:-}"
        --build-arg "PUBLIC_SITE_SPECIFIC_IMPRINT_HOSPITAL_NAME=${PUBLIC_SITE_SPECIFIC_IMPRINT_HOSPITAL_NAME:-}"
        --build-arg "PUBLIC_SITE_SPECIFIC_IMPRINT_ADDRESS_STREET=${PUBLIC_SITE_SPECIFIC_IMPRINT_ADDRESS_STREET:-}"
        --build-arg "PUBLIC_SITE_SPECIFIC_IMPRINT_ADDRESS_AREA=${PUBLIC_SITE_SPECIFIC_IMPRINT_ADDRESS_AREA:-}"
        --build-arg "PUBLIC_SITE_SPECIFIC_IMPRINT_DATA_PROTECTION_OFFICER_NAME=${PUBLIC_SITE_SPECIFIC_IMPRINT_DATA_PROTECTION_OFFICER_NAME:-}"
        --build-arg "PUBLIC_SITE_SPECIFIC_IMPRINT_DATA_PROTECTION_OFFICER_STREET=${PUBLIC_SITE_SPECIFIC_IMPRINT_DATA_PROTECTION_OFFICER_STREET:-}"
        --build-arg "PUBLIC_SITE_SPECIFIC_IMPRINT_DATA_PROTECTION_OFFICER_AREA=${PUBLIC_SITE_SPECIFIC_IMPRINT_DATA_PROTECTION_OFFICER_AREA:-}"
        --build-arg "PUBLIC_SITE_SPECIFIC_IMPRINT_DATA_PROTECTION_OFFICER_EMAIL=${PUBLIC_SITE_SPECIFIC_IMPRINT_DATA_PROTECTION_OFFICER_EMAIL:-}"
        --build-arg "PUBLIC_SYSTEM_START_LANGUAGE=${PUBLIC_SYSTEM_START_LANGUAGE:-}"
        --build-arg "PUBLIC_NAV_PATIENT_COHORT_ENABLED=${PUBLIC_NAV_PATIENT_COHORT_ENABLED:-true}"
        --build-arg "PUBLIC_NAV_PATIENT_SINGLE_ENABLED=${PUBLIC_NAV_PATIENT_SINGLE_ENABLED:-true}"
        --build-arg "PUBLIC_NAV_DIAGNOSIS_ENABLED=${PUBLIC_NAV_DIAGNOSIS_ENABLED:-true}"
        --build-arg "PUBLIC_NAV_TNM_ENABLED=${PUBLIC_NAV_TNM_ENABLED:-true}"
        --build-arg "PUBLIC_NAV_THERAPY_GENERAL_ENABLED=${PUBLIC_NAV_THERAPY_GENERAL_ENABLED:-true}"
        --build-arg "PUBLIC_NAV_THERAPY_OPERATION_ENABLED=${PUBLIC_NAV_THERAPY_OPERATION_ENABLED:-true}"
        --build-arg "PUBLIC_NAV_THERAPY_SYSTEMIC_ENABLED=${PUBLIC_NAV_THERAPY_SYSTEMIC_ENABLED:-true}"
        --build-arg "PUBLIC_NAV_THERAPY_RADIATION_ENABLED=${PUBLIC_NAV_THERAPY_RADIATION_ENABLED:-true}"
        --build-arg "PUBLIC_NAV_PROGRESS_ENABLED=${PUBLIC_NAV_PROGRESS_ENABLED:-true}"
        --build-arg "PUBLIC_NAV_TUMORBOARD_ENABLED=${PUBLIC_NAV_TUMORBOARD_ENABLED:-true}"
        --build-arg "PUBLIC_NAV_CONSULTATION_ENABLED=${PUBLIC_NAV_CONSULTATION_ENABLED:-true}"
        --build-arg "PUBLIC_NAV_STATUS_ENABLED=${PUBLIC_NAV_STATUS_ENABLED:-true}"
        --build-arg "PUBLIC_NAV_SURVIVAL_ENABLED=${PUBLIC_NAV_SURVIVAL_ENABLED:-true}"
        --build-arg "PUBLIC_NAV_SUPPLEMENTARY_ENABLED=${PUBLIC_NAV_SUPPLEMENTARY_ENABLED:-true}"
        --build-arg "PUBLIC_NAV_MOLECULAR_ENABLED=${PUBLIC_NAV_MOLECULAR_ENABLED:-true}"
        --build-arg "PUBLIC_NAV_BIO_MATERIAL_ENABLED=${PUBLIC_NAV_BIO_MATERIAL_ENABLED:-true}"
        --build-arg "PUBLIC_NAV_STUDY_ENABLED=${PUBLIC_NAV_STUDY_ENABLED:-true}"
        --build-arg "PUBLIC_NAV_USER_MANAGEMENT_ENABLED=${PUBLIC_NAV_USER_MANAGEMENT_ENABLED:-true}"
        --build-arg "PUBLIC_QUICKTOOLS_GENDER_BUTTONS=${PUBLIC_QUICKTOOLS_GENDER_BUTTONS:-M|m;W|w;Other|other}"
        --build-arg "PUBLIC_QUICKTOOLS_GENDER_OTHER_EXCLUSIONS=${PUBLIC_QUICKTOOLS_GENDER_OTHER_EXCLUSIONS:-m;w}"
        --build-arg "PUBLIC_QUICKTOOLS_CERT_CASES_POS=${PUBLIC_QUICKTOOLS_CERT_CASES_POS:-primary=Primary Case|Ja,recurrence=Recurrence Case|true,center=Center Case|Ja}"
        --build-arg "PUBLIC_QUICKTOOLS_CERT_CASES_NEG=${PUBLIC_QUICKTOOLS_CERT_CASES_NEG:-primary=Primary Case|Nein,recurrence=Recurrence Case|false,center=Center Case|Nein}"
        --build-arg "PUBLIC_QUICKTOOLS_CERT_INTERNAL_LABEL=${PUBLIC_QUICKTOOLS_CERT_INTERNAL_LABEL:-Meine Einrichtung|Meine Einrichtung}"
    )

    printf '%s\n' "${args[@]}"
}

build_and_push() {
    local name=$1
    local context=$2
    local dockerfile=$3
    local image="${GENERAL_NAMESPACE}/${name}:${OVIS_IMAGE_TAG}"

    echo ""
    echo -e "${GREEN}Building: ${name}${NC}"
    echo "  Context: ${context}"
    echo "  Dockerfile: ${dockerfile}"

    docker buildx build \
        --platform "$OVIS_IMAGE_BUILD_PLATFORMS" \
        --tag "$image" \
        --file "$dockerfile" \
        --push \
        "$context"

    verify_multiarch "$image"
}

build_and_push_frontend() {
    local context=$1
    local dockerfile=$2
    local target=$3
    local image="${GENERAL_NAMESPACE}/ovis-frontend:${OVIS_IMAGE_TAG}"

    mapfile -t general_args < <(frontend_build_args)

    echo ""
    echo -e "${GREEN}Building: ovis-frontend${NC}"
    echo "  Context: ${context}"
    echo "  Dockerfile: ${dockerfile}"
    echo "  Target: ${target}"
    echo "  Runtime-configured: PUBLIC_IMPORT_MODE, PUBLIC_LOGIN_ENABLED"
    echo "  OVIS_PUBLIC_BASE_PATH: <root> (default build)"

    docker buildx build \
        --platform "$OVIS_IMAGE_BUILD_PLATFORMS" \
        --tag "$image" \
        --file "$dockerfile" \
        --target "$target" \
        "${general_args[@]}" \
        --push \
        "$context"

    verify_multiarch "$image"
}

require_existing_path "${PROJECT_ROOT}/Frontend/Dockerfile"
require_existing_path "${PROJECT_ROOT}/Backend/Apollo/dockerfile"
require_existing_path "${PROJECT_ROOT}/Backend/MongoDB/Dockerfile.preprocessor"
require_existing_path "${PROJECT_ROOT}/Backend/MongoDB/Dockerfile.mongodb"
require_existing_path "${PROJECT_ROOT}/Backend/Authentication/Keycloak/Dockerfile"
require_existing_path "${PROJECT_ROOT}/Backend/Authentication/Keycloak/Dockerfile.keycloak-config"
require_existing_path "${PROJECT_ROOT}/Backend/Authentication/express/Dockerfile"
require_existing_path "${PROJECT_ROOT}/Backend/Data-Import/demo/Dockerfile"
require_existing_path "${PROJECT_ROOT}/Backend/Data-Import/ccp/Dockerfile"
require_existing_path "${PROJECT_ROOT}/Backend/Data-Import/onkostar/Dockerfile"

if [[ -n "$GENERAL_USERNAME" && -n "$GENERAL_PASSWORD" ]]; then
    if [[ "$GENERAL_NAMESPACE" == */* ]]; then
        GENERAL_REGISTRY_HOST="${GENERAL_NAMESPACE%%/*}"
    else
        GENERAL_REGISTRY_HOST="docker.io"
    fi
    echo ""
    echo -e "${GREEN}Logging in to general registry ${GENERAL_REGISTRY_HOST}...${NC}"
    echo "$GENERAL_PASSWORD" | docker login "$GENERAL_REGISTRY_HOST" -u "$GENERAL_USERNAME" --password-stdin
fi

echo ""
echo "=========================================="
echo "Starting standalone multi-arch image builds..."
echo "=========================================="

build_and_push_frontend \
    "${PROJECT_ROOT}/Frontend" \
    "${PROJECT_ROOT}/Frontend/Dockerfile" \
    "production"

build_and_push "ovis-backend-apollo" \
    "${PROJECT_ROOT}/Backend/Apollo" \
    "${PROJECT_ROOT}/Backend/Apollo/dockerfile"

build_and_push "ovis-backend-preprocessor" \
    "${PROJECT_ROOT}/Backend/MongoDB" \
    "${PROJECT_ROOT}/Backend/MongoDB/Dockerfile.preprocessor"

build_and_push "ovis-backend-mongodb" \
    "${PROJECT_ROOT}/Backend/MongoDB" \
    "${PROJECT_ROOT}/Backend/MongoDB/Dockerfile.mongodb"

build_and_push "ovis-keycloak" \
    "${PROJECT_ROOT}/Backend/Authentication/Keycloak" \
    "${PROJECT_ROOT}/Backend/Authentication/Keycloak/Dockerfile"

build_and_push "ovis-keycloak-config" \
    "${PROJECT_ROOT}/Backend/Authentication/Keycloak" \
    "${PROJECT_ROOT}/Backend/Authentication/Keycloak/Dockerfile.keycloak-config"

build_and_push "ovis-express-auth" \
    "${PROJECT_ROOT}/Backend/Authentication/express" \
    "${PROJECT_ROOT}/Backend/Authentication/express/Dockerfile"

build_and_push "ovis-backend-data-import-demo" \
    "${PROJECT_ROOT}/Backend/Data-Import/demo" \
    "${PROJECT_ROOT}/Backend/Data-Import/demo/Dockerfile"

build_and_push "ovis-backend-data-import-ccp" \
    "${PROJECT_ROOT}/Backend/Data-Import/ccp" \
    "${PROJECT_ROOT}/Backend/Data-Import/ccp/Dockerfile"

build_and_push "ovis-backend-data-import-onkostar" \
    "${PROJECT_ROOT}/Backend/Data-Import/onkostar" \
    "${PROJECT_ROOT}/Backend/Data-Import/onkostar/Dockerfile"

echo ""
echo "=========================================="
echo -e "${GREEN}All standalone multi-arch images built and pushed successfully!${NC}"
echo "=========================================="
echo ""
echo "General registry images:"
echo "  - ${GENERAL_NAMESPACE}/ovis-frontend:${OVIS_IMAGE_TAG}"
echo "  - ${GENERAL_NAMESPACE}/ovis-backend-apollo:${OVIS_IMAGE_TAG}"
echo "  - ${GENERAL_NAMESPACE}/ovis-backend-mongodb:${OVIS_IMAGE_TAG}"
echo "  - ${GENERAL_NAMESPACE}/ovis-backend-preprocessor:${OVIS_IMAGE_TAG}"
echo "  - ${GENERAL_NAMESPACE}/ovis-keycloak:${OVIS_IMAGE_TAG}"
echo "  - ${GENERAL_NAMESPACE}/ovis-keycloak-config:${OVIS_IMAGE_TAG}"
echo "  - ${GENERAL_NAMESPACE}/ovis-express-auth:${OVIS_IMAGE_TAG}"
echo "  - ${GENERAL_NAMESPACE}/ovis-backend-data-import-demo:${OVIS_IMAGE_TAG}"
echo "  - ${GENERAL_NAMESPACE}/ovis-backend-data-import-ccp:${OVIS_IMAGE_TAG}"
echo "  - ${GENERAL_NAMESPACE}/ovis-backend-data-import-onkostar:${OVIS_IMAGE_TAG}"
echo ""
echo "Next steps on the standalone host:"
echo "  docker compose -f compose-image.yaml pull"
echo "  docker compose -f compose-image.yaml up -d"
echo ""
