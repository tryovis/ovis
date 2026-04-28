FROM ghcr.io/jqlang/jq:1.7.1 AS jq

FROM quay.io/keycloak/keycloak:24.0.3

USER root

# Provide jq without relying on a package manager in the Keycloak image
COPY --from=jq /jq /usr/bin/jq

# Copy realm build script
COPY build-realm.sh /build-realm.sh
RUN chmod +x /build-realm.sh

# Runtime scripts only (realm, certs, themes, config are bind-mounted at runtime)
# This image is intended to be used with the keycloak-config sidecar
# for dynamic realm import, or with a pre-built realm file.

USER keycloak

# Default entrypoint is the standard Keycloak entrypoint
# The keycloak-config sidecar handles dynamic realm configuration
