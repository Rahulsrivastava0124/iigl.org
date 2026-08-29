# iigl-api

JSON API for the IIGL gemstone certification portal, replacing the Laravel 7
backend at `../iigl.org`. It talks to the same MySQL database — no schema
changes, no data migration.

## Running it

```bash
npm run dev
```

Serves on `http://localhost:3000`. Configuration lives in `.env`:

```
DATABASE_URL="mysql://root:root@localhost:3306/iigl"
PORT=3000
SESSION_SECRET=change-me-in-production
```

Regenerate the table types after any schema change:

```bash
npm run codegen
```

## API reference

With the server running:

| Where | What |
| --- | --- |
| [API.md](API.md) | The written reference: auth, conventions, and every endpoint |
| `http://localhost:3000/docs` | Swagger UI — browse and call every endpoint |
| `http://localhost:3000/openapi.json` | Raw OpenAPI 3.1 document, for client generation |

[API.md](API.md) is generated from the OpenAPI document, which `check:spec`
holds against the routers, so neither can drift from the code:

```bash
npm run docs
```

Both are served before the session guard, so the reference is readable without
signing in. **Try it out** sends the session cookie, so sign in through
`POST /api/auth/login` in the UI first and the authenticated calls will work for
the rest of the session.

The document lives in `src/docs/openapi.ts` as one module rather than JSDoc
comments spread through the route files, so the whole contract reads and diffs
in one place. Operation ids are generated from the method and path, so they
cannot drift from the routes they name.

### Keeping it honest

```bash
npm run check:spec
```

Compares the OpenAPI paths against the mounted routers and exits non-zero if
either side has something the other does not. Run it in CI — documentation that
silently drifts from the code is worse than none. When you add a router in
`app.ts`, add it to the `MOUNTS` table in `src/docs/check-spec.ts` too.

### Exercising every endpoint

```bash
npm run sweep
```

Calls all 44 endpoints across four identities — anonymous, laboratory, staff and
administrator — and checks each returns the documented status. It covers the
happy path, the guard (nothing under `/api` answers without a session), the
cross-laboratory refusals, and the validation rejections, and prints the shape
of each response body so a change in structure is visible.

It needs three local accounts on mobile numbers `9999900001` (laboratory),
`9999900002` (administrator) and `9999900003` (staff, linked to laboratory 12),
all with password `smoketest123`. Create them against a local copy only — never
against production. The sweep is read-only: write endpoints are called with
inputs that are expected to be rejected, so no rows are created.

Validate the document itself with:

```bash
npx redocly lint http://localhost:3000/openapi.json
```

It reports eleven warnings, all reviewed and intentional: eight endpoints have
no documented 4xx because they cannot fail with a client error, two paths are
flagged ambiguous but only collide if a record id were the literal string
`customer` or `dues` (ids are integers, and the literal routes are registered
first), and one is the localhost development server entry.

## Configuration

`.env.example` is committed and documents every value; `.env` itself is ignored.

```bash
cp .env.example .env
```

| Variable | What it does |
| --- | --- |
| `DATABASE_URL` | The existing MySQL database, shared with the Laravel application |
| `PORT` | Listen port, default 3000 |
| `SESSION_SECRET` | Signs session cookies. 32+ random characters |
| `PUBLIC_SITE_URL` | Origin that printed QR codes resolve against |
| `LEGACY_PUBLIC_ROOT` | Laravel `public/`, still holding card logos and uploads |
| `CORS_ORIGINS` | Browser origins allowed to call this API, comma separated |

`CORS_ORIGINS` needs every address the admin panel is served from, and is not
needed at all when the panel is served from this same host:

```
CORS_ORIGINS=https://admin.iigl.org,https://super.iigl.org,https://team.iigl.org
```

Startup refuses to run under `NODE_ENV=production` when `SESSION_SECRET` is a
known placeholder or shorter than 32 characters — a guessable secret means
session cookies can be forged. Generate one with:

```bash
node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
```

Rate limits apply to sign-in (10 failures per address per 15 minutes),
verification logging (60 per hour) and card rendering (30 per minute). They are
skipped outside production so local work and the sweep are not throttled.

