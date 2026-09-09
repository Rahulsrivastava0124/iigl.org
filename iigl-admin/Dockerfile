# ---------------------------------------------------------------------------
# The admin panel.
#
# **Vite substitutes `VITE_*` into the bundle at build time.** They are not
# environment variables the container reads when it starts — by then they are
# already string literals inside the JavaScript. So they arrive as build
# arguments, and pointing the panel at a different API means rebuilding the
# image, not restarting it.
#
# On Dokploy that means setting them under Build Arguments, not under
# Environment. A value put in Environment is read by nothing and the panel
# silently keeps whatever it was built with, which looks exactly like a broken
# API URL.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build

# Where the panel finds the API.
#
#   /api                       same origin — the panel and the API behind one
#                              host. The session cookie stays first-party,
#                              which survives third-party cookie restrictions
#                              that a cross-origin setup does not.
#
#   https://api.iigl.org/api   a different origin. That API must then list this
#                              panel's origin in CORS_ORIGINS, and both sides
#                              must be HTTPS or the browser drops the cookie.
ARG VITE_API_URL=/api

# How hard a picture is shrunk in the browser before it is sent. All optional;
# src/lib/image.ts clamps each to a range that still prints legibly, so a typo
# falls back rather than ruining a week of scans.
ARG VITE_IMAGE_QUALITY
ARG VITE_IMAGE_MAX_EDGE
ARG VITE_IMAGE_SKIP_UNDER_KB
ARG VITE_UPLOAD_MAX_MB

ENV VITE_API_URL=$VITE_API_URL \
    VITE_IMAGE_QUALITY=$VITE_IMAGE_QUALITY \
    VITE_IMAGE_MAX_EDGE=$VITE_IMAGE_MAX_EDGE \
    VITE_IMAGE_SKIP_UNDER_KB=$VITE_IMAGE_SKIP_UNDER_KB \
    VITE_UPLOAD_MAX_MB=$VITE_UPLOAD_MAX_MB

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
