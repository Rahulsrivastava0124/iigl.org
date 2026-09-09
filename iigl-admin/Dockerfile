# ---------------------------------------------------------------------------
# The admin panel.
#
# No configuration. The build takes no arguments and reads no `.env` — the file
# is excluded by `.dockerignore`, so `VITE_API_URL` is unset and the panel
# falls back to `/api`, its same-origin default.
#
# That default is the one to want. The panel and the API behind a single host
# keeps the session cookie first-party, which survives the third-party cookie
# restrictions a cross-origin setup runs into; on Dokploy it is a path rule
# sending `/api` to the API container.
#
# **If the API has to live on another origin**, that cannot be done to this
# image from outside: Vite substitutes `VITE_*` into the bundle at build time,
# so by the time a container starts they are string literals in the JavaScript
# and nothing reads the environment. Serving the API under `/api` on the
# panel's own host is the way to avoid needing to.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# `tsc -b && vite build`. The typecheck is part of the build on purpose: it is
# what catches a Material UI prop that moved between majors, and a panel that
# compiles is the only one worth shipping.
RUN npm run build


# ---------------------------------------------------------------------------
# `stable-alpine` rather than a pinned minor: the tag always exists and always
# points at the current stable line, where a specific minor is one upstream
# release away from being a build that fails on a tag nobody published.
FROM nginx:stable-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/healthz >/dev/null 2>&1 || exit 1
