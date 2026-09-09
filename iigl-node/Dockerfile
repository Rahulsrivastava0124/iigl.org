# ---------------------------------------------------------------------------
# The API.
#
# Two stages: one that has TypeScript and one that has Chromium. Neither needs
# what the other carries, and the running image is the smaller half.
#
# **Chromium comes from Debian, not from Puppeteer.** Puppeteer downloads its
# own build at install time — another ~170 MB on top of the one apt would
# install, and on a host that is not x86 there may not be a build to download at
# all. `PUPPETEER_SKIP_DOWNLOAD` turns that off and `PUPPETEER_EXECUTABLE_PATH`
# points the launcher at the system binary; Puppeteer reads both itself, so no
# application code knows this happened. The certificates are printed by
# Chromium either way.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build

# Nothing in this stage launches a browser, so the download is refused here too
# — it is the slowest part of `npm ci` and produces a directory the compiler
# never opens.
ENV PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app

# The lockfile and manifest alone, so a change to source does not reinstall
# every dependency. `npm ci` installs exactly what the lockfile pins.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# `tsc` emits JavaScript and nothing else, so `copy-assets` brings the EJS
# templates and their images into dist/ — every document renderer resolves its
# template relative to its own compiled file.
RUN npm run build


# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# `chromium` pulls its own font and library dependencies, which is the whole
# reason to take it from apt rather than listing thirty `libnss3`-shaped
# packages by hand. The fonts are not optional: without them a certificate
# prints as empty boxes, and the failure looks like a layout bug.
#
# `tini` is PID 1. Chromium leaves zombie processes behind when it is killed,
# and Node as PID 1 does not reap them; a long-running API that prints
# thousands of cards otherwise fills its process table.
RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        chromium \
        fonts-liberation \
        fonts-dejavu-core \
        ca-certificates \
        tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Production dependencies only. The compiler, the type packages and the
# checking scripts stay in the build stage.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
# The migration runner reads these at run time — `npm run migrate` inside the
# container is how a deployment applies them.
COPY --from=build /app/migrations ./migrations

# Not root. The image installs nothing at run time and writes nothing to disk:
# uploads go to R2 and the legacy files are mounted read-only.
USER node

EXPOSE 3000

# `/health` is outside the session guard, which is what makes it usable as a
# probe: everything under `/api` answers 401 without a cookie, and a health
# check that has to sign in is a health check that fails for the wrong reason.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/server.js"]