`CORS_ORIGINS` is an explicit allowlist because authentication is a cookie: a
wildcard cannot be combined with credentials, and reflecting whatever origin
arrives would let any site call the API with a visitor's session.

## Migrations

```bash
npm run migrate:status   # what is applied here, what is pending
npm run migrate -- --dry # print what would run, touch nothing
npm run migrate          # apply the pending files
```

Numbered SQL files in `migrations/`, applied by a runner that only runs them —
it cannot generate SQL or diff a schema. It refuses to run a file that drops
something without `--allow-drop`, refuses everything if an applied file has been
edited since, and skips a file marked `-- @blocked`. See `migrations/README.md`.

## Checks

```bash
npm test               # 14 unit tests, no database needed
npm run sweep          # 132 checks across four roles against a live database
npm run check:spec     # OpenAPI document matches the mounted routers
npm run check:pricing  # pricing matches the totals already stored
npm run parity         # phase 07: every figure against the Laravel queries
npm run check:parents  # users.parent_id still agrees with employements,
                       # and both still name an empid somebody holds
npm run docs           # regenerate API.md
```

`npm test` is the only one that runs on a clean checkout; the rest need a
populated database and, for the sweep, a running server.

[AUDIT.md](AUDIT.md) records twelve findings, nine fixed and three held pending
a decision: database indexes, session revocation on password change, and an
audit trail for certificate amendments.

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Query layer | Kysely + mysql2 | The database has no foreign keys, so an ORM has no relations to generate. Kysely types the 26 tables and leaves joins explicit. |
| Types | kysely-codegen | Introspected from the live schema. The Laravel migration files are four years stale and describe columns that no longer match production. |
| Auth | express-session + bcryptjs | `bcryptjs` verifies the existing `$2y$10$` Laravel hashes, so no password reset is needed at cutover. |

The application never alters schema. Grant its database user `SELECT`,
`INSERT`, `UPDATE`, `DELETE` and nothing more.

Schema changes are plain SQL in [migrations/](migrations/), run by hand and
numbered. There is deliberately no migration tool: the database is shared with
the Laravel application and has no foreign keys protecting 22,103 certificates,
and a tool that can diff a schema can also drop a table.

## Layout

```
src/
  app.ts                 route mounting, session, error handling
  server.ts              listener and graceful shutdown
  db/
    index.ts             Kysely client over a mysql2 pool
    types.ts             generated — do not edit by hand
  lib/                   env, errors, pagination, async wrapper
  middleware/
    auth.ts              session guards, role rules, ownership check
    error.ts             404 and error responses
  routes/                one module per resource
  services/
    order.service.ts     order creation, order number format
    report.service.ts    report number format, attribute JSON blob
```

## Authentication

Sign in with mobile and password against the existing `users` table. The session
cookie is httpOnly, `sameSite=lax`, and secure in production.

Roles come from the `roles` table:

| id | Role | Guard |
| --- | --- | --- |
| 1 | administrator | `requireAdmin` |
| 2 | frenchise (laboratory) | `requireLab` |
| 3 | LAB EMPLOYEE | `requireStaff` |
| 4 | MANAGER | `requireStaff` |
| 5 | Office Boy | `requireStaff` |

Staff guards test `role_id > 2`, matching the Laravel `isEmployee` middleware.
Do not hardcode `role_id === 3` — roles 4 and 5 are in active use.

Each session carries a `labId`: a laboratory is its own lab, and staff inherit
theirs from the `employements` table. Every scoped query filters on it.

## Endpoints

