# Nginx Configuration Guide

This directory contains the flexible nginx configuration setup for OVIS that supports both proxy mode and direct access mode through environment variables.

## Overview

The nginx configuration has been redesigned to be fully configurable via environment variables, allowing you to:
- Switch between proxy mode (through nginx) and direct access mode
- Enable/disable SSL (HTTPS)
- Configure all service endpoints dynamically

## Files

- `nginx.conf.template` - Nginx configuration template with variable placeholders
- `entrypoint.sh` - Script that processes the template and starts nginx

## Configuration Options

### Environment Variables

Add these to your `.env` file:

```bash
# === NGINX CONFIGURATION SECTION ===
# Nginx operation mode
NGINX_PROXY_MODE=true           # true: use nginx proxy, false: direct access
NGINX_SSL_ENABLED=false         # true: HTTPS+HTTP, false: HTTP only

# Nginx ports
NGINX_HTTP_PORT=80              # HTTP listen port
NGINX_HTTPS_PORT=443            # HTTPS listen port (if SSL enabled)

# Service upstream endpoints (container names)
NGINX_KEYCLOAK_UPSTREAM=keycloak:8080
NGINX_FRONTEND_UPSTREAM=ovis-frontend:5173

# SSL paths (inside nginx container)
NGINX_SSL_CERT=/etc/nginx/certs/cert.pem
NGINX_SSL_KEY=/etc/nginx/certs/privkey.pem
```

## Usage Scenarios

### 1. Local Development - HTTP Proxy Mode (Default)
```bash
NGINX_PROXY_MODE=true
NGINX_SSL_ENABLED=false
```

Access services through nginx:
- Frontend: http://localhost/
- Keycloak: http://localhost/keycloak

### 2. Local Development - Direct Access Mode
```bash
NGINX_PROXY_MODE=false
```

Access services directly (nginx container won't start):
- Frontend: http://localhost:5173
- Keycloak: http://localhost:8252/keycloak
- Express auth: http://localhost:8251

### 3. Production - HTTPS Proxy Mode
```bash
HOST=your.domain.example
NGINX_PROXY_MODE=true
NGINX_SSL_ENABLED=true
```

Access services through nginx with SSL:
- Frontend: https://your.domain.example/
- Keycloak: https://your.domain.example/keycloak

GraphQL is an internal API route used by the OVIS frontend/backend integration and is not a user-facing entrypoint.

## How It Works

1. **Dynamic Configuration**: The `entrypoint.sh` script:
   - Generates the nginx configuration from the template

2. **Proxy Mode**: When `NGINX_PROXY_MODE=true`:
   - All services are accessed through nginx
   - Nginx handles routing to the appropriate containers
   - SSL termination happens at nginx (if enabled)
   - The production frontend, Keycloak, and express-auth services are not publicly exposed; direct host access uses loopback-only bindings for local direct mode

3. **Direct Mode**: When `NGINX_PROXY_MODE=false`:
   - Nginx container exits immediately
   - Services are accessed directly on their configured ports
   - No SSL termination (unless configured in individual services)

## SSL Configuration

To enable SSL:
1. Set `NGINX_SSL_ENABLED=true`
2. Ensure SSL certificates are available at:
   - `Setup/Certificates/cert.pem`
   - `Setup/Certificates/privkey.pem`
3. HTTP traffic will automatically redirect to HTTPS

## Troubleshooting

### Check nginx configuration
```bash
docker compose exec nginx cat /etc/nginx/nginx.conf
```

### View nginx logs
```bash
docker compose logs nginx
```

### Verify environment variables
```bash
docker compose exec nginx env | grep NGINX
```

### Test configuration without starting services
```bash
docker compose run --rm nginx nginx -t
```

## Advanced Configuration

### Custom upstream endpoints
If your services run on different hosts or ports, update the upstream variables:
```bash
NGINX_KEYCLOAK_UPSTREAM=custom-keycloak:8080
NGINX_FRONTEND_UPSTREAM=custom-frontend:5173
```

### Additional proxy headers
To add custom proxy headers, modify the `entrypoint.sh` script to include additional `proxy_set_header` directives.

### Load balancing
For multiple backend instances, modify the template to use nginx upstream blocks with multiple servers.
