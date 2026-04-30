# Express API for Keycloak Integration

This Express application provides a backend API to interact with Keycloak for user authentication, user management, and password reset functionalities.

## Prerequisites

- Node.js and npm/yarn installed.
- A running Keycloak instance.
- Environment variables configured in a `.env` file in the `keycloak_ovis/express/` directory. Necessary variables include:
  - `PORT`: Port for the Express server (e.g., 5000).
  - `KEYCLOAK_URL`: Base URL of your Keycloak instance (e.g., `http://localhost:8080/auth`).
  - `KEYCLOAK_REALM`: The Keycloak realm name (e.g., `ovis`).
  - `KEYCLOAK_CLIENT_ID`: Client ID for general operations (e.g., `ovis_client`).
  - `KEYCLOAK_CLIENT_SECRET`: Client secret for the `KEYCLOAK_CLIENT_ID`.
  - `KEYCLOAK_ADMIN_CLIENT_ID`: Client ID for Keycloak admin operations (e.g., `admin-cli` or a dedicated admin client).
  - `KEYCLOAK_ADMIN_CLIENT_SECRET`: Client secret for the `KEYCLOAK_ADMIN_CLIENT_ID`.
  - `BASIC_AUTH_USERNAME`: Username for Basic Authentication to protect these API endpoints.
  - `BASIC_AUTH_PASSWORD`: Password for Basic Authentication.

## Installation and Startup

1.  Navigate to the `keycloak_ovis/express` directory.
2.  Install dependencies: `npm install` or `yarn install`.
3.  Start the server: `npm start` or `yarn start`.

The API will be available at `http://localhost:{PORT}`.

## API Endpoints

All API endpoints are prefixed with `/api/keycloak`. All endpoints require **Basic Authentication** using the credentials defined by `BASIC_AUTH_USERNAME` and `BASIC_AUTH_PASSWORD` in the `.env` file. The `Authorization` header should be in the format `Basic <base64_encoded_username_password>`.

### Authentication

#### 1. Login

-   **Endpoint:** `POST /api/keycloak/login`
-   **Description:** Authenticates a user with their username and password.
-   **Request Body:**
    ```json
    {
        "username": "user@example.com",
        "password": "yourpassword"
    }
    ```
-   **Response (Success 200):**
    ```json
    {
        "access_token": "...",
        "expires_in": 300,
        "refresh_expires_in": 1800,
        "refresh_token": "...",
        "token_type": "bearer",
        "not-before-policy": 0,
        "session_state": "...",
        "scope": "openid profile email",
        "timestamp": 1678886400000 // Timestamp of when the token was issued
    }
    ```
-   **Response (Error 401):** Invalid credentials.
-   **Response (Error 403):** Basic authentication failed.

#### 2. Get User Info

-   **Endpoint:** `POST /api/keycloak/userinfo`
-   **Description:** Retrieves information about the authenticated user using their access token.
-   **Request Body:**
    ```json
    {
        "token": "your_access_token"
    }
    ```
-   **Response (Success 200):**
    ```json
    {
        "sub": "user-uuid",
        "email_verified": true,
        "name": "First Last",
        "preferred_username": "user@example.com",
        "given_name": "First",
        "family_name": "Last",
        "email": "user@example.com"
        // ... other OIDC claims
    }
    ```
-   **Response (Error 401):** Token is invalid or expired.
-   **Response (Error 403):** Basic authentication failed.

#### 3. Refresh Access Token

-   **Endpoint:** `POST /api/keycloak/refresh`
-   **Description:** Obtains a new access token using a refresh token.
-   **Request Body:**
    ```json
    {
        "refresh_token": "your_refresh_token"
    }
    ```
-   **Response (Success 200):** Similar to the login response, with new tokens and timestamp.
    ```json
    {
        "access_token": "...",
        "expires_in": 300,
        "refresh_expires_in": 1800,
        "refresh_token": "...",
        // ... other fields
        "timestamp": 1678886700000
    }
    ```
-   **Response (Error 400/401):** Invalid or expired refresh token.
-   **Response (Error 403):** Basic authentication failed.

#### 4. Logout

-   **Endpoint:** `POST /api/keycloak/logout`
-   **Description:** Logs out the user by invalidating their refresh token.
-   **Request Body:**
    ```json
    {
        "refresh_token": "your_refresh_token"
    }
    ```
-   **Response (Success 200):**
    ```json
    {
        "message": "Logout successful"
        // or { "message": "Logout processed", "warning": "Some Keycloak error if revocation failed but client should proceed" }
    }
    ```
-   **Response (Error 403):** Basic authentication failed.

#### 5. Introspect Token

-   **Endpoint:** `POST /api/keycloak/introspect`
-   **Description:** Checks the validity of an access token.
-   **Request Body:**
    ```json
    {
        "token": "your_access_token"
    }
    ```
-   **Response (Success 200):**
    ```json
    {
        "active": true,
        // ... other introspection details like scope, client_id, username
    }
    ```
    If the token is invalid or expired, `active` will be `false`.
-   **Response (Error 403):** Basic authentication failed.

### User Management

#### 1. Create User

-   **Endpoint:** `POST /api/keycloak/createuser`
-   **Description:** Creates a new user in Keycloak. This endpoint uses an admin-level token internally.
-   **Request Body:** A Keycloak user representation object.
    ```json
    {
        "username": "newuser@example.com",
        "email": "newuser@example.com",
        "firstName": "New",
        "lastName": "User",
        "enabled": true,
        "credentials": [
            {
                "type": "password",
                "value": "securepassword123",
                "temporary": false
            }
        ],
        "attributes": {
            "customAttribute": ["value1", "value2"]
        },
        "realmRoles": ["user_role"] // Optional: assign realm roles
    }
    ```
