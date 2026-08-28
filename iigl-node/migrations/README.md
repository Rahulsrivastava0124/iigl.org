# Migrations

Plain SQL, run by hand, numbered in order.

There is deliberately **no migration tool** in this project. The database is
shared with the Laravel application, holds 22,103 certificates and 9,608 orders,
and has no foreign keys to protect them. A tool that can diff a schema can also
drop a table, and nothing here needs that power.

```bash
mysql -u root -p iigl < migrations/001-indexes.sql
```

Every file carries its own rollback in a comment at the bottom.

| File | State | What |
| --- | --- | --- |
| `001-indexes.sql` | **applied** | 31 indexes. Additive, reversible, no column or row changes. |
| `002-unique-constraints.sql` | blocked | Unique on `reports.report_no` and `users.mobile`. Existing duplicates must be resolved first. |

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
