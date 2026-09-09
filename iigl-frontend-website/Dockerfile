# ---------------------------------------------------------------------------
# The public website.
#
# **npm, not pnpm.** `package.json` names pnpm in `packageManager` and both
# lockfiles are committed, which is a trap: the two can disagree and whichever
# the build happens to read decides what ships. `package-lock.json` is the
# newer of the two and npm is already in this image, so the build pins to that
# one deliberately rather than by accident. Deleting the loser is the real fix
# — see DEPLOY.md.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
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