### Public — no session

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/health` | Liveness probe |
| POST | `/api/auth/login` | Session cookie and the signed-in user |
| POST | `/api/auth/logout` | Clears the session |
| GET | `/api/public/verify/:reportNo` | Certificate detail for a report number. What printed QR codes point at. |
| POST | `/api/public/verify-log` | Records a verification lookup |
| GET | `/api/public/pages/:pageType` | Website page content |
| GET | `/api/public/blogs`, `/api/public/blogs/:slug` | Articles |
| GET | `/api/public/branches`, `/api/public/branches/:slug` | Branch city pages |
| GET | `/api/public/verify-by-id/:id` | Same, by report id. What printed QR codes carry. |
| GET | `/api/public/report-types` | Certificate types |
| GET | `/api/public/banners?type=` | Homepage banners |

`/api/public/verify/:reportNo` returns only what is printed on the card. It never
exposes the customer or order behind the certificate.

### Authenticated

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/auth/me` | Any signed-in user |
| POST | `/api/auth/change-password` | Any signed-in user |
| GET | `/api/catalog/categories` | Lab scope |
| GET | `/api/catalog/categories/:id/subcategories` | Lab scope |
| GET | `/api/catalog/subcategories/:id/attributes` | Lab scope |
| GET | `/api/catalog/attributes/:id/values` | Lab scope |
| GET | `/api/catalog/units`, `/report-types`, `/form-layouts/:categoryId` | Lab scope |
| GET | `/api/orders?status=&page=&per_page=` | Own lab only |
| GET | `/api/orders/:id` | Own lab only |
| PATCH | `/api/orders/:id` | Own lab only |
| GET | `/api/orders/customer/lookup?mobile=` | Own lab only |
| POST | `/api/orders` | Lab or staff |
| DELETE | `/api/orders/items/:id` | Own lab only |
| GET | `/api/orders/:id/quote` | Own lab only |
| POST | `/api/orders/:id/deliver` | Own lab only |
| GET | `/api/reports?order_id=&page=` | Own lab only |
| GET | `/api/reports/:id` | Own lab only |
| PATCH | `/api/reports/:id` | Own lab only |
| POST | `/api/reports` | Lab or staff |
| GET | `/api/transactions?direction=&status=` | Own records |
| POST | `/api/transactions` | Lab or staff |
| POST | `/api/transactions/:id/status` | Receiver or admin |
| POST | `/api/transactions/dues/:orderId` | Own lab only |
| POST | `/api/transactions/commission` | Laboratory only |
| GET | `/api/transactions/ledger` | Own account |
| GET | `/api/transactions/wallet` | Own balance |
| GET | `/api/users/me`, `/laboratories`, `/staff`, `/roles` | Lab scope |
| POST | `/api/users` | Admin only |
| PATCH | `/api/users/:id/active` | Admin only |
| GET | `/api/cards/data/:id` | Own lab only |
| GET | `/api/cards/:kind/:id` | Own lab only |
| POST | `/api/cards/:kind` | Own lab only |
| GET | `/api/dashboard/summary` | Own lab, or all labs for admin |

Everything under `/api` requires a session. Public routes are mounted before the
guard and listed above — the inverse of the Laravel app, where 15 routes sat
outside all middleware.

## Behaviour carried over from the PHP

**Report numbers.** `lab id (2) + day (2) + running count (4) + yymm (4)`. Live
row `122600012608` is lab 12, day 26, first report of the day, August 2026.
`buildReportNo()` reproduces this exactly; certificates already issued depend on
the format.

**Order numbers.** `YYYYMM-` plus six random digits. Because it is random rather
than sequential, `createOrder()` checks for a collision and retries instead of
issuing a duplicate.

**Report attributes.** `reports.description` is a longtext column holding a JSON
array of `{attr_id, attr_value, attr_desc}`, where the values are ids into
`attributes` and `attribute_values`. It is not relational and no join reaches it.
`expandAttributes()` parses the blob and batch-loads the referenced rows, so a
page of reports costs two extra queries rather than two per row.

**Open-source attributes.** When an attribute has `is_opensource` set, an unseen
value creates a new `attribute_values` row and the report stores the new id. This
is load-bearing: the certificate renderer resolves values through that table.

**Report quantity cap.** An order item accepts reports up to its `qty` and no
more.

## Pricing

The Laravel application computes order totals in browser JavaScript inside
`resources/views/common/order/report_detail.blade.php`, then posts the result to
the server, which stores whatever arrives. That is why 9,353 of 9,608 live
orders carry no `total_amount` at all, and why 134 have a `paid_amount` larger
than their total.

`src/services/pricing.service.ts` moves the calculation to the server:

1. Each certificate is priced by the weight band matching its carat weight,
   where a band matches when `min_wt <= carat_weight < max_wt`.
2. A band belonging to the ordering laboratory wins; otherwise the standard
   bands apply, which are the rows with a null `lab_id`.
