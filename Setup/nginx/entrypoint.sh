#!/bin/sh
set -e

required_vars="APP_DOMAIN NGINX_PROXY_MODE NGINX_HTTP_PORT NGINX_KEYCLOAK_UPSTREAM NGINX_FRONTEND_UPSTREAM"
for var in $required_vars; do
  val=$(eval "printf '%s' \"\${$var:-}\"")
  if [ -z "$val" ]; then
    echo "ERROR: Required environment variable $var is not set"
    exit 1
  fi
done

: "${NGINX_CLIENT_MAX_BODY_SIZE:=100m}"
export NGINX_CLIENT_MAX_BODY_SIZE

: "${NGINX_SSL_CERT:=/etc/nginx/certs/cert.pem}"
: "${NGINX_SSL_KEY:=/etc/nginx/certs/privkey.pem}"
export NGINX_SSL_CERT
export NGINX_SSL_KEY

mkdir -p "$(dirname "$NGINX_SSL_CERT")" "$(dirname "$NGINX_SSL_KEY")"

if [ "${NGINX_SSL_ENABLED:-false}" = "true" ]; then
  if [ -n "${NGINX_SSL_CERT_PEM:-}" ]; then
    printf '%s\n' "$NGINX_SSL_CERT_PEM" > "$NGINX_SSL_CERT"
  fi
  if [ -n "${NGINX_SSL_KEY_PEM:-}" ]; then
    printf '%s\n' "$NGINX_SSL_KEY_PEM" > "$NGINX_SSL_KEY"
  fi
  if [ ! -f "$NGINX_SSL_CERT" ] || [ ! -f "$NGINX_SSL_KEY" ]; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 365 -keyout "$NGINX_SSL_KEY" -out "$NGINX_SSL_CERT" -subj "/CN=${APP_DOMAIN}" >/dev/null 2>&1
  fi
fi

if [ "$NGINX_PROXY_MODE" != "true" ]; then
  echo "Note: In direct mode (NGINX_PROXY_MODE=false), nginx container should not be started."
  echo "Services should be accessed directly on their respective ports."
  exit 0
fi

if [ "${NGINX_SSL_ENABLED:-false}" = "true" ]; then
  NGINX_HTTP_CONFIG='return 301 https://$host$request_uri;'
  export NGINX_HTTP_CONFIG
  NGINX_HTTPS_SERVER=$(cat <<EOF
server {
    listen ${NGINX_HTTPS_PORT} ssl;
    server_name ${APP_DOMAIN};

    ssl_certificate ${NGINX_SSL_CERT};
    ssl_certificate_key ${NGINX_SSL_KEY};

    location /keycloak/ {
        proxy_pass http://${NGINX_KEYCLOAK_UPSTREAM}/keycloak/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_buffer_size 32k;
        proxy_buffers 8 64k;
        proxy_busy_buffers_size 128k;
        proxy_temp_file_write_size 128k;
    }

    location /express/ {
        if (\$http_referer !~ "^https?://${APP_DOMAIN}") { return 403; }
        proxy_pass http://express-auth:5000/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_buffer_size 32k;
        proxy_buffers 8 64k;
        proxy_busy_buffers_size 128k;
        proxy_temp_file_write_size 128k;
    }

    location / {
        proxy_pass http://${NGINX_FRONTEND_UPSTREAM};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_buffer_size 32k;
        proxy_buffers 8 64k;
        proxy_busy_buffers_size 128k;
        proxy_temp_file_write_size 128k;
    }
}
EOF
)
  export NGINX_HTTPS_SERVER
else
  NGINX_HTTP_CONFIG=$(cat <<EOF
location /keycloak/ {
    proxy_pass http://${NGINX_KEYCLOAK_UPSTREAM}/keycloak/;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-Port \$server_port;
    proxy_buffer_size 32k;
    proxy_buffers 8 64k;
    proxy_busy_buffers_size 128k;
    proxy_temp_file_write_size 128k;
}

location /express/ {
    if (\$http_referer !~ "^https?://${APP_DOMAIN}") { return 403; }
    proxy_pass http://express-auth:5000/;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-Port \$server_port;
    proxy_buffer_size 32k;
    proxy_buffers 8 64k;
    proxy_busy_buffers_size 128k;
    proxy_temp_file_write_size 128k;
}

location / {
    proxy_pass http://${NGINX_FRONTEND_UPSTREAM};
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-Port \$server_port;
    proxy_buffer_size 32k;
    proxy_buffers 8 64k;
    proxy_busy_buffers_size 128k;
    proxy_temp_file_write_size 128k;
}
EOF
)
  export NGINX_HTTP_CONFIG
  NGINX_HTTPS_SERVER=""
  export NGINX_HTTPS_SERVER
fi

echo "Nginx Configuration:"
echo "  NGINX_PROXY_MODE: ${NGINX_PROXY_MODE}"
echo "  NGINX_SSL_ENABLED: ${NGINX_SSL_ENABLED:-false}"
echo "  APP_DOMAIN: ${APP_DOMAIN}"

if ! envsubst '${APP_DOMAIN} ${NGINX_HTTP_PORT} ${NGINX_HTTPS_PORT} ${NGINX_HTTP_CONFIG} ${NGINX_HTTPS_SERVER} ${NGINX_KEYCLOAK_UPSTREAM} ${NGINX_FRONTEND_UPSTREAM} ${NGINX_SSL_CERT} ${NGINX_SSL_KEY} ${NGINX_WORKER_PROCESSES} ${NGINX_CLIENT_MAX_BODY_SIZE}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf; then
  echo "ERROR: Failed to process nginx template"
  exit 1
fi

if ! nginx -t; then
  echo "ERROR: Invalid nginx configuration"
  exit 1
fi

exec nginx -g "daemon off;"
