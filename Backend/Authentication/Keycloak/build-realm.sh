#!/bin/sh

# Script to dynamically build Keycloak realm configuration
# Uses ovis-realm.json as base and adds LDAP configuration when enabled

set -e

# Input and output files
BASE_REALM="/realm-base/ovis-realm.json"
OUTPUT_REALM="/import/ovis-realm.json"

# Check if base realm exists
if [ ! -f "$BASE_REALM" ]; then
    echo "Error: Base realm file not found at $BASE_REALM"
    exit 1
fi

# Copy base realm to output
cp "$BASE_REALM" "$OUTPUT_REALM"

# Update client secret if provided
if [ -n "$KEYCLOAK_CLIENT_SECRET" ] && [ -n "$KEYCLOAK_CLIENT_ID" ]; then
    echo "Updating client secret for $KEYCLOAK_CLIENT_ID..."
    jq --arg clientId "$KEYCLOAK_CLIENT_ID" --arg secret "$KEYCLOAK_CLIENT_SECRET" \
        '(.clients[] | select(.clientId == $clientId) | .secret) = $secret' \
        "$OUTPUT_REALM" > "$OUTPUT_REALM.tmp" && mv "$OUTPUT_REALM.tmp" "$OUTPUT_REALM"
    echo "Client secret updated successfully"
fi

OVIS_ROOT_USERNAME=${OVIS_ROOT_USERNAME:-"ovis-root"}
OVIS_ROOT_PASSWORD=${OVIS_ROOT_PASSWORD:-"test"}
OVIS_ROOT_EMAIL="${OVIS_ROOT_USERNAME}@example.com"

jq --arg username "$OVIS_ROOT_USERNAME" --arg password "$OVIS_ROOT_PASSWORD" --arg email "$OVIS_ROOT_EMAIL" \
    '(.users[] | select(.username == "ovis-root") | .username) = $username
    | (.users[] | select(.username == $username) | .email) = $email
    | (.users[] | select(.username == $username) | .credentials) = [{"type":"password","value":$password,"temporary":false}]' \
    "$OUTPUT_REALM" > "$OUTPUT_REALM.tmp" && mv "$OUTPUT_REALM.tmp" "$OUTPUT_REALM"

echo "Configured default OVIS root user from environment"

