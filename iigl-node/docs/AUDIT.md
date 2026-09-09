# IIGL API — audit

Audit of the Node and Express API in this directory, carried out against a local
copy of the production database (26 tables, 22,103 certificates, 9,608 orders,
21 user accounts).

Thirteen findings. Every one was reproduced against the running service or the
real data — none are inferred from reading the code. Each entry names the check
that produced it so it can be re-run.

| Severity | Count | Fixed | Held |
| --- | --- | --- | --- |
| High | 4 | 4 | 0 |
| Medium | 4 | 4 | 0 |
| Low | 4 | 2 | 2 |

**Ten of twelve are fixed and verified.** Two are held because they need a
decision that is not mine to make:

| Held | Why |
| --- | --- |
| L2 session revocation | Needs a persistent session store, which is an infrastructure choice. |
| L4 audit trail | Needs a new column, and a business decision about whether amendments must be traceable. |

Two further constraints — unique on `reports.report_no` and `users.mobile` — are
written in `migrations/002-unique-constraints.sql` but blocked by existing
duplicate data. See `migrations/README.md`.

Each fixed finding below carries a **Fixed** note naming the change and the
check that proves it. The nine bad-path-id cases are now regression cases in
`npm run sweep`, which stands at 113 checks.

Scope: the endpoints listed in [API.md](API.md). The Laravel
application it replaces is out of scope except where behaviour was carried over
deliberately; its own defects are recorded in the endpoint reference for that
project.

---

## High

### H1 — No indexes on the four hot tables

Only primary keys exist on `reports`, `orders`, `order_details` and
`transactions`. Every laboratory-scoped query is a full table scan.

```
mysql> EXPLAIN SELECT COUNT(*) FROM reports WHERE lab_id=12;

-> Aggregate: count(0)  (cost=2807 rows=1)
    -> Filter: (reports.lab_id = 12)  (cost=2316 rows=2132)
        -> Table scan on reports  (cost=2316 rows=21318)
```

`orders` behaves the same way, scanning all 9,608 rows to find one laboratory's.

This affects nearly every authenticated endpoint: order and certificate lists,
the dashboard summary, pricing quotes, card batches and the ledger. It is the
finding most likely to be felt on the day of cutover, because the table scan
cost grows with the archive rather than with the working set.

Indexes worth adding:

| Table | Columns | Serves |
| --- | --- | --- |
| `reports` | `lab_id` | every certificate list and dashboard count |
| `reports` | `order_detail_id` | order detail, pricing, card assembly |
| `reports` | `report_no` | public certificate verification |
| `reports` | `order_no` | certificate filtering by order |
| `orders` | `lab_id`, `status` | order lists and dashboard tiles |
| `orders` | `order_no` | order number collision check on create |
| `order_details` | `order_id` | order detail and pricing |
| `transactions` | `send_by` | ledger and wallet |
| `transactions` | `received_by` | ledger, wallet, approvals |
| `transactions` | `order_id` | dues history for an order |

**This is a schema change and needs an explicit decision plus a maintenance
window.** Adding an index locks the table briefly; on 22,103 rows that is short,
but it is still a write against production data. It is also the one change in
this list that touches the database the Laravel application is still serving
from — the two share it.

Note that adding an index is additive and reversible, unlike the schema
migrations this project deliberately avoids. It changes no column and no row.

> **Fixed.** `migrations/001-indexes.sql` adds 31 indexes and has been applied
> to the working copy. Measured on the same query: `Table scan on reports,
> cost 2316, rows 21318` became `Covering index lookup using idx_reports_lab,
> cost 237, rows 2325`. Every hot path now resolves through an index and no
> query in the sweep does a table scan.
>
> Additive and reversible — no column changes type, no row changes value, and
> the rollback is in the file. About 5 MB of index against 14 MB of data.
>
> Still to run against production, during a window. InnoDB builds these online
> and neither application reads an index by name, so it is safe alongside the
> Laravel application.

### H1b — Three active staff cannot sign in: duplicate mobile numbers

`users.mobile` carries no unique constraint — only `id` and `empid` are unique —
and three numbers are held by two accounts each:

