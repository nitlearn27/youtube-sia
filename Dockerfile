# Static site served by nginx — ready for Render's Docker runtime.
FROM nginx:1.27-alpine

# Copy only the app assets (not deploy/meta files) into the web root.
COPY index.html manifest.webmanifest service-worker.js /usr/share/nginx/html/
COPY css/    /usr/share/nginx/html/css/
COPY js/     /usr/share/nginx/html/js/
COPY icons/  /usr/share/nginx/html/icons/

# nginx config is templated with Render's $PORT at container start.
# The official nginx entrypoint runs envsubst on /etc/nginx/templates/*.template
# and writes the result to /etc/nginx/conf.d/ — it only substitutes variables
# that exist in the environment, so nginx's own $uri/$host are left intact.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Render injects PORT (defaults to 10000); provide a default for local runs too.
ENV PORT=10000
EXPOSE 10000
