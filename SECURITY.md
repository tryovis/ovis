# OVIS application security

## Status of the September 2026 review

On 15 September 2026, the local source tree received an internal security review and regression tests. The review used synthetic identities, in-memory database fixtures and loopback HTTP servers. It identified missing API access controls and led to the changes described below. The 130 regression tests subsequently passed on Windows and in Linux amd64 containers, and the Apollo, Express and frontend Docker builds succeeded. It did not test a deployed hospital installation and is not an independent penetration-test attestation or a certification.

An additional isolated Linux integration test passed ten checks against a fresh MongoDB and a real Keycloak 24.0.3 with a synthetic realm. It exercised production frontend startup, login, token introspection/userinfo, real cohort filtering and name masking, refresh, denial of privilege escalation, account deactivation and logout. All five test containers remained running with zero restarts. No ports were published, and the temporary containers and network were removed afterwards. Apollo/Express used Node 24.19.0; the frontend retained its existing Node 20 Alpine base (tested as 20.20.2). Hospital LDAP, MFA, SMTP, nginx/TLS and import/recovery workflows remain separate integration checks.

The deployment checks and open issues below must be resolved with the operator before treating these changes as a release approved for clinical use.

The 16 September follow-up adds hand-calculated cohort fixtures, independent raw-OMock comparisons and generated Boolean expressions against isolated MongoDB instances. It fixes cohort leakage through patient detail views, incorrect cross-tumor/event conjunctions and exclusions, and invalid or timezone-dependent imported dates/ages. Patient headers and timeline collections now retain the validated cohort restriction. See [filter-lock and OMock verification](docs/testing/filter-locks-and-omock.md) for the tested contracts, reproduction procedure and limits.

Filter translation caches are request-local. Boolean expansion is bounded to 256 alternatives and 20,000 estimated query nodes; excessive expressions return a controlled input error before database selections. These bounds do not replace a deployment-specific capacity or denial-of-service assessment.

## Access policy

- Clinical modes require an active Keycloak access token and an active OVIS database user. Setting `PUBLIC_LOGIN_ENABLED=false` does not disable clinical API authentication.
- Anonymous read access requires both `OVIS_IMPORT_MODE=demo` and `PUBLIC_LOGIN_ENABLED=false`. Only non-sensitive demonstration data may be used in that configuration. Anonymous users cannot administer users or write application state.
- Login-page configuration and legal documents remain publicly readable. They must contain information intended for public display.
- Apollo validates tokens through its configured Keycloak introspection and userinfo endpoints. It checks activity, expiry, client and subject consistency. OVIS roles, active status and assigned cohort restrictions come from the server-side user record on each request. Provider failure denies access.
- `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID` and `KEYCLOAK_CLIENT_SECRET` are operator-controlled server settings. `KEYCLOAK_ISSUER` optionally requires an exact issuer match. The secret is never a browser setting.
- Ordinary users may read their own account and change approved display preferences. Managers may read management information. Administrators may manage ordinary and manager accounts; only super-administrators may manage administrator accounts. The reserved super-administrator account is protected from application-level destructive changes.
- New mutations require an explicit policy. Patient queries combine the assigned cohort with requested filters; direct patient lookups also check membership. Malformed or unsupported restricted operations are denied.
- The existing `pseudonymization` account flag now hides patient first/last names in GraphQL and disallows corresponding name searches, sorts and catalogue suggestions. This is **name masking**, not a complete pseudonymization or anonymization scheme: identifiers, dates and other potentially identifying fields remain.
- `/api/catalogue` and `/api/import-progress` verify the backend session. The former public static catalogue has been removed and its legacy path is blocked by nginx. Administrative collections are excluded from catalogues.
- Accounts with assigned cohorts receive catalogue field definitions, but population-derived value suggestions are withheld to prevent disclosure from other cohorts. Public OPS code suggestions remain available. The API's `getValueOptions` query applies the cohort restriction; a fully scoped catalogue autocomplete remains future work.
- Body-map and diagnosis-chart clicks can use values from their scoped results even when catalogue suggestions are withheld. The insertion retains Lens field metadata and distinct value bindings so personal filters can still be combined and removed individually. A clicked criterion already guaranteed by the assigned cohort is omitted from personal filters; backend enforcement of that cohort remains independent.
- Browser requests and result caches are invalidated on logout. Sensitive responses use `Cache-Control: no-store`.

## Deployment and integration checks