| Mobile | Lowest id wins | Shadowed account | Certificates issued |
| --- | --- | --- | --- |
| 8420126860 | 4 IIGL-KOLKATTA, laboratory | 23 Sanjoy Naskar, active staff | 5,009 |
| 9474797199 | 5 IIGL-MALDA, **deactivated** | 7 MOSHMI SHARMA, active staff | 2,419 |
| 9851562223 | 15 Mintu Sarkar, **deactivated** | 19 Mintu Sarkar, active staff | 110 |

Sign-in looked the number up and took the first row, so the shadowed account was
unreachable whatever password was typed. Two of the three shadowing accounts are
themselves deactivated, so those staff hit "This account has been deactivated"
for an account that is not theirs.

Between them the three shadowed accounts issued 7,538 certificates, a third of
the 22,103 total. They are working staff, not stale rows.

The Laravel application resolves sign-in the same way — `->first()` on the same
query — so this is a pre-existing lockout rather than something the migration
introduced.

> **Fixed in the API.** Sign-in now compares the password against every account
> holding that number and selects the one it matches, so each person reaches
> their own account. If more than one *active* account matches both the number
> and the password, sign-in is refused rather than guessing, because guessing
> could sign someone in as a different person with a different role.
>
> **The data still needs attention, and that is not a code decision.** Someone
> has to say which account is canonical for each number, and whether the
> laboratory accounts on 8420126860 and 9474797199 should keep those numbers.
> A unique index on `users.mobile` should follow the cleanup — until then the
> duplicate check in `POST /api/users` is an application-level test with no
> database constraint behind it, so a race can still create a pair.

### H2 — A non-numeric id returns 500 instead of 400

Five routes pass `Number(req.params.id)` straight into a query. A non-numeric
segment becomes `NaN`, reaches MySQL, and fails there:

```
code: 'ER_BAD_FIELD_ERROR'
sqlMessage: "Unknown column 'NaN' in 'where clause'"
```

Reproduced:

| Request | Returns | Should be |
| --- | --- | --- |
| `GET /api/orders/abc` | 500 | 400 |
| `GET /api/orders/abc/quote` | 500 | 400 |
| `GET /api/reports/abc` | 500 | 400 |
| `PATCH /api/orders/abc` | 500 | 400 |
| `PATCH /api/reports/abc` | 500 | 400 |
| `GET /api/public/verify-by-id/abc` | 500 | 400 |

The last one is reachable without a session, so any visitor can generate
database errors in the log.

Affected lines: `src/routes/order.routes.ts` 56, 136, 157, 179;
`src/routes/report.routes.ts` 55, 88; `src/routes/public.routes.ts` 96.

`src/routes/card.routes.ts` already does this correctly at lines 58, 87 and 122
with `Number.isInteger`. The fix is to apply the same guard consistently, or to
parse path ids once in shared middleware.

> **Fixed.** `src/middleware/params.ts` adds a `numericId` guard, applied to
> every route taking an id. A non-numeric, zero or negative segment now returns
> 400 with `id must be a positive whole number.` The ad-hoc checks in
> `card.routes.ts` were replaced by the shared guard so there is one rule.
> Nine regression cases were added to the sweep.

### H3 — No rate limiting on sign-in

Twenty consecutive failed sign-ins produced twenty clean 401 responses with no
delay, lockout or backoff:

```
401 401 401 401 401 401 401 401 401 401 401 401 401 401 401 401 401 401 401 401
```

Accounts are keyed by mobile number, which is guessable, and there are 21 of
them. Nothing limits how fast an attacker can work through a password list.

Worth adding: a per-address and per-account limit on `POST /api/auth/login`, and
a delay or lock after repeated failures on the same account.

> **Fixed.** `src/middleware/limits.ts` limits sign-in to 10 failed attempts per
> address per 15 minutes. Successful sign-ins are not counted, so a shared office
> address is not locked out by people signing in normally. Verified in production
> mode: `401 x10` then `429`. Limits are skipped outside production so local work
> and the sweep are not throttled.

### H4 — Session secret is still the placeholder

`.env` contains:

```
SESSION_SECRET=change-me-in-production
```

`src/lib/env.ts` requires the variable to be present but does not check its
value. A known secret means session cookies can be forged, which is
authentication bypass for every account including the administrator.

This must be a long random value before the service is deployed anywhere
reachable. Consider failing startup when `NODE_ENV=production` and the secret is
either absent or the placeholder.

