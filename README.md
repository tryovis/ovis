# OVis

## Getting Started

### Prerequisites

*   Docker and Docker Compose installed.
*   Git installed.
*   Credentials for the FHIR server (if applicable, see Configuration).

### Running the Project

1.  **Clone and Configure:**
    ```bash
    git clone https://github.com/tryovis/ovis.git
    cd ovis
    cp .env.example .env
    ```
    Edit `.env` for your environment. See [Configuration](#configuration) for all variables.

2.  **Start Services:**
    ```bash
    # Production mode (optimized, pre-built)
    docker compose up --build -d
    
    # Development mode (hot reload, Vite dev server)
    docker compose --profile dev up --scale ovis-frontend=0 --build -d
    ```

3.  **Access Application:**
    - **Frontend:** `http://localhost/`
    - **Keycloak:** `http://localhost/keycloak`
    
    **Direct Mode** (NGINX_PROXY_MODE=false):
    - **Frontend:** `http://localhost:5173`
    - **Keycloak:** `http://localhost:8252/keycloak`

    > GraphQL is an internal API route used by the frontend/backend integration and is not a user-facing entrypoint.

4.  **Stop Services:**
    ```bash
    # Production mode
    docker compose down
    
    # Development mode
    docker compose --profile dev down
    
    # Clean restart (removes volumes)
    docker compose down -v
    # OR for development with volumes
    docker compose --profile dev down -v
    ```

## Architecture Overview

OVIS follows a containerized microservices architecture with core application services orchestrated using Docker Compose:

1. **nginx** - Reverse proxy for unified access (optional)
2. **ovis-frontend** (Port 5173) - SvelteKit UI application with production/development modes
3. **ovis-backend-apollo** (Port 4001) - Apollo GraphQL API server
4. **ovis-backend-database-mongodb** - MongoDB database
5. **ovis-backend-mongodb-data-preprocessing** - Data processing pipeline and catalog generation
6. **ovis-backend-data-import** - Data adapter (CCP/DEMO/ONKOSTAR)

### Access Modes

**Proxy Mode** (NGINX_PROXY_MODE=true - default):
- All services accessed through nginx on ports 80/443
- Simplified URLs without port numbers
- Easy SSL/HTTPS configuration
- Recommended for production

**Direct Mode** (NGINX_PROXY_MODE=false):
- Services accessed directly on their individual ports
- Useful for development and debugging
- No SSL support in direct mode

### Data Flow Pipeline
```
Data Source → Data-Import → omock.json → Data-Preprocessing → ovis-catalogue.json
(FHIR/DEMO/ONKOSTAR)                ↓
                        MongoDB ← GraphQL Resolvers ← Frontend Components
                                         ↓
                                      nginx (optional reverse proxy)
```

### Key Components:

*   **Frontend:** A SvelteKit-based user interface for medical data visualization.
*   **Backend:**
    *   **Apollo GraphQL:** Handles API requests and interacts with the database.
    *   **MongoDB Database:** Stores application data and serves as the data persistence layer.
    *   **Data Import Pipeline:** Services responsible for fetching, preprocessing, and cataloging medical data.
        *   **CCP Adapter:** Fetches data from FHIR servers and outputs omock.json.
        *   **Data Preprocessing:** Processes the fetched data and creates the data catalog.

## Folder Structure

The project is organized into the following main directories:

```
├── Backend/
│   ├── Apollo/           # GraphQL API resolver service (Apollo Server)
│   ├── Authentication/
│   │   ├── express/      # Express-based authentication API
│   │   ├── Keycloak/     # Keycloak realm configuration
│   │   └── data/         # Authentication data storage
│   ├── Data-Import/
│   │   ├── ccp/          # FHIR server data adapter
│   │   ├── demo/         # Demo data with omock.json
│   │   └── onkostar/     # ONKOSTAR database adapter
│   └── MongoDB/          # MongoDB initialization and data preprocessing
│       └── Preprocessing/ # Data transformation scripts
├── Frontend/             # SvelteKit frontend application
├── Setup/
│   ├── nginx/            # Nginx configuration templates
│   └── Certificates/     # SSL certificates directory
├── compose.yaml          # Docker Compose configuration
├── .env.example          # Environment variables template (30 variables)
└── README.md             # This file
```

### New Structure

The new architecture consolidates the frontend and backend into a single repository while separating the backend into distinct, specialized microservices. This approach makes the system more maintainable, scalable, and allows for independent development of each component.

The mapping between old and new components:
- **Frontend**: Previously `ovis-svelte`, now in the `Frontend` directory
- **Backend**: Replaces `adt-mon-gql` with a more modular structure:
  - **Database**:
    - **MongoDB**: Contains the database initialization script (`initdb.js`)
  - **Data-Import**: Handles all data import operations, separated into:
    - **CCP-Adapter**: Fetches data from CCP/FHIR sources
    - **Credos-Adapter**: Fetches data from Credos
    - **Data-Processing**: Performs data preprocessing operations (e.g., using scripts in a `prep` subdirectory) and creates the catalog (e.g., using `prep/createCatalog.mjs`).
    - **ONKOSTAR-Adapter**: Fetches data from ONKOSTAR
  - **Resolver**:
    - **GraphQL**: Contains all GraphQL implementation including resolvers, schema, and utilities:
      - `resolver & schema`: GraphQL schema and resolvers
      - `js-Dateien`: JavaScript data structures and utilities
      - `index.js`: Main entry point for the GraphQL service
      - `utils.js`: Utility functions
      - `monConnector.js`: MongoDB connection utilities

Each service now has a clearer responsibility and can be developed, tested, and deployed independently while still working together through Docker Compose orchestration. Shared code and utilities have been organized to reduce duplication and improve consistency.

## Services (compose.yaml)

The `compose.yaml` file defines the following services:

1.  **`nginx`** (optional - only runs when NGINX_PROXY_MODE=true)
    *   **Purpose:** Reverse proxy providing unified access to all services.
    *   **Image:** `nginx:1`
    *   **Ports:** `80:80` and `443:443` (configurable via NGINX_HTTP_PORT/NGINX_HTTPS_PORT)
    *   **Features:**
        *   Routes `/` and `/api/graphql` to the frontend app, which proxies GraphQL upstream, plus `/keycloak` to Keycloak
        *   SSL/HTTPS support with certificates from `Setup/Certificates/`
        *   Dynamic configuration based on environment variables
    *   **Configuration:** Uses template at `Setup/nginx/nginx.conf.template`

2.  **`ovis-frontend`** (Production)
    *   **Purpose:** Serves the optimized SvelteKit frontend application.
    *   **Build Context:** `./Frontend`
    *   **Port:** Loopback-only on `127.0.0.1:5173` for direct/local access; nginx remains the public entrypoint in proxy mode
    *   **Environment:** URLs and VITE variables configured at build time
    *   **Volumes:** Mounts the generated catalog file for frontend consumption.

3.  **`ovis-frontend-dev`** (Development - profile: dev)
    *   **Purpose:** Serves the SvelteKit frontend with Vite dev server and hot reload.
    *   **Build Context:** `./Frontend` (development target)
    *   **Port:** `5173:5173`
    *   **Environment:** VITE variables configured at runtime
    *   **Volumes:** Mounts source code for live updates
    *   **Network:** Uses alias `ovis-frontend` for nginx compatibility

4.  **`ovis-backend-apollo`**
    *   **Purpose:** The main backend API endpoint using Apollo GraphQL.
    *   **Build Context:** `./Backend/Apollo`
    *   **Port:** Internal service on port `4001` (the frontend reaches it through `/api/graphql`)
    *   **Environment:** Defines ports, database connection (`ADDRESS`, `DB`), CORS settings.
    *   **Depends On:** Database, Data Preprocessing service.
    *   **Development:** Uses `node --watch` for automatic restarts on code changes. Mounts local source code (`./Backend/Apollo:/app`).

5.  **`ovis-backend-database-mongodb`**
    *   **Purpose:** Provides the MongoDB database instance.
    *   **Image:** `docker.verbis.dkfz.de/ovis/ovis-backend-mongodb:latest` (or the registry/tag selected in the compose configuration).
    *   **Initialization:** Uses `./Backend/MongoDB/initdb.js` to initialize the database on first run.

6.  **`ovis-backend-mongodb-data-preprocessing`**
    *   **Purpose:** Preprocesses data fetched by CCP adapter and generates the data catalog.
    *   **Image:** `node:23`
    *   **Depends On:** `ovis-backend-data-import`.
    *   **Logic:** Waits for `/shared/omock.json` (output from the CCP adapter), copies it to `./Preprocessing/omock.json`, runs `./Preprocessing/preprocessor.mjs` for data preprocessing, and then runs `./createCatalog.mjs` to generate `ovis-catalogue.json`. Uses a shared volume `shared_data`.
    *   **Healthcheck:** Checks if `/app/ovis-catalogue.json` has been created.
    *   **Volumes:** Mounts `./Backend/MongoDB` for access to preprocessing scripts.

7.  **`ovis-backend-data-import`**
    *   **Purpose:** Imports data based on `OVIS_IMPORT_MODE` (`demo`/`ccp`/`onkostar`).
    *   **Build Context:** `./Backend/Data-Import/${OVIS_IMPORT_MODE}`
    *   **Modes:**
        *   **CCP:** Fetches from FHIR server (requires FHIR_* variables)
        *   **DEMO:** Uses demo data with omock.json
        *   **ONKOSTAR:** Connects to ONKOSTAR database (requires ONKOSTAR_DB_* variables)
    *   **Output:** Places `omock.json` in the `shared_data` volume.

### Volumes

*   **`shared_data`:** Used for sharing data between the data import services
*   **`node_modules`:** Used as a cache for Node.js dependencies
*   **`mongo_db`:** MongoDB data persistence
*   **`mongo_conf`:** MongoDB configuration persistence

### MongoDB Backups & Restore

Two helper services keep your MongoDB data resilient:

*   **`mongodb-backup`** runs a lightweight `mongo` container that executes `Setup/Backups/scripts/mongodb-backup.sh` on a schedule. It waits for the primary database to accept connections and then dumps the configured database/collection pairs into timestamped folders under `Setup/Backups/mongodb/<YYYYMMDD-HHMMSS>`. Set these environment variables in `.env` as needed:
    *   **`MONGO_HOST`** – MongoDB host name inside the compose network (default `ovis-backend-database-mongodb`).
    *   **`MONGO_BACKUP_DBS`** – Comma-separated database names to export (default `onc_test`).
    *   **`MONGO_BACKUP_COLLECTIONS`** – Comma-separated collections to export from each database (default `user`).
    *   **`MONGO_BACKUP_RETENTION`** – Number of snapshots to retain; set to `0` to disable pruning (default `0`).
    *   **`BACKUP_INTERVAL_SECONDS`** – Delay between backups in seconds (default `21600`, i.e. six hours).
*   **`mongodb-restore`** is a one-shot init container that runs on every `docker compose up`. It scans `Setup/Backups/mongodb` for the most recent snapshot and restores it automatically whenever the target collections are empty (e.g. after `docker compose down -v`). Configure it with:
    *   **`MONGO_RESTORE_DBS`** – Databases to rehydrate (default `onc_test`).
    *   **`MONGO_RESTORE_COLLECTIONS`** – Collections that must exist before skipping restore (default `user`).

With both services enabled, a fresh stack start will bring MongoDB back to its latest snapshot before the GraphQL/API containers connect. Manual restores remain available when you want to seed staging or experiment locally:

```bash
# Restore the user collection from a specific snapshot
mongorestore \
  --host ovis-backend-database-mongodb \
  --db onc_test \
  --collection user \
  Setup/Backups/mongodb/<TIMESTAMP>/onc_test/user.bson

# Restore the full onc_test database
mongorestore \
  --host ovis-backend-database-mongodb \
  --db onc_test \
  --drop \
  Setup/Backups/mongodb/<TIMESTAMP>/onc_test
```

Always stop (or at least quiesce) dependent services before restoring production data manually, and periodically verify snapshots by restoring into a staging instance.

## Configuration

OVIS uses environment variables for configuration, simplified from 50+ to just 30 essential variables. Copy `.env.example` to `.env` and configure as needed.

### Core Settings
*   **`APP_DOMAIN`**: Hostname where the application is hosted (default: `localhost`)
*   **`OVIS_IMPORT_MODE`**: Data import mode - `demo`, `ccp`, or `onkostar`
*   **`PUBLIC_LOGIN_ENABLED`**: Enable/disable authentication - `true` or `false`

### Service Ports
Port numbers for direct access (when NGINX_PROXY_MODE=false):
*   **`FRONTEND_PORT`**: Frontend service (default: `5173`)
*   **`APOLLO_PORT`**: GraphQL API (default: `4001`)
*   **`CREDOS_PORT`**: Credos service (default: `4000`)
*   **`EXPRESS_PORT`**: Express auth service (default: `8251`)
*   **`KEYCLOAK_PORT`**: Keycloak service (default: `8252`)

### Authentication
*   **`EXPRESS_AUTH_USERNAME`**: Username for Express API authentication
*   **`EXPRESS_AUTH_PASSWORD`**: Password for Express API authentication
*   **`KEYCLOAK_ADMIN`**: Keycloak admin username
*   **`KEYCLOAK_ADMIN_PASSWORD`**: Keycloak admin password
*   **`KEYCLOAK_REALM`**: Keycloak realm name (default: `ovis`)
*   **`KEYCLOAK_CLIENT_ID`**: OAuth client ID
*   **`KEYCLOAK_CLIENT_SECRET`**: OAuth client secret
*   **`KEYCLOAK_ADMIN_CLIENT_ID`**: Admin client ID
*   **`KEYCLOAK_ADMIN_CLIENT_SECRET`**: Admin client secret

### Database Configuration
*   **`DB`**: MongoDB database name (default: `onc_test`)
*   **`MONGO_VER`**: MongoDB version (default: `latest`)
*   **`POSTGRES_DB`**: PostgreSQL database for Keycloak
*   **`POSTGRES_USER`**: PostgreSQL username
*   **`POSTGRES_PASSWORD`**: PostgreSQL password

### Nginx Proxy Configuration
*   **`NGINX_PROXY_MODE`**: Enable nginx reverse proxy - `true` (recommended) or `false`
*   **`NGINX_SSL_ENABLED`**: Enable HTTPS - `true` or `false`
*   **`NGINX_HTTP_PORT`**: HTTP port (default: `80`)
*   **`NGINX_HTTPS_PORT`**: HTTPS port (default: `443`)
*   **`NGINX_WORKER_PROCESSES`**: Worker processes (default: `auto`)
*   **Certificates directory**: `./Setup/Certificates/` with `cert.pem` and `privkey.pem`

### External Integrations

#### FHIR Server (for CCP mode)
*   **`FHIR_SERVER_URL`**: FHIR server endpoint URL
*   **`FHIR_USERNAME`**: FHIR authentication username
*   **`FHIR_PASSWORD`**: FHIR authentication password
*   **`ICD10_FILTER`**: Optional ICD-10 code filter

#### ONKOSTAR Database (for ONKOSTAR mode)
*   **`ONKOSTAR_DB_HOST`**: Database host
*   **`ONKOSTAR_DB_PORT`**: Database port (default: `3306`)
*   **`ONKOSTAR_DB_USER`**: Database username
*   **`ONKOSTAR_DB_PASSWORD`**: Database password

#### 3CT Database
*   **`DCT_DB_HOST`**: Database host
*   **`DCT_DB_PORT`**: Database port (default: `3306`)
*   **`DCT_DB_USER`**: Database username
*   **`DCT_DB_PASSWORD`**: Database password
*   **`DCT_DB_NAME`**: Database name

### Optional: Proxy Configuration for Restricted Networks
Only set proxy variables if your server needs an outbound corporate proxy. Otherwise leave them empty.

*   **`OVIS_HTTP_PROXY`**: HTTP proxy URL (example: `http://proxy.example.org:8080`)
*   **`OVIS_HTTPS_PROXY`**: HTTPS proxy URL (example: `http://proxy.example.org:8080`)
*   **`OVIS_NO_PROXY`**: Comma-separated hosts/domains that should bypass the proxy (example: `localhost,127.0.0.1,::1,keycloak,keycloak-config,postgres,nginx,express-auth,ovis-frontend,ovis-frontend-dev,ovis-backend-apollo,ovis-backend-database-mongodb,ovis-backend-mongodb-data-preprocessing,ovis-backend-data-import,mongodb-restore,mongodb-backup,.example.org,.example.net,.svc,.cluster.local`)

These values are consumed by build/runtime-sensitive services (frontend, apollo, express-auth, data-import, preprocessing, keycloak-config). No proxy is used unless you explicitly set them.

### GraphQL Route Handling
Standard setups do not require any manual GraphQL endpoint configuration. OVIS resolves the internal GraphQL route automatically by deployment mode.

### Removed Variables
The following variables are no longer needed in the main OVIS compose stack:
- `VITE_EXPRESS_BASEURL` - Constructed based on proxy mode and SSL settings
- `ADDRESS` - Always `mongodb://ovis-backend-database-mongodb:27017`; rename any legacy misspelled Mongo override to this key
- All `NGINX_*_UPSTREAM` variables - Hardcoded to container names

## Development

### Quick Start
```bash
# Copy and configure environment
cp .env.example .env
# Edit .env with your settings

# Development mode (for active development)
docker compose --profile dev up --scale ovis-frontend=0 --build -d
```

### Development vs Production Modes

**Production Mode:**
- Pre-built, optimized SvelteKit application
- Faster startup, smaller memory footprint
- Use for testing, staging, production deployments
- Command: `docker compose up --build -d`

**Development Mode:**
- Vite dev server with hot reload
- Live code updates without restart
- Slower startup, higher memory usage
- Use for active frontend development
- Command: `docker compose --profile dev up --scale ovis-frontend=0 --build -d`

### Development Tips
*   **Frontend Hot Reload:** Development mode mounts source code for live updates
*   **Backend Restart:** Uses `node --watch` for automatic restarts on code changes
*   **Demo Mode:** Use `OVIS_IMPORT_MODE=demo` for development without external dependencies
*   **SSL Setup:** Place certificates in `Setup/Certificates/` and set `NGINX_SSL_ENABLED=true`

### Authentication Setup

OVIS creates a pre-configured root user for immediate access, but the password must be supplied via `.env`.

#### Default User Credentials (without LDAP)

The system includes a pre-configured admin user:
- **Username**: value of `OVIS_ROOT_USERNAME` (default: `ovis-root`)
- **Password**: value of `OVIS_ROOT_PASSWORD` in `.env` (**required**, no built-in default)

Set `OVIS_ROOT_PASSWORD` in `.env` before the first start. Compose will fail fast if it is missing or empty.

#### Login Access

1. **Start Services**
   ```bash
   docker compose up --build -d
   ```

2. **Wait for Services to Initialize** (2-3 minutes)
   ```bash
   # Check if Keycloak is ready
   docker logs ovis-keycloak
   # Look for "Started" messages
   ```

3. **Login to Application**
   - Go to `http://localhost/` (or `http://localhost:5173` in direct mode)
   - **Username**: value of `OVIS_ROOT_USERNAME` in `.env`
   - **Password**: value of `OVIS_ROOT_PASSWORD` in `.env`

#### Manual Keycloak Admin Access (Optional)

If you need to access Keycloak admin console:

1. **Access Keycloak Admin Console**
   - **Proxy Mode**: `http://localhost/keycloak/admin`
   - **Direct Mode**: `http://localhost:8252/keycloak/admin`
   - **Login**: use `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` from `.env`

2. **Switch to OVIS Realm**
   - Click dropdown (top-left, shows "master")
   - Select **"ovis"**

To add a new user to OVIS, follow these steps:

#### **A. Create the User in OVIS Frontend**

1. **Navigate to User Management:**
   - In the OVIS frontend, go to the **User Management** section.
2. **Create the User:**
   - Scroll to the **Create User** area.
   - Enter the desired **username** for the new user.
   - Click **Submit**.
   - The user will be created in both OVIS and Keycloak, but will be **inactive** by default.

#### **B. Set Up the User in Keycloak**

1. **Open Keycloak Admin Console:**
   - Go to the Keycloak admin console.
   - Navigate to **Users** and click **Add User**.
2. **Fill in User Details:**
   - **Username:** Enter the exact username you used in OVIS.
   - **Email Verified:** Check this box.
   - **Email/First Name/Last Name:** You can use dummy values if needed.
   - Click **Create**.
3. **Set User Password:**
   - After creating the user, select them from the list.
   - Go to the **Credentials** tab.
   - Set a password for the user.
   - Click **Save**.
4. **Clear Required Actions:**
   - Go to the **Required Actions** tab.
   - Uncheck any pending actions (such as `UPDATE_PASSWORD`).
   - Click **Save**.

#### **C. Activate the User in OVIS**

1. Return to the OVIS frontend **User Management** section.
2. Find the new user and use the **Status** button to change their status to **active**.

The user can now log in with their credentials.

#### Common Issues

**"Invalid user credentials" Error:**
- Cause: Incorrect username/password combination
- Fix: Use `OVIS_ROOT_USERNAME` / `OVIS_ROOT_PASSWORD` from `.env` (`OVIS_ROOT_PASSWORD` is required)

**Connection Errors:**
- Ensure all services are running: `docker ps`
- Check service logs: `docker logs ovis-keycloak`

**Keycloak Not Ready:**
- Wait for initialization to complete (2-3 minutes)
- Check logs for "Started" messages

## User Creation and Role Management

OVIS uses a dual-system approach: **OVIS handles application-level user management** while **Keycloak handles authentication**. This requires coordinated setup across both systems.

### User Creation Process

#### Step 1: Create User in OVIS Frontend
1. **Login as admin/super-admin** to OVIS
2. **Navigate to User Management** section
3. **Enter user identifier** (usually email address)
4. **Click Submit** → Creates user in MongoDB with:
   - Role: `"user"` (default)
   - Status: `"inactive"` (must be activated later)

#### Step 2: Create User in Keycloak (Manual)
1. **Access Keycloak Admin Console**:
   - URL: `http://localhost/keycloak/admin` (proxy mode)
   - Login: `Ovis_kyclk_admin` / `test`

2. **Switch to OVIS Realm**:
   - Click dropdown (top-left, shows "master")
   - Select **"ovis"**

3. **Create New User**:
   - Navigate: **Users** → **Create**
   - Fill required details:
     - **Username**: Same as OVIS identifier
     - **Email**: User's email address
     - **First/Last Name**: User's name
     - **Email Verified**: ON
     - **Enabled**: ON
   - Click **Save**

4. **Set Password**:
   - Go to **Credentials** tab
   - Click **Set Password**
   - Enter secure password
   - **CRITICAL**: Set **"Temporary"** to **OFF**
   - Click **Save**

5. **Clear Required Actions** (if any appear):
   - Go to **Required Actions** tab
   - **Uncheck** all pending actions
   - Click **Save**

#### Step 3: Activate User in OVIS
1. **Return to OVIS User Management**
2. **Find the new user** in the table
3. **Click status button** to change "inactive" → "active"
4. **User can now login** with their credentials

### Role Management System

#### Role Hierarchy (lowest to highest):
```
user → manager → admin → super-admin
```

#### Permission Matrix:
| Current Role | Can Promote | Can Demote | Can Delete |
|-------------|-------------|------------|------------|
| **super-admin** | manager→admin | admin→manager, manager→user | admin, manager, user |
| **admin** | user→manager | manager→user | manager, user |
| **manager** | none | none | none |
| **user** | none | none | none |

#### Role Assignment:
1. **In OVIS Interface**:
   - Use ▲ (promote) and ▼ (demote) buttons in User Management table
   - Buttons appear based on your current role permissions

2. **Role Promotion Examples**:
   - Admin can promote: user → manager
   - Super-admin can promote: user → manager → admin
   - Cannot skip role levels

3. **In Keycloak** (optional):
   - Users → Select user → **Role Mapping**
   - Assign realm roles: `default-roles-ovis`
   - Add custom roles as needed

### Why Manual Setup is Required

- **Security by Design**: Prevents unauthorized account creation
- **Separation of Concerns**: OVIS manages app permissions, Keycloak handles authentication
- **No Automatic Sync**: Database users and Keycloak users are managed separately
- **Fine-grained Control**: Admins control exactly who gets access

### Common Issues and Solutions

**User exists in OVIS but can't login:**
- Cause: Missing Keycloak account
- Fix: Create corresponding Keycloak user (Step 2 above)

**Role promotion buttons not visible:**
- Cause: Insufficient permissions
- Fix: Check your role level and permission matrix

**User status shows "inactive":**
- Cause: User not activated in OVIS
- Fix: Click status button to activate user

**Can't see user management interface:**
- Cause: Not logged in as admin/super-admin
- Fix: Login with admin credentials or request role promotion

### Best Practices

1. **Always set passwords as non-temporary** in Keycloak
2. **Activate users immediately** after creation
3. **Follow role hierarchy** - don't skip levels
4. **Test login** immediately after user setup
5. **Document user roles** for your organization
6. **Regular cleanup** of inactive/unused accounts

## Dynamic Catalogue System

OVIS features a dynamic catalogue loading system that automatically updates search criteria and filtering options without requiring container restarts.

### How It Works

1. **Data Processing**: The `ovis-backend-mongodb-data-preprocessing` service generates the catalogue from MongoDB data
2. **Shared Volume**: A Docker volume (`catalogue_volume`) shares the catalogue between containers
3. **Automatic Detection**: Frontend polls for changes every 30 seconds and updates reactively
4. **Live Updates**: Any catalogue modifications are automatically detected and served to users

### Manual Catalogue Updates

You can edit the catalogue directly while containers are running:

```bash
# Edit catalogue content directly in container
docker exec ovis-ovis-backend-mongodb-data-preprocessing-1 bash -c \
  "sed -i 's/\"name\": \"TODO\"/\"name\": \"CUSTOM_LABEL\"/1' /app/generated/ovis-catalogue.json"

# Trigger new catalogue generation
docker exec ovis-ovis-backend-mongodb-data-preprocessing-1 node ./createCatalog.mjs

# Any file modification method works:
# - Direct editing with sed, awk, etc.
# - Copying new catalogue files
# - External scripts updating the file
```

### Verification

Check if updates are working:

```bash
# Get current timestamp
curl -s http://localhost:5173/api/catalogue | jq '.timestamp, .source'

# After making changes, timestamp will automatically update
# Frontend will detect changes within 30 seconds
```

### Features

- ✅ **Zero Downtime Updates**: No container restarts required
- ✅ **Real-Time Sync**: Changes propagate within 30 seconds  
- ✅ **Works in All Modes**: Development and production modes
- ✅ **Any Edit Method**: Direct file edits, script updates, or regeneration
- ✅ **Graceful Fallback**: Falls back to static catalogue if dynamic unavailable

### Troubleshooting
*   **Port Conflicts:** Change ports in `.env` if defaults are in use
*   **SSL Issues:** Ensure certificate files exist and have correct permissions
*   **Authentication:** Set `PUBLIC_LOGIN_ENABLED=false` to disable during development
*   **Data Import:** Check logs with `docker logs ovis-backend-data-import` for import issues
*   **Catalogue Not Updating:** Check API endpoint `/api/catalogue` for timestamps and errors


### Preprocessing Service Self-Contained Build

The preprocessing service (`ovis-backend-mongodb-data-preprocessing`) is now built as a self-contained image with all dependencies baked in at build time. This eliminates race conditions that previously occurred when preprocessing relied on a shared `node_modules` volume.

**Smoke Test for Fresh-Start Environments (ONKOSTAR mode):**

```bash
OVIS_IMPORT_MODE=onkostar docker compose down -v && OVIS_IMPORT_MODE=onkostar docker compose up --build -d
```

This sequence ensures a clean restart with the new self-contained preprocessing image. The `-v` flag removes volumes for a truly fresh state, and `--build` ensures the preprocessing image is rebuilt with current dependencies.