3. `smart_price` is added when the order line asked for a smart card and
   `classic_price` when it asked for a classic card. A line can ask for both.
4. GST is 18%, applied after the discount and **truncated, not rounded** — the
   original calls `parseInt()`, so 778.8 becomes 778.

The `rate` column plays no part. It is populated on every price row and read by
nothing.

`GET /api/orders/{id}/quote` prices an order without changing it, so an operator
can try a discount before committing. `POST /api/orders/{id}/deliver` prices,
writes the totals, records the collection as a transaction and marks the order
delivered, all in one database transaction — and it ignores any total in the
request body.

### Parity against the existing data

```bash
npm run check:pricing
```

Recomputes every order that already carries a stored total and compares:

```
exact match:  223/255  (87.5%)
```

Every one of the 32 differences is accounted for:

- **31** are orders placed before their laboratory was given custom price rows.
  Laboratory 4 got its own rates in July 2022 and laboratory 14 in April 2023.
  Orders carry no price snapshot, so recomputing an old order applies today's
  rates. Laboratories whose rates never changed match 100%.
- **1** is order 64, where the stored total of 110 covers one certificate but
  three were issued twelve days before delivery. The original figure is simply
  wrong — which is what a client-supplied total permits.

### Two data notes found while porting

`reports.carat_weight` is a varchar and is not always numeric. Live values
include `8..00`, `2.276 gm / 0.22` and `2.10carat \ 2.31`. MySQL compares such
strings by their leading numeric prefix, so `parseFloat` is used rather than
`Number`, which would return `NaN` and drop the certificate into the lowest
band.

`prices` contains overlapping bands — category 2 has 0–1, 0–15, 1–10 and 15–20 —
so some weights match more than one row. Bands are ordered by id to match the
PHP `first()`, which returns the lowest primary key. Worth cleaning up in the
price table rather than in code.

## Commission and the ledger

A laboratory owes the administrator a percentage of what it collects. The rate
is per laboratory, in `users.commision`, and the payment is a transaction of
type `commision` — spelled that way in the data, so spelled that way in code.

| Column | Meaning |
| --- | --- |
| `comission_on` | The collected amount the commission is calculated on |
| `amount` | The commission itself, `comission_on x rate / 100` |

`POST /api/transactions/commission` takes the base and derives the amount from
the laboratory's own rate. The Laravel version accepts both figures from the
browser, so a laboratory can post any commission against any base.

Commission is barely exercised in the live data — one row in 296, and it was
declined — but that row confirms the rule: laboratory 4 is configured at 10.00
and its commission is 10 on a base of 100.

`GET /api/transactions/ledger` returns every transaction touching a user, oldest
first, with the balance after each entry. Only approved transactions move the
balance; pending and declined rows appear so the history is complete but leave
it unchanged, and are summarised separately as `pending_in` and `pending_out`.
Administrators can read another user's ledger with `?user_id=`.

## Editing orders and certificates

`PATCH /api/orders/:id` updates customer details, and replaces the item list
when `items` is supplied: entries with an `id` are updated, entries without one
are added, and existing items left out are removed.

Two guards have no equivalent in the Laravel version, which applies neither:

- An item with certificates issued against it cannot be removed.
- Its quantity cannot drop below the number already issued.

Without those, reducing a quantity strands issued certificates — rows pointing
at an order line that no longer accounts for them.

`PATCH /api/reports/:id` amends an issued certificate. **The report number is
never reallocated.** It is printed on a document already in circulation, and
reissuing under a new number would orphan the original. Supplying `attributes`
replaces the whole set, matching the PHP.

Attribute resolution is shared between create and update in a single
`resolveAttributes()`, so the two cannot drift. The Laravel versions are two
copies of the same loop.

## Certificate rendering

Two card types, both printed by headless Chrome from the same HTML and CSS the
Laravel views produced. That is the only approach that preserves the printed
layout without redrawing it, and a certificate is a document of record — visual
drift is a defect, not a preference.

| Card | Page | Source |
| --- | --- | --- |
| `smart` | 7.2in x 2.5in, two 3.4in x 2.2in panels | `common/card/smart.blade.php` |
| `classic` | A4 portrait | `common/card/classic2.blade.php` |