> **Fixed.** `src/lib/env.ts` refuses to start under `NODE_ENV=production` when
> the secret is a known placeholder or shorter than 32 characters, and warns
> otherwise. Verified: production startup with the placeholder exits with the
> error and the generation command.

---

## Medium

### M1 — Staff listing reports the wrong total

`src/routes/user.routes.ts:87` passes the length of the current page as the
total row count:

```ts
res.json(paged(rows, rows.length, p));
```

`total` therefore always equals the page size and `total_pages` is always 1, so
a client cannot page past the first screen and cannot show a correct count. Every
other list endpoint issues a separate count query; this one was missed.

> **Fixed.** The listing now runs a count query alongside the page, sharing one
> query builder so the two cannot diverge. Verified: `per_page=2` returns
> `total 3, pages 2` where it previously reported `total 2, pages 1`.

### M2 — No security headers, and the stack is advertised

`GET /health` returns:

```
HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
```

Absent: `X-Content-Type-Options`, `X-Frame-Options` or a frame-ancestors policy,
and `Strict-Transport-Security`. `X-Powered-By` names the framework for no
benefit.

One `helmet()` call in `src/app.ts` covers all of this.

> **Fixed.** `helmet()` is applied, and `x-powered-by` is disabled. Verified:
> `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
> `Strict-Transport-Security`, `Referrer-Policy: no-referrer`, and no
> `X-Powered-By`. The content security policy is left off because Swagger UI
> needs inline styles; the API itself returns JSON.

### M3 — Verification logging is an unauthenticated insert

`POST /api/public/verify-log` writes to `reportsearches` with no session, no rate
limit and no length validation. Reproduced: three requests, three rows.

```
reportsearches rows: 2142 -> 2145
```

The table is a business record of who checked which certificate, so filling it
with noise degrades a real report. It is also unbounded growth from an anonymous
endpoint.

The endpoint has to stay public — it fires from the certificate verification
page — so the fix is rate limiting plus length caps on the three fields, not
authentication.

> **Fixed.** Limited to 60 lookups per address per hour. The endpoint stays
> public, as it must.

### M4 — No CORS configuration

Nothing in the project configures CORS, and the `cors` package is not installed.
The API and the planned React front end will be served from different origins
during development, and possibly in production, so **the browser will refuse
every call**. This blocks phase 06 of the migration before it starts.

Configure an allowlist of front-end origins with credentials enabled, since
authentication is a cookie. Do not use a permissive wildcard: `*` cannot be
combined with credentials, and a reflected origin would let any site call the
API with the user's session.

> **Fixed.** `cors` is configured from `CORS_ORIGINS`, defaulting to
> `http://localhost:5173`. Credentials are enabled and the origin list is
> explicit. Verified: an allowed origin receives `Access-Control-Allow-Origin`,
> a disallowed one receives none, so the browser blocks it.

---

## Low

### L1 — The ledger is unpaginated

`GET /api/transactions/ledger` returns every transaction touching a user with no
limit. The busiest account currently holds 66 entries, so this is not a problem
today, but it grows without bound and the endpoint computes a running balance
over the whole set in memory.

Pagination interacts with the running balance — a page of entries needs the
balance carried forward from everything before it — so this needs a little
thought rather than a `limit` clause.

> **Fixed.** `GET /api/transactions/ledger` accepts `page` and `per_page`,
> defaulting to 100 and capped at 500, and returns `total`, `offset` and `limit`.
> The balance is still accumulated across the whole history so every entry shows
> the correct running figure, but only the requested slice is returned.

### L2 — Changing a password leaves other sessions signed in

`POST /api/auth/change-password` updates the hash but does not invalidate
sessions held elsewhere. Someone who changes their password because they believe
it was compromised stays compromised: the attacker's existing session keeps
working until it expires on its own, eight hours later.

Sign-in regenerates the session correctly (`src/routes/auth.routes.ts:36`), so
fixation at login is already handled; this is the separate case of revoking
sessions that already exist. It needs a session store that can enumerate a
user's sessions — the current one is the in-memory default, which is itself
unsuitable for production.

> **Held.** Revoking sessions that already exist needs a session store that can
> be queried by user. The current store is the in-memory default, which Express
> itself warns is unsuitable for production, so this should be settled as one
> decision about session storage rather than patched around.

