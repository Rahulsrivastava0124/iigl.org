# Phase 07 — parity

```bash
npm run parity
```

Read-only. Nothing in this check writes to the database.

## What this is, and what it is not

The Laravel application **cannot be run on this machine** — there is no PHP
runtime, though its `vendor/` directory is present. So this is not two live
systems answering the same request.

Instead, every figure the old application produces was transcribed from its
source into SQL, run against the same database, and diffed against what this API
returns. That catches a difference in *logic*, which is what breaks at cutover.
It does not catch a difference in PHP's runtime behaviour — a string-to-number
coercion, say — so anything reported as equal here is equal **by transcription,
not by execution**.

Standing up PHP and replaying a week of real orders through both would close
that gap. It is worth doing before the final cutover if a PHP environment can be
made available.

## Result

**13 of 16 checks match.** The three that differ are all pre-existing data
problems rather than porting defects, and each needs a decision rather than
code.

| Area | Result |
| --- | --- |
| Dashboard counts and money | match |
| Ledger and wallet, all 21 accounts | match |
| Certificate attribute resolution | match |
| Certificate QR and subcategory | match |
| Certificate number format | match |
| Public page addresses | match |
| Staff attached to a laboratory | match |
| Duplicate certificate number | **1 in the existing data** |
| Recomputed order totals | 223/255 |
| Duplicate mobile numbers | **3 numbers** |

---

## Two defects this found, both now fixed

### The dashboard was overstating revenue by 7,808

`Admin\DashboardController@adminindex` sums **`payable_amt` over delivered
orders only**. The API was summing `total_amount` over *every* order.

Those are different things. `total_amount` is the list price before discount;
`payable_amt` is what was actually charged. Summing the wrong column over the
wrong set produced a figure 7,808 below the Laravel one — and it is what made
the dashboard appear to show more collected than billed.

Now aligned. The live endpoint returns `sale: 113778`, matching the Laravel
query exactly.

This is the kind of thing only a parity check finds. Both numbers looked
plausible on their own.

### Certificate numbering could issue a duplicate

The number is a running per-laboratory count, so two certificates created in the
same second can read the same count. The ported implementation inherited that
race.

`createReport` now checks for a collision and steps the count past it before
inserting. There is no unique index on `report_no` to catch it at the database
level; one should follow once the existing duplicate is resolved.

---

## Three findings that need a decision

### 1. One certificate number was issued twice

```
043100002110
  report 399 · order 24 · item 26 · 2.320 / 0.32 · lab 4 · 2021-11-01 09:54:06
  report 400 · order 11 · item 12 · 1.20  / 0.23 · lab 4 · 2021-11-01 09:55:27
```

Two different stones, two different orders, the same certificate number, 81
seconds apart. Both certificates are in circulation.

This is a document of record, so it is not something code can quietly fix.
Someone has to decide whether one is reissued under a new number, and whether
the customer is told.

Until it is resolved, a unique index on `report_no` cannot be added — which is
what would stop it happening again at the database level.

### 2. Order totals: 223 of 255 recompute to the stored figure

Unchanged from the pricing analysis, and fully explained:

- **31** are orders placed before their laboratory was given its own price
  bands. Laboratory 4 got custom rates in July 2022 and laboratory 14 in April
  2023. Orders carry no price snapshot, so recomputing an old order applies
  today's rates. Laboratories whose rates never changed match 100%.
- **1** is order 64, where the stored total of 110 covers one certificate but
  three were issued twelve days before delivery. The original figure is simply
  wrong.

Worth deciding: whether historical orders should be left as billed — which is
almost certainly right, since that is what the customer paid — or whether a
price snapshot should be stored on future orders so this cannot recur.

### 3. Three mobile numbers each have two accounts

| Number | Accounts |
| --- | --- |
| 8420126860 | 4 IIGL-KOLKATTA (laboratory) · 23 Sanjoy Naskar (staff) |
| 9474797199 | 5 IIGL-MALDA (laboratory, inactive) · 7 MOSHMI SHARMA (staff) |
| 9851562223 | 15 Mintu Sarkar (inactive) · 19 Mintu Sarkar (staff) |

Sign-in now resolves by password, so nobody is locked out. But `users.mobile`
carries no unique constraint, so the duplicates remain and more can be created.

Someone has to say which account is canonical for each number. A unique index
should follow the cleanup.

---

## Recorded for reconciliation

These are not diffed because the API derives them differently by design.

| Figure | Value |
| --- | --- |
| Commission owed across laboratories, by the Laravel per-lab loop | 12,630.18 |
| Commission approved | 0 |
| Commission awaiting approval | 0 |
| Orders with `paid_amount` above `total_amount` | 134 |
| Orders carrying no total at all | 9,353 of 9,608 |

The Laravel figure totals what every employee of a laboratory received and
applies the laboratory's rate to it. The API instead records a commission
payment derived from that rate at the moment it is sent. The two answer
different questions and should not be expected to agree — but the 12,630.18
is what the old dashboard has been showing, so it is worth confirming against
what the business believes is owed.

---

## Before cutover

1. Resolve the duplicate certificate number, then add a unique index on
   `report_no`.
2. Decide the canonical account for each duplicated mobile number, then add a
   unique index on `users.mobile`.
3. Add the indexes in [AUDIT.md](AUDIT.md) H1 during an agreed window.
4. Set a real `SESSION_SECRET` and move sessions out of memory.
5. Point `LEGACY_PUBLIC_ROOT` at the server's uploads directory.
6. If a PHP environment can be made available, replay a week of real orders
   through both systems and diff the resulting rows. That is the one check this
   phase could not perform.