-   **Response (Success 201):**
    ```json
    {
        "message": "User created successfully"
    }
    ```
-   **Response (Error 400):** Invalid request body or user creation failed (e.g., user already exists).
-   **Response (Error 403):** Basic authentication failed.

#### 2. Update User Attributes

-   **Endpoint:** `PUT /api/keycloak/user/:email`
-   **Description:** Updates specific attributes of an existing user, identified by their email. This endpoint uses an admin-level token internally.
-   **URL Parameters:**
    -   `email`: The email address of the user to update.
-   **Request Body:**
    ```json
    {
        "attributes": {
            "ovisFilter": ["filterValue1", "filterValue2"],
            "anotherAttribute": ["newValue"]
        }
    }
    ```
    Only attributes provided in the `attributes` object will be updated/added. Existing attributes not specified will remain unchanged.
-   **Response (Success 200):**
    ```json
    {
        "message": "User attributes updated successfully",
        "updatedAttributes": {
            "ovisFilter": ["filterValue1", "filterValue2"],
            "anotherAttribute": ["newValue"]
        }
    }
    ```
-   **Response (Error 400):** Email or attributes missing in request.
-   **Response (Error 404):** User not found.
-   **Response (Error 500):** Failed to update attributes.
-   **Note:** This endpoint does not seem to have its own Basic Auth check in the controller, relying on the admin token for Keycloak. However, the route itself might be protected by a global Basic Auth middleware if one is set up.

### Password Reset

This is a two-step process.

**Security Warning:** The `create-reset-code` endpoint currently returns the reset code directly in the API response. **In a production environment, this code MUST be sent to the user's email address instead of being returned in the API response to prevent security vulnerabilities.**

#### 1. Create Password Reset Code

-   **Endpoint:** `POST /api/keycloak/create-reset-code`
-   **Description:** Generates a password reset code for a user.
-   **Request Body:**
    ```json
    {
        "email": "user@example.com"
    }
    ```
-   **Response (Success 200):**
    ```json
    {
        "message": "Reset code generated successfully",
        "reset_code": "123456" // SECURITY RISK: This should be emailed, not returned.
    }
    ```
-   **Response (Error 400):** Email is required.
-   **Response (Error 404):** User does not exist.
-   **Response (Error 403):** Basic authentication failed (if `authenticateRequest` uses Basic Auth).

#### 2. Check Password Reset Code

-   **Endpoint:** `POST /api/keycloak/check-reset-code`
-   **Description:** Verifies if the provided reset code is valid for the given email.
-   **Request Body:**
    ```json
    {
        "email": "user@example.com",
        "reset_code": "123456"
    }
    ```
-   **Response (Success 200):**
    ```json
    {
        "valid": true // or false
    }
    ```
-   **Response (Error 400):** Email and reset code are required.
-   **Response (Error 404):** No reset code found for the email.

#### 3. Reset Password

-   **Endpoint:** `PUT /api/keycloak/reset-password`
-   **Description:** Resets the user's password using a new password, provided the reset code has been successfully verified.
-   **Request Body:**
    ```json
    {
        "email": "user@example.com",
        "newpassword": "newSecurePassword123"
    }
    ```
-   **Response (Success 204):** No content, indicating success.
-   **Response (Error 400):** Email or new password missing.
-   **Response (Error 403):** Password reset code not verified or Basic authentication failed.
-   **Response (Error 404):** Reset code not found/expired or user not found in Keycloak.

## Environment Variables (.env example)

Create a `.env` file in the `keycloak_ovis/express/` directory:

```env
PORT=5000

KEYCLOAK_URL=http://localhost:8080/auth
KEYCLOAK_REALM=your_realm
KEYCLOAK_CLIENT_ID=your_public_client_id # e.g., ovis_client or public-user-cli for login
KEYCLOAK_CLIENT_SECRET=your_client_secret # For confidential clients if KEYCLOAK_CLIENT_ID is one

KEYCLOAK_ADMIN_CLIENT_ID=your_admin_client_id # e.g., admin-cli
KEYCLOAK_ADMIN_CLIENT_SECRET=your_admin_client_secret

BASIC_AUTH_USERNAME=your_basic_auth_user
BASIC_AUTH_PASSWORD=your_basic_auth_password
```

**Note on Client IDs:**
- The `login` endpoint uses `public-user-cli` as its `client_id` directly in the code. Ensure this client exists in your Keycloak realm and is configured for password grants.
- Other endpoints like `introspect`, `refresh`, `logout` use `process.env.KEYCLOAK_CLIENT_ID` and `process.env.KEYCLOAK_CLIENT_SECRET`. This implies a confidential client.
- User management (`createUser`, `updateUserAttributes`) and password reset (`resetPassword`) use `process.env.KEYCLOAK_ADMIN_CLIENT_ID` and `process.env.KEYCLOAK_ADMIN_CLIENT_SECRET`, which should correspond to a client with administrative privileges (e.g., the `admin-cli` client or a custom service account with necessary roles).

Make sure the clients used (`public-user-cli`, the one for `KEYCLOAK_CLIENT_ID`, and the one for `KEYCLOAK_ADMIN_CLIENT_ID`) are correctly configured in your Keycloak realm with the appropriate access types (public/confidential) and enabled flows (e.g., "Direct Access Grants" for password flow, "Service Accounts Enabled" for client credentials flow).
