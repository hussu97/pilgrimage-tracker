FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/ssl.conf /etc/nginx/templates/ssl.conf
COPY conf.d/http.conf /etc/nginx/templates/http.conf
# Included via `include /etc/nginx/conf.d/*.conf` in nginx.conf. Sorts before
# default.conf, and only contains http-context directives. The entrypoint
# removes default.conf but leaves this file in place.
COPY conf.d/cloudflare-real-ip.conf /etc/nginx/conf.d/cloudflare-real-ip.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
