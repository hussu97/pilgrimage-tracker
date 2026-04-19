#!/bin/sh
set -e

rm -f /etc/nginx/conf.d/default.conf

if [ "${USE_SSL:-false}" = "true" ]; then
    echo "[nginx] USE_SSL=true — loading SSL config"
    cp /etc/nginx/templates/ssl.conf /etc/nginx/conf.d/default.conf
else
    echo "[nginx] USE_SSL=false — loading HTTP-only config"
    cp /etc/nginx/templates/http.conf /etc/nginx/conf.d/default.conf
fi

exec nginx -g 'daemon off;'