# Check if LDAP is enabled
if [ "$PUBLIC_LDAP_ENABLED" = "true" ]; then
    echo "LDAP is enabled - adding LDAP user federation provider..."
    echo "  LDAP_CONNECTION_URL=$LDAP_CONNECTION_URL"
    echo "  LDAP_USERS_DN=$LDAP_USERS_DN"
    
    # Validate required LDAP variables
    if [ -z "$LDAP_CONNECTION_URL" ] || [ -z "$LDAP_BIND_DN" ] || [ -z "$LDAP_BIND_CREDENTIAL" ] || [ -z "$LDAP_USERS_DN" ]; then
        echo "Error: Missing required LDAP configuration variables"
        echo "Required: LDAP_CONNECTION_URL, LDAP_BIND_DN, LDAP_BIND_CREDENTIAL, LDAP_USERS_DN"
        exit 1
    fi
    
    normalize_bool() {
        case "$1" in
            true|TRUE|True|1|yes|YES|on|ON)
                echo "true"
                ;;
            false|FALSE|False|0|no|NO|off|OFF|"")
                echo "false"
                ;;
            *)
                echo "Error: Invalid boolean value '$1'" >&2
                exit 1
                ;;
        esac
    }

    normalize_search_scope() {
        case "$1" in
            "")
                echo ""
                ;;
            1|ONE_LEVEL|one_level|ONELEVEL|onelevel)
                echo "1"
                ;;
            2|SUBTREE|subtree)
                echo "2"
                ;;
            *)
                echo "Error: Invalid LDAP_SEARCH_SCOPE '$1'. Use 1/ONE_LEVEL or 2/SUBTREE." >&2
                exit 1
                ;;
        esac
    }

    normalize_referral() {
        case "$1" in
            "")
                echo ""
                ;;
            ignore|IGNORE)
                echo "ignore"
                ;;
            follow|FOLLOW)
                echo "follow"
                ;;
            *)
                echo "Error: Invalid LDAP_REFERRAL '$1'. Use ignore or follow." >&2
                exit 1
                ;;
        esac
    }

    normalize_vendor() {
        case "$1" in
            ""|ad|AD|Ad|aD)
                echo "ad"
                ;;
            other|OTHER|Other)
                echo "other"
                ;;
            rhds|RHDS|Rhds|RHds)
                echo "rhds"
                ;;
            *)
                echo "$1"
                ;;
        esac
    }

    # Keep existing AD/LMU-compatible behavior as defaults, but allow site-specific overrides.
    LDAP_EDIT_MODE=${LDAP_EDIT_MODE:-"READ_ONLY"}
    LDAP_VENDOR=$(normalize_vendor "${LDAP_VENDOR:-ad}")
    LDAP_USERNAME_ATTRIBUTE=${LDAP_USERNAME_ATTRIBUTE:-"cn"}
    LDAP_RDN_ATTRIBUTE=${LDAP_RDN_ATTRIBUTE:-$LDAP_USERNAME_ATTRIBUTE}
    LDAP_UUID_ATTRIBUTE=${LDAP_UUID_ATTRIBUTE:-"objectGUID"}
    LDAP_USER_OBJECT_CLASSES=${LDAP_USER_OBJECT_CLASSES:-"person, organizationalPerson, user"}
    LDAP_PAGINATION=$(normalize_bool "${LDAP_PAGINATION:-false}")
    LDAP_SEARCH_SCOPE=$(normalize_search_scope "${LDAP_SEARCH_SCOPE:-}")
    LDAP_REFERRAL=$(normalize_referral "${LDAP_REFERRAL:-}")
    LDAP_EMAIL_ATTRIBUTE=${LDAP_EMAIL_ATTRIBUTE:-"mail"}
    LDAP_FIRST_NAME_ATTRIBUTE=${LDAP_FIRST_NAME_ATTRIBUTE:-"givenName"}
    LDAP_LAST_NAME_ATTRIBUTE=${LDAP_LAST_NAME_ATTRIBUTE:-"sn"}
    
    new_uuid() {
        if [ -r /proc/sys/kernel/random/uuid ]; then
            cat /proc/sys/kernel/random/uuid
            return 0
        fi
        if command -v uuidgen >/dev/null 2>&1; then
            uuidgen
            return 0
        fi
        echo "Error: Cannot generate UUID (missing /proc/sys/kernel/random/uuid and uuidgen)" >&2
        exit 1
    }

    PROVIDER_ID=$(new_uuid)
    MAPPER_ID_1=$(new_uuid)
    MAPPER_ID_2=$(new_uuid)
    MAPPER_ID_3=$(new_uuid)
    MAPPER_ID_4=$(new_uuid)
    MAPPER_ID_5=$(new_uuid)
    MAPPER_ID_6=$(new_uuid)
    MAPPER_ID_7=$(new_uuid)
    MAPPER_ID_8=$(new_uuid)

    LDAP_MSAD_MAPPER=
    if [ "$LDAP_VENDOR" = "ad" ]; then
        LDAP_MSAD_MAPPER=$(cat <<EOF
        ,
        {
          "id": "$MAPPER_ID_8",
          "name": "MSAD account controls",
          "providerId": "msad-user-account-control-mapper",
          "subComponents": {},
          "config": {
            "always.read.enabled.value.from.ldap": ["true"]
          }
        }
EOF
)
    fi
    
    # Create LDAP provider configuration
    LDAP_PROVIDER=$(cat <<EOF
{
  "org.keycloak.storage.UserStorageProvider": [{
    "id": "$PROVIDER_ID",
    "name": "ldap",
    "providerId": "ldap",
    "subComponents": {
      "org.keycloak.storage.ldap.mappers.LDAPStorageMapper": [
        {
          "id": "$MAPPER_ID_1",
          "name": "username",
          "providerId": "user-attribute-ldap-mapper",
          "subComponents": {},
          "config": {
            "ldap.attribute": ["$LDAP_USERNAME_ATTRIBUTE"],
            "is.mandatory.in.ldap": ["true"],
            "read.only": ["true"],
            "always.read.value.from.ldap": ["false"],
            "user.model.attribute": ["username"]
          }
        },
        {
          "id": "$MAPPER_ID_2",
          "name": "email",
          "providerId": "user-attribute-ldap-mapper",
          "subComponents": {},
          "config": {
            "ldap.attribute": ["$LDAP_EMAIL_ATTRIBUTE"],
            "is.mandatory.in.ldap": ["false"],
            "read.only": ["true"],
            "always.read.value.from.ldap": ["false"],
            "user.model.attribute": ["email"]
          }
        },
        {
          "id": "$MAPPER_ID_3",
          "name": "first name",
          "providerId": "user-attribute-ldap-mapper",
          "subComponents": {},
          "config": {
            "ldap.attribute": ["$LDAP_FIRST_NAME_ATTRIBUTE"],
            "is.mandatory.in.ldap": ["true"],
            "read.only": ["true"],
            "always.read.value.from.ldap": ["true"],
            "user.model.attribute": ["firstName"]
          }
        },
        {
          "id": "$MAPPER_ID_4",
          "name": "last name",
          "providerId": "user-attribute-ldap-mapper",
          "subComponents": {},
          "config": {
            "ldap.attribute": ["$LDAP_LAST_NAME_ATTRIBUTE"],
            "is.mandatory.in.ldap": ["true"],
            "read.only": ["true"],
            "always.read.value.from.ldap": ["true"],
            "user.model.attribute": ["lastName"]
          }
        },
        {
          "id": "$MAPPER_ID_5",
          "name": "creation date",
          "providerId": "user-attribute-ldap-mapper",
          "subComponents": {},
          "config": {
            "ldap.attribute": ["whenCreated"],
            "is.mandatory.in.ldap": ["false"],
            "always.read.value.from.ldap": ["true"],
            "read.only": ["true"],
            "user.model.attribute": ["createTimestamp"]
          }
        },
        {
          "id": "$MAPPER_ID_6",
          "name": "modify date",
          "providerId": "user-attribute-ldap-mapper",
          "subComponents": {},
          "config": {
            "ldap.attribute": ["whenChanged"],
            "is.mandatory.in.ldap": ["false"],
            "read.only": ["true"],
            "always.read.value.from.ldap": ["true"],
            "user.model.attribute": ["modifyTimestamp"]
          }
        }
        $LDAP_MSAD_MAPPER
      ]
    },
    "config": {
      "pagination": ["$LDAP_PAGINATION"],
      "fullSyncPeriod": ["-1"],
      "startTls": ["false"],
      "connectionPooling": ["false"],
      "usersDn": ["$LDAP_USERS_DN"],
      "cachePolicy": ["DEFAULT"],
      "useKerberosForPasswordAuthentication": ["false"],
      "importEnabled": ["true"],
      "enabled": ["true"],
      "changedSyncPeriod": ["-1"],
      "bindDn": ["$LDAP_BIND_DN"],
      "usernameLDAPAttribute": ["$LDAP_USERNAME_ATTRIBUTE"],
      "bindCredential": ["$LDAP_BIND_CREDENTIAL"],
      "vendor": ["$LDAP_VENDOR"],
      "uuidLDAPAttribute": ["$LDAP_UUID_ATTRIBUTE"],
      "allowKerberosAuthentication": ["false"],
      "connectionUrl": ["$LDAP_CONNECTION_URL"],
      "syncRegistrations": ["true"],
      "authType": ["simple"],
      "krbPrincipalAttribute": ["userPrincipalName"],
      "useTruststoreSpi": ["always"],
      "usePasswordModifyExtendedOp": ["false"],
      "trustEmail": ["false"],
      "userObjectClasses": ["$LDAP_USER_OBJECT_CLASSES"],
      "rdnLDAPAttribute": ["$LDAP_RDN_ATTRIBUTE"],
      "editMode": ["$LDAP_EDIT_MODE"],
      "validatePasswordPolicy": ["false"]
    }
  }]
}
EOF
)

    LDAP_PROVIDER=$(printf '%s' "$LDAP_PROVIDER" | jq \
        --arg searchScope "$LDAP_SEARCH_SCOPE" \
        --arg readTimeout "$LDAP_READ_TIMEOUT" \
        --arg referral "$LDAP_REFERRAL" \
        --arg customUserSearchFilter "$LDAP_USER_FILTER" '
        if $searchScope == "" then . else .["org.keycloak.storage.UserStorageProvider"][0].config.searchScope = [$searchScope] end
        | if $readTimeout == "" then . else .["org.keycloak.storage.UserStorageProvider"][0].config.readTimeout = [$readTimeout] end
        | if $referral == "" then . else .["org.keycloak.storage.UserStorageProvider"][0].config.referral = [$referral] end
        | if $customUserSearchFilter == "" then . else .["org.keycloak.storage.UserStorageProvider"][0].config.customUserSearchFilter = [$customUserSearchFilter] end
    ')
    
    # Use jq to add LDAP provider to the realm configuration. Be robust if .components is missing.
    jq --argjson ldap "$LDAP_PROVIDER" '.components = ((.components // {}) + $ldap)' "$OUTPUT_REALM" > "$OUTPUT_REALM.tmp" && mv "$OUTPUT_REALM.tmp" "$OUTPUT_REALM"
    
    echo "LDAP user federation provider added successfully"
else
    echo "LDAP is disabled - using standard realm configuration"
fi

# Remove JavaScript-based authorization settings to avoid 'Script upload is disabled' on import
if command -v jq >/dev/null 2>&1; then
    echo "Cleaning realm JSON: removing authorizationSettings from clients..."
    jq 'if has("clients") then .clients |= map(del(.authorizationSettings)) else . end' "$OUTPUT_REALM" > "$OUTPUT_REALM.cleaned" \
      && mv "$OUTPUT_REALM.cleaned" "$OUTPUT_REALM"
fi

echo "Realm configuration built successfully at $OUTPUT_REALM"
ls -la "$OUTPUT_REALM"
