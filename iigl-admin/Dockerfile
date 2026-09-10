# ---------------------------------------------------------------------------
# The admin panel.
#
# `VITE_*` is configuration for the **build**, not for the container. Vite
# substitutes those values into the bundle as `vite build` runs, so by the time
# nginx starts they are string literals inside the JavaScript and nothing reads
# the environment. Set in Dokploy's Environment tab they are read by nothing:
# the panel keeps whatever it was built with, and the symptom is
# indistinguishable from a wrong API URL. Changing one means a rebuild, not a
# restart.
#
# Two channels reach the build, highest priority first:
#
#   1. Build arguments      the ARGs below. Docker exposes them to `RUN`, and
#                           Vite gives an already-set process variable priority
#                           over any .env file. This is Dokploy's channel.
#   2. .env / .env.production   in the build context. .dockerignore lets these
#                           through on purpose. Both are gitignored, so a deploy
#                           that clones from git has no such file unless the
#                           pipeline writes one before `docker build` runs
#                           — on Dokploy, use channel 1.
#
# Absent both, `src/lib/config.ts` falls back to `/api`, and that fallback is
# the one to want: the panel and the API behind a single host keeps the session
# cookie first-party, which survives the third-party cookie restrictions a
# cross-origin setup runs into. On Dokploy it is a path rule sending `/api` to
# the API container. Nothing has to be configured for that to work, which is why
# no ARG here carries a default — a default would silently outrank .env and
# make channel 2 dead configuration.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Declared so Docker will accept them. A build argument the Dockerfile never
# names is discarded without a word, which is its own silent-misconfiguration
# trap — the compose file passed VITE_API_URL for a while against a Dockerfile
# that had no ARG for it, and the value went nowhere.
#
# No ENV line: Docker already puts ARG values in the environment of the RUN
# below. Restating them as ENV would define the unset ones as empty strings,
# and an empty string is set — it would outrank .env rather than defer to it.
ARG VITE_API_URL

# Uploads: pictures are shrunk in the browser before they are sent. All four are
# clamped in src/lib/image.ts, so a typo falls back rather than ruining a week
# of scans.
ARG VITE_IMAGE_QUALITY
ARG VITE_IMAGE_MAX_EDGE
ARG VITE_IMAGE_SKIP_UNDER_KB
ARG VITE_UPLOAD_MAX_MB

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