1. Deploy the matching frontend, Apollo, Express authentication service, preprocessing/catalogue generation and proxy/Compose changes together. Build new images from this source; existing published images do not acquire these edits. Apollo and Express use Node 24 images; Apollo's declared minimum for local development is Node 20.
2. The source Compose setup now runs Apollo's source and dependencies from its built image. The old source bind mount and persistent `node_modules` mount were removed so an existing Apollo 4 dependency volume cannot override the updated packages. Existing database volumes are unchanged; old dependency volumes may remain unused. Rebuild the Apollo image after source changes. Do not use `docker compose down -v` to install this update.
3. In a test installation, verify real Keycloak login, refresh, expiry and logout; disabled accounts; user, manager and administrator permissions; attempts to access another cohort; name masking; catalogue reload after account changes; and the base-path/proxy configuration.
4. Express now verifies privileged actions via `OVIS_AUTH_SESSION_URL`, normally `http://ovis-backend-apollo:4001/auth/session`. Keep that service address under operator control. Protect internal service traffic according to the deployment's network boundary; across hosts use protected transport.
5. Password recovery now asks Keycloak to send an expiring `UPDATE_PASSWORD` email. Configure SMTP and the service account's required permissions, then verify receipt and one-time use in staging. LDAP-backed accounts may need the institution's own recovery process. The legacy code-check and password-write endpoints return HTTP 410.
6. Regenerate the catalogue and verify that old published catalogue copies are removed from deployment assets and caches. Existing generated catalogues are also filtered by the authenticated route.
7. Confirm enforced MFA, TLS configuration, backup restoration, separate log protection, incident detection and incident reporting with the institution. These are properties of the deployed system and its operating processes.

## Open work and limitations

### Identity-provider bootstrap — high priority

The existing Keycloak realm template contains private signing-key material, and its bootstrap copies that template. Its default root password is predictable. The template disables brute-force protection and event/admin-event logging, and the Dockerfile pins Keycloak 24.0.3. This review did not modify the template or exercise a hospital's identity provider; the Linux integration test used a separate synthetic realm without the template's signing keys.

Before clinical rollout, replace shared/default credentials and shared signing keys through the operator's Keycloak procedure, review existing sessions and potentially exposed credentials, enable appropriate protective settings, and validate an update to a supported Keycloak release. Inspect actual installations rather than assuming their state matches the template. Never publish real credentials or signing keys in a report or issue.

### Browser session architecture

Access and refresh tokens remain in `localStorage`, and the login path still uses the password grant. Plan an identity-provider redirect flow with authorization code/PKCE and appropriately protected sessions. The HTML-escaping fixes cover identified rendering paths; they do not establish that all possible script-injection paths are absent.

### Data handling and operational scope

Upstream file transfer, cron deletion semantics, storage encryption, database/backups, infrastructure exposure and full recovery were outside this patch. The importer regression checks cover synthetic data transformation and selected calculations. Name masking does not remove the need to protect health data. Query cost, resource exhaustion, multi-replica rate limits, container/OS dependencies and all third-party frontend packages have not received a complete assessment.

An independent assessment should cover the exact release and a representative deployment, with written scope, synthetic test data where possible, evidence, remediation and retesting. [OWASP WSTG](https://wstg.owasp.org/) provides a useful web-testing reference. Apollo 5 migration requirements are documented by [Apollo](https://www.apollographql.com/docs/apollo-server/migration).

## Local regression commands

Run from the named service directory after `npm ci`, with Node 24. These suites do not require real patient data or a live identity provider.

Apollo (`Backend/Apollo`):

```sh
node --test accessControl.test.js astUtils.test.js astTranslator.test.js resolver/studyPatientTable.test.js runtimeIndexes.test.js differential/referenceEvaluator.test.mjs resolver/platform.test.js resolver/analytics.test.js resolver/cox.test.js resolver/coxData.test.js resolver/coxService.test.js
npm audit
```

Authentication (`Backend/Authentication/express`):

```sh
npm test
npm audit
```

Frontend (`Frontend`):

```sh
node --test src/security-regression.test.mjs src/graphQl/table-page.test.mjs src/graphQl/table-page-parallel.test.mjs src/graphQl/request-cache.test.mjs
npm run check
npm run build
```

Build/check tools load environment files in their working directory. Use a dedicated test checkout with synthetic configuration; do not run against a directory containing clinical export files or production credentials.

Chart/filter interaction regressions (run from the repository root with frontend dependencies installed):

```sh
node Frontend/test-filter-clicks.mjs
```

The runner selects 14 regression files and resolves their paths relative to itself, so an absolute runner path also works from another directory. It covers actual chart and selector handlers with empty and populated catalogue criteria; scoped field identity; individual removal and combined AND/OR selections; negative filters; numeric/date ranges; typed and empty AST roundtrips; and Quicktools initialization, history, upload and listener cleanup. The tests execute the installed Lens functions after the same compatibility transformation used by the application. Its current pass/fail count comes from Node's test summary rather than a fixed historical total.

A separate isolated MongoDB run passed 12 tests (one suite and 11 combination cases) on 16 September 2026. It executed the real authorization wrapper and AST translator, compared returned synthetic tumor IDs with explicit expectations and an independent reference evaluator, and verified that C30-C39 remains mandatory with C34/C32 refinements, gender selections/exclusions, disjoint age intervals, additional OR branches and same-key fields in different systems. No backend production change was needed for those cases.

See [filter-click testing](docs/testing/filter-clicks.md) for the scope, reproducible isolated MongoDB commands and the separate browser-test instructions. These checks do not replace acceptance testing on the deployed clinic build.
