# Express API for Keycloak integration

This service exposes credential/token operations and restricted user management at `/api/keycloak`.

## Configuration

Use a supported Node.js release (Node 22 or newer) and install with `npm ci`. Start with `npm start` and run the isolated regression suite with `npm test`.

Required configuration:

- `KEYCLOAK_URL`, `KEYCLOAK_REALM`: trusted internal identity-provider address and realm.
- `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`: confidential login client.
- `KEYCLOAK_ADMIN_CLIENT_ID`, `KEYCLOAK_ADMIN_CLIENT_SECRET`: server-only service account with the necessary user-management permissions.
- `OVIS_AUTH_SESSION_URL`: trusted internal Apollo session-verification endpoint; defaults to `http://ovis-backend-apollo:4001/auth/session`.
- `PORT`: listener port, default `5000`.
- `OVIS_PUBLIC_ORIGIN`: browser-facing origin when using a reverse proxy.

Do not expose client secrets to the browser. Shared Basic credentials are no longer an authorization mechanism. Keep the session-verification URL in operator-controlled configuration and use the internal service network (or authenticated TLS if routed across hosts).

## API authorization

| Endpoint | Required proof |
| --- | --- |
| `POST /login` | User's username and password; Keycloak validates them |
| `POST /refresh`, `POST /logout` | Refresh token in `refresh_token` |
| `POST /introspect`, `POST /userinfo` | Access token in `token`; Keycloak validates it |
| `POST /createuser` | `Authorization: Bearer <access token>` for an active OVIS `admin` or `super-admin` |
| `PUT /user/:email` | Bearer token for the same user; only harmless profile attributes |
| `POST /create-reset-code` | Public recovery request with `email`; sends a Keycloak recovery link |
| `POST /check-reset-code`, `PUT /reset-password` | Retired; always HTTP 410 |

Privileged routes ask Apollo to verify the token and current application account. Anonymous demo sessions, inactive accounts, ordinary users on administrator operations, and failed verification are denied. CORS and Referer checks do not grant access.

Creation accepts only `username`, `email`, `firstName`, `lastName`, `enabled`, and an optional single password credential. Email starts unverified, supplied initial passwords are temporary, and caller-supplied roles/custom attributes are rejected. OVIS application roles are managed through the authorized application API.

Profile changes address the verified Keycloak subject directly and require the path email to match that subject. Supported attributes are `firstName`, `lastName`, `phone`, `organization`, `department`, `title`, and `locale`, each a single string array. Authorization attributes such as `ovisFilter` are preserved and cannot be self-edited here.

## Password recovery migration

Configure and verify SMTP and the browser-facing URL in Keycloak. The user-management service account must be allowed to search users and send required-action emails. LDAP installations must check whether their identity provider permits password changes; route unsupported cases to the institution's password recovery process.

`POST /create-reset-code` now responds with HTTP 202 and a generic message before user lookup. It never returns a code, token, reset link, or user-existence result. Keycloak sends an `UPDATE_PASSWORD` link with a 900-second lifetime and handles its proof and consumption. The old local six-digit-code flow has been removed. This is an API contract change for clients that consumed `reset_code`.

Missing SMTP/permissions yield a generic response to avoid revealing accounts and a redacted service warning. Confirm actual mail delivery in the test installation before rollout.

Login is limited to 60 requests per minute per connection source; recovery to 10 per minute plus one send per email per minute. Counters are bounded and local to the process. Configure shared ingress limits for multiple replicas and Keycloak brute-force protection. Reverse proxies share a connection-source limit unless a deliberately trusted proxy policy is configured; client-supplied forwarding headers are not trusted by default.

## Regression tests and limitations

`npm test` starts Express on a random loopback port. Identity and Keycloak endpoints are fully mocked with synthetic users. It covers unauthenticated, invalid, ordinary, anonymous and administrator callers; self-versus-other profile edits; authorization-attribute injection; recovery endpoint retirement; rate limits; and secret-free login logging.

These tests establish application behavior under controlled provider responses. They do not attest the deployed Keycloak roles, SMTP delivery, proxy configuration, token validation inside Apollo, or a production installation's security.
