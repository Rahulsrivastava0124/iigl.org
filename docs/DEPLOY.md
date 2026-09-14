# Deploying

Three images, one per application:

| | Built from | Serves on | What it is |
| --- | --- | --- | --- |
| API | `iigl-node/Dockerfile` | `3000` | Node 22 + Chromium, for printing certificates |
| Panel | `iigl-admin/Dockerfile` | `80` | Vite build, served by nginx |
| Website | `iigl-frontend-website/Dockerfile` | `80` | Vite build, served by nginx |

Dokploy supplies Traefik, TLS and the environment. None of that is written
here: no ports are published and no routing labels are set, because Dokploy
generates them when a domain is attached.

---

## Which way to deploy

**Three Applications** is the better fit and is what the rest of this document
assumes. Each gets its own domain, its own build and its own rollback, and a
change to the panel does not rebuild an image with Chromium in it.

**One Compose service** is there too — `docker-compose.yml` at the repo root —
for deploying all three together. Its services join the external
`dokploy-network`; a service left off that network deploys cleanly and then
answers every request with a 404, because Traefik cannot reach it.

---

## The API

Create an Application, point it at this repository, set:

- **Build type** Dockerfile
- **Docker file** `iigl-node/Dockerfile`
- **Build context** `iigl-node`
- **Port** `3000`

### Environment

Required — the container refuses to start without them:

```
NODE_ENV=production
DATABASE_URL=mysql://user:password@host:3306/iigl
SESSION_SECRET=<32+ random characters>
PANEL_URL=https://admin.iigl.org
```

`SESSION_SECRET` signs the session cookie, and startup refuses a placeholder or
anything under 32 characters under `NODE_ENV=production` — a guessable secret
means cookies can be forged for any account, including head office. Generate
one:

```bash
node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
```

The rest:

```
PUBLIC_SITE_URL=https://www.iigl.org
CORS_ORIGINS=https://admin.iigl.org,https://super.iigl.org,https://team.iigl.org
LEGACY_PUBLIC_ROOT=/legacy-public
SMTP_URL=smtps://user:password@smtp.example.com:465
MAIL_FROM=IIGL <no-reply@iigl.org>
R2_ACCOUNT_ID=…
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
R2_BUCKET_NAME=iigl
R2_PUBLIC_URL=https://pub-….r2.dev
```

`CORS_ORIGINS` is only needed when the panel is served from a **different**
origin than the API. Authentication is a cookie, so this is an explicit
allowlist: a wildcard cannot be combined with credentials.

`SMTP_URL` and `MAIL_FROM` can also be set on the Settings screen, which takes
precedence — that is how the SMTP password is changed without a redeploy.

### The legacy files volume

Every image path in the database is `public/uploads/<bucket>/<file>`. The API
serves those from disk first and falls through to R2 on a miss, so the Laravel
`public/` directory has to be mounted:

- **Mount type** Bind
- **Host path** `../files/legacy-public`
- **Container path** `/legacy-public`

Copy the Laravel `public/` directory there. Leave the mount even if it is
empty: a missing file is a miss, and a miss is what makes R2 answer.

### Migrations

They are not applied on start — a container restarting under load would race
itself, and DDL in MySQL does not roll back. Run them once per deploy, from the
Dokploy terminal for the API container:

```bash
node dist/db/migrate.js --status   # what is applied here, what is pending
node dist/db/migrate.js            # apply the pending files
```

The runner refuses to touch a file that has been edited since it ran, and skips
anything marked `@blocked`. `migrations/README.md` has the rest.

---

## The panel

- **Docker file** `iigl-admin/Dockerfile`
- **Build context** `iigl-admin`
- **Port** `80`

### VITE_API_URL is a build argument, not an environment variable

Vite substitutes `VITE_*` into the bundle **at build time**. By the time the
container starts they are string literals inside the JavaScript, and nothing
reads the environment. So it goes under Dokploy's **Build Arguments**, not
Environment:

```
VITE_API_URL=/api
```

Set in Environment instead, it is read by nothing: the panel keeps whatever it
was built with and the symptom looks exactly like a broken API URL. Changing it
means a rebuild, not a restart.

Two shapes work:

- `/api` — the panel and API behind one host. Preferred: the session cookie
  stays first-party, which survives third-party cookie restrictions that a
  cross-origin setup does not. Needs a Traefik path rule sending `/api` to the
  API container.
- `https://api.iigl.org/api` — a separate origin. That API must then list this
  panel's origin in `CORS_ORIGINS`, and **both sides must be HTTPS** or the
  browser drops the cookie.

The three sign-in doors — `super.`, `admin.`, `team.` — are one build. Attach
all three domains to the same application.

Optional build arguments, all clamped in `src/lib/image.ts` so a typo falls
back rather than ruining a week of scans: `VITE_IMAGE_QUALITY`,
`VITE_IMAGE_MAX_EDGE`, `VITE_IMAGE_SKIP_UNDER_KB`, `VITE_UPLOAD_MAX_MB`.

---

## The website

- **Docker file** `iigl-frontend-website/Dockerfile`
- **Build context** `iigl-frontend-website`
- **Port** `80`

The home page reads its courses, slider banners, report categories, branches and
registered customers from the API's public endpoints, at the `VITE_API_URL` in
`iigl-frontend-website/.env.production` (`https://api.iigl.org/api`). It is read
at build time, so changing it means a rebuild. Public reads answer any origin, so
the website needs no `CORS_ORIGINS` entry.

A section with nothing in the panel yet, or that cannot reach the API, keeps its
built-in content rather than going blank.

Pictures uploaded in Website Setup, on courses and on categories are served under
`/api/files/website/`, `/api/files/banner/` and `/api/files/icon/` without a
session. Every other upload folder still needs one.

---

## Two things to clean up

**`iigl-frontend-website` has two lockfiles.** `package.json` names pnpm in
`packageManager`, and both `package-lock.json` and `pnpm-lock.yaml` are
committed. They can disagree, and whichever the build reads decides what ships.
The Dockerfile pins to `package-lock.json` — the newer of the two — deliberately
rather than by accident. Delete the loser and the trap goes with it.

**`iigl-node/dist/` is committed.** The image builds it fresh and
`.dockerignore` excludes it, so deployment is unaffected — but a committed build
output that drifts from its source is a thing somebody will eventually read and
believe. It belongs in `.gitignore`.