```
GET  /api/cards/smart/22122            one certificate as a PDF
GET  /api/cards/classic/22122          the A4 report
POST /api/cards/smart                  several in one PDF, up to 50
GET  /api/cards/data/22122             the data, without rendering
```

Add `?format=html` to any of them to get the markup instead. That is what to
diff against the Laravel output when checking for drift.

The smart card panel dimensions are load-bearing — cards are guillotined to
those marks, and the corner crop marks are positioned to the pixel from the
original stylesheet. Do not adjust them to make a browser preview look better.

### How it renders

Templates live in `src/templates` as EJS. Every image — the logos, the
watermark, the item photograph, the laboratory signature, the QR code — is
inlined as a data URI, so the renderer needs no network access and a card
cannot silently lose its logo because a path moved.

Assets still come from the Laravel `public/` directory, configured by
`LEGACY_PUBLIC_ROOT`. Uploaded item images and signatures live there and have
not been moved. Reads are confined to that directory whatever the database
holds.

One Chromium instance is shared across requests and launched on first use.
Starting it costs about a second, and paying that per certificate would make
batch printing unusable.

### Verification URLs

Printed QR codes point at `PUBLIC_SITE_URL/verify-report/{id}` — keyed by the
report **id**, not the report number, matching what the Laravel `genQR()`
produced. Certificates already in circulation carry that URL, so
`GET /api/public/verify-by-id/:id` exists to keep them resolving after cutover.
It returns exactly what verifying by number returns.

At cutover the public site must keep answering `/verify-report/{id}`. Changing
that path breaks every certificate ever issued.

## Deliberate differences

These are fixes, not ports. Each corrects a defect in the Laravel app.

**Every route is private by default.** `POST /order/store`, `POST /report/store`,
`POST /report/update/{id}`, `POST /deliverOrder/{id}`, `GET /delete_details`,
`GET /print-receipt/{id}` and `GET /print-invoice/{id}` currently run with no
authentication at either the route or controller layer.

**Ownership is enforced on every `:id`.** The Laravel app loads records by primary
key alone, so any lab can read another lab's orders, reports and invoices by
changing the number in the URL. `assertLabOwnership()` refuses cross-lab access.

**State changes require POST.** `/delete_details`, `/transaction/changestatus`
and `/admin/role/update/{id}` are GET routes in Laravel, which means CSRF
protection does not apply to them.

**Transaction approval is restricted to the receiver.** Anyone could previously
approve any transaction by requesting a URL.

**Multi-table writes are wrapped in transactions.** Order creation and dues
collection each write two tables. The PHP does not wrap either, which is why
orphaned orders and drifting paid/dues totals exist in the data.

**Listings are paginated.** Several PHP screens load all 22,103 report rows.

## Not ported

`POST /regsiter` and `GET /verifysponserid` write `userid`, `name`, `position`
and `sponserid` — none of which exist in the `users` table, whose real column is
`empid`. The block also contains a `$$last_child` double-dollar bug. It was
pasted in from another project and cannot ever have executed.

`ReportController@editgetreportform` is routed at
`/report/getformdata/{sid}/{rid}` but never defined in the class.

## Verified against live data

Run against a local copy of the production database:

- All 21 production password hashes are `$2y$10$` and verify under `bcryptjs`.
- A lab is refused another lab's order, report, delivery and dues collection.
- Certificate lookup resolves the JSON blob to real attribute names.
- Report numbers increment correctly and match the production format.
- The quantity cap rejects a third report on a two-item line.

`src/verify-auth.ts` is a read-only smoke test:

```bash
npx tsx src/verify-auth.ts
```

## Still to build

[FEATURE-GAP.md](FEATURE-GAP.md) compares this API against the Laravel
application it replaces, derived by parsing all 195 of its routes.

Six areas block cutover — file uploads, role permissions, laboratory and staff
records, receipts and invoices, attendance, and profile editing. Six more are
wanted but not blocking, mostly content management for the public site.

Phase 07 parity is done — [PARITY.md](PARITY.md) records the result. It found
two defects, both fixed: the dashboard was summing the wrong column over the
wrong set and overstating revenue by 7,808, and certificate numbering could
issue a duplicate. Three findings remain that need a decision rather than code.

Cutover is phase 08.
