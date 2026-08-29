# Migrations

Plain SQL, numbered in order, applied by a runner that does nothing else.

```bash
npm run migrate:status        # what is applied here, what is pending
npm run migrate -- --dry      # print what would run, touch nothing
npm run migrate               # apply the pending files
```

## Why there is a runner now

This file used to say there was **deliberately no migration tool**, because a
tool that can diff a schema can also drop a table, and the database holds 22,103
certificates and 9,608 orders with no foreign keys to protect them.

That reasoning still holds, and `src/db/migrate.ts` is not that kind of tool. It
cannot generate SQL, cannot compare a schema to a model, and has no opinion about
what the database should contain. It reads these files, runs the ones that have
not run here, and writes down what it did.

What running them by hand actually cost: nothing recorded which files had been
applied to which database. A second environment was one forgotten file away from
a schema subtly different from this one, and that shows up as a missing column
at runtime rather than as an error at deploy time.

## What it will not do

| Guard | Behaviour |
| --- | --- |
| A file that drops anything | Prints the `DROP` statements and refuses without `--allow-drop`. Dropping is a decision, not a side effect of running a command. |
| An applied file that has been edited | Refuses to run anything and names the file. A migration is a record of what happened, not a document to revise. |
| A file that fails halfway | Stops, prints the failing statement and how many ran before it, and records nothing for that file. **MySQL DDL does not roll back** — what ran stays, and the rollback comment at the bottom of every file is how to reverse it. |
| A file marked `-- @blocked <reason>` | Skipped, with the reason printed. That is how `002` stays out of the way until its duplicates are resolved. |

`npm run migrate -- --baseline` records every pending file as applied **without
running it** — for a database that already has those changes, which is how this
one was brought under the runner.

The `schema_migrations` table holds the file name, a checksum, the statement
count and when it ran. It is the runner's only state.

Every file also carries its own rollback in a comment at the bottom.

| File | State | What |
| --- | --- | --- |
| `001-indexes.sql` | **applied** | 31 indexes. Additive, reversible, no column or row changes. |
| `002-unique-constraints.sql` | blocked | Unique on `reports.report_no` and `users.mobile`. Existing duplicates must be resolved first. |
| `003-students-enquiries.sql` | **applied** | The general enquiry book, and the first cut of a students table. |
| `004-student-pipeline.sql` | **applied** | Replaces that table with the five-stage pipeline: enquiry, registration, course, enrolment, certificate. Drops the empty `students` table from 003, so it needs `--allow-drop` on a database where 003 ran. |
| `005-custom-roles.sql` | **applied** | Roles gain an owner, the permission list becomes a table, and one person can be granted permissions individually. |
| `006-super-admin-role-zero.sql` | **applied, then reversed by 007** | Moved head office to role 0. Kept in place rather than deleted: it ran here, and a migration that has run is a record of what happened. |
| `007-roles-back-to-one-two-three.sql` | **applied** | Head office back to 1, laboratory 2, team 3, and the three renamed to say so. Role 0 dropped. |
| `010-reset-to-one-account.sql` | **run by hand** | Deleted every account but head office and all the work belonging to them — 22,103 certificates, 9,608 orders, 297 transactions. Marked `@blocked` so the runner never applies it. Backup: `iigl-backup-before-reset-2026-08-29.sql`. |
| `008-users-parent-id.sql` | **applied** | `users.parent_id` — the current employer, denormalised from `employements` so a scope check costs no join. Backfilled; `npm run check:parents` reports drift. |
| `009-parent-id-is-empid.sql` | **applied** | Both parent columns now name the employer by their `users.empid` (`'LAB0005'`) rather than by id. `employements.parent_id` becomes `varchar(50) NOT NULL`, `users.parent_id` `varchar(50) NULL`; both backfilled through `users.id`. Drops the two numeric columns inside `ALTER TABLE`, which the runner's `--allow-drop` guard does not catch — take a dump first. |
| `011-discount-coupons.sql` | **applied** | `discount_coupons` and `coupon_redemptions`: a coupon is a rule for taking money off, written before anybody uses it, for laboratories, customers or students. Additive; the enrolment discount on `student_courses` is untouched and stays where the fee it reduces lives. |
| `012-coupons-are-course-only.sql` | **applied** | Narrows 011: a coupon is money off a **course fee** and nothing else, so `audience`, `target_id` and `owner_id` go and `course_id` arrives. Both tables dropped and recreated — they held zero rows — so it needs `--allow-drop`. |

---

## 001 — indexes

Audit finding H1. Before this the database carried no index but the primary key
on any table, so every laboratory-scoped query was a full table scan.

Measured on the same query, before and after:

```
before   Table scan on reports                              cost 2316   rows 21318
after    Covering index lookup using idx_reports_lab        cost  237   rows  2325
```

Every hot path now resolves through an index — certificate lists, order lists,
the dashboard, sign-in by mobile, certificate verification by number, the order
detail join, and the ledger.

Cost: about 5 MB of index across the four large tables, against 14 MB of data.

Safe against a live database. InnoDB builds these online, neither application
reads an index by name, and no column changes type.

---

## 002 — unique constraints

Not runnable yet. Both are blocked by data that already violates them:

- one certificate number issued twice, and
- three mobile numbers held by two accounts each.

Each file section carries the precondition query and the rows it currently
returns. Resolve the data, confirm the query returns nothing, then run the
`ALTER TABLE` it names.

Until then the API's own checks are the only guard, and an application check
cannot win a race against a concurrent request.

---

## Foreign keys: deliberately not added

The database has none, on any of its 26 tables. Adding them was investigated and
is **not** a safe change today, for two independent reasons.

### The column types do not match

A foreign key requires the two columns to be the same type. They are not:

| Child | Type | Parent | Type |
| --- | --- | --- | --- |
| `orders.lab_id` | `int` | `users.id` | `bigint unsigned` |
| `order_details.order_id` | `int` | `orders.id` | `bigint unsigned` |
| `reports.order_detail_id` | **`varchar(255)`** | `order_details.id` | `bigint unsigned` |
| `reports.lab_id` | `int` | `users.id` | `bigint unsigned` |

Fixing that means `ALTER TABLE … MODIFY COLUMN` on tables of 22,103 and 9,608
rows, which rewrites them and takes a write lock. It would also change what the
Laravel application reads while it is still running against the same database.

### Zero is used as a sentinel

Two columns use `0` to mean "nobody", and there is no user 0 for a key to point
at:

| Column | Rows with 0 | Means |
| --- | --- | --- |
| `transactions.send_by` | 283 | Collected from a walk-in customer, who has no account |
| `reports.lab_id` | 69 | No laboratory recorded |

A foreign key would reject every one of those rows. Making them `NULL` first is
a data change across 352 rows, and `send_by` is `NOT NULL`, so that column would
have to change too.

**Neither is impossible; both are a separate, planned piece of work with a
window and a backup — not something to add alongside an index migration.** The
right time is after cutover, when only one application reads the database.

### One key is not the primary key

Since 009, `employements.parent_id` and `users.parent_id` name an employer by
their `users.empid` rather than by `users.id`. `empid` is `varchar(50)` and
UNIQUE, so it identifies a row as exactly as the primary key does and would take
a foreign key on the same terms as anything else here — but unlike an id it is
editable, so a rename can orphan the rows pointing at it. Nothing in the schema
refuses that. Two things stand in for it: `PATCH /api/users/{id}` will not change
an `empid` any employment still points at, and `npm run check:parents` reports a
parent no account holds.
