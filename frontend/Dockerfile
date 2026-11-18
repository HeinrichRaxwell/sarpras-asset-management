# Serves the static frontend (pages/ + assets/ + index.html) with nginx.
# /api is proxied to the backend `api` service (see nginx.conf).
FROM nginx:alpine

# Remove default config and static content
RUN rm -f /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/app.conf
COPY . /usr/share/nginx/html

# Do not ship build tooling or partials to the runtime image
RUN rm -rf /usr/share/nginx/html/build_pages.py \
           /usr/share/nginx/html/assets/_p \
           /usr/share/nginx/html/assets/_shell.html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