### L3 — No automated tests

`npm test` is the npm placeholder:

```
echo "Error: no test specified" && exit 1
```

Coverage today comes from three purpose-built scripts, which is more than
nothing and genuinely useful:

| Script | What it proves |
| --- | --- |
| `npm run sweep` | 104 checks across four roles: status and response shape |
| `npm run check:spec` | the OpenAPI document matches the mounted routers |
| `npm run check:pricing` | pricing matches 223 of 255 stored totals |

But all three need a running server and a populated database, so none can run in
CI on a clean checkout, and none pin the behaviour of a single function. The
pricing rules and the report number format are the two places where a unit test
would earn its keep, because both are exactly specified and both are expensive
to get wrong.

> **Fixed in part.** `npm test` now runs 14 unit tests over exactly those two
> areas, with no database and no running server, so they work in CI on a clean
> checkout. The GST truncation, the carat-weight parsing of the malformed live
> values, and the report number format are all pinned against real data. Broader
> coverage remains ongoing work.

### L4 — No audit trail

Nothing records who amended an order or a certificate. `PATCH /api/orders/:id`
and `PATCH /api/reports/:id` overwrite values in place, and only `updated_at`
changes. Certificates are documents of record; if one is amended after issue
there is no way to say who did it or what it said before.

The database has no column for this, so it is a schema question rather than a
code change, and it is reasonable to defer. Worth raising with the business
rather than deciding unilaterally.

> **Held.** Raise with the business.

---

## What was checked and found sound

Recording these so a later reader knows they were examined rather than skipped.

**Authorisation.** Every route below `/api` requires a session; public routes are
mounted before the guard and are the fourteen listed in the routes file. Records
are filtered to the caller's laboratory, and requesting another laboratory's
order, certificate, quote, delivery or dues collection returns 403 rather than
the row. Verified across all four role tiers in the sweep.

**Role handling.** Guards admit `role_id > 2` for staff, so roles 4 and 5 are
included, matching the Laravel middleware. Administrators are role 1, numerically
below laboratory at 2 — a bug from an earlier revision excluded them from every
scoped route and was caught by the sweep.

**Password compatibility.** Existing Laravel `$2y$10$` hashes verify under
`bcryptjs`, so no account needs a reset at cutover. New hashes are written at
cost 10 so old and new rows stay uniform.

**SQL injection.** All queries go through Kysely, which parameterises. No string
interpolation into SQL anywhere in the project.

**Error responses.** Unexpected failures return a generic message; stack traces
and SQL text stay in the server log. Confirmed on the H2 failure above, which
logs the MySQL error but returns only `Something went wrong on our side.`

**Money handling.** Order totals are computed from the price bands server-side
and never taken from the request body. Multi-table writes — order creation, dues
collection, settle-and-deliver, certificate issue — are wrapped in database
transactions. Commission is derived from the laboratory's configured rate rather
than supplied by the caller.

**Certificate integrity.** Report numbers are never reallocated on amendment. An
order item cannot be removed, nor its quantity reduced below the number of
certificates already issued against it.

**Asset handling.** Card rendering reads only from the configured legacy public
directory; a path in the database that escapes it is rejected rather than
followed.

---

## Status

Fixed and verified in this project:

| Finding | Change |
| --- | --- |
| H2 | shared `numericId` guard on every id route |
| H3 | sign-in rate limit, 10 failures per address per 15 minutes |
| H4 | production startup refuses a placeholder session secret |
| M1 | staff listing counts rows properly |
| M2 | `helmet()`, and `x-powered-by` disabled |
| M3 | verification logging rate limited |
| M4 | CORS allowlist with credentials |
| L1 | ledger paginated |
| L3 | 14 unit tests over the pricing and certificate-number rules |

Verification after the changes:

```
npm run sweep          113/113 behaved as documented
npm run check:spec     spec matches the routers
npm run check:pricing  223/255 exact, all 32 differences explained
npm test               14 tests, 14 pass
```

Still open, each needing a decision rather than code:

- **H1** — add the indexes during an agreed window.
- **L2** — choose a session store, then revoke on password change.
- **L4** — decide with the business whether certificate amendments must be
  attributable, which needs a schema change.
