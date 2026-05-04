FROM ghcr.io/jqlang/jq:1.7.1 AS jq

FROM quay.io/keycloak/keycloak:24.0.3

USER root

# Provide jq without relying on a package manager in the Keycloak image
COPY --from=jq /jq /usr/bin/jq

# Copy realm bootstrap scripts
COPY build-realm.sh /build-realm.sh
COPY keycloak-entrypoint.sh /opt/keycloak/bin/ovis-entrypoint.sh
RUN chmod +x /build-realm.sh /opt/keycloak/bin/ovis-entrypoint.sh

# Runtime realm, certs, themes, and config are bind-mounted at startup.

USER keycloak

# Default entrypoint is the standard Keycloak entrypoint unless compose overrides it.
