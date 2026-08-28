# Feature gap — Laravel to Node

Derived by parsing every route in `iigl.org_old/iigl.org/routes/web.php` and
mapping it onto the OpenAPI document and the admin panel.

## Status

**All six cutover blockers are now built.** The API went from 53 endpoints to
99. What remains is front-end work for the new endpoints, plus the items under
"needed, but not blocking".

| Blocker | State |
| --- | --- |
| File uploads | Built — `POST /api/uploads/{bucket}`, nine buckets, written into the Laravel directories |
| Role permissions | Built and **enforced**, with a screen — matrix read and edited, order visibility narrowed to match |
| Laboratory and staff records | Built — account edit, password reset, employment attach and end |
| Receipts and invoices | Built — `GET /api/cards/order/{kind}/{id}` |
| Attendance | Built — clock in, clock out, break, history |
| Profile editing | Built — `PATCH /api/users/me` |

Content management is also built: articles, branch pages, certificate types,
banners, static pages and roles.

**Every one now has a screen in the admin panel.** Attendance, profile and
password, website content, roles and permissions, account editing with password
reset and employment moves, and receipt and invoice printing from the order.
Uploads are a shared field used wherever an image or document is attached.

Two questions from the original analysis are still open and still worth
answering: whether attendance is genuinely in daily use, and which of the three
multi-card layouts is the one that gets printed.

The sections below are the original analysis, kept as the record of what was
found and why each item mattered.

| | |
| --- | --- |
| Laravel routes | 195 |
| Node API endpoints | 53 |
| Admin panel screens | 11 |

The counts are not comparable directly. Laravel serves a page per form — a
`create` route and an `edit/{id}` route that only render HTML — while the panel
renders those from data it already holds. Roughly 45 of the 195 are form pages
with no API equivalent needed.

Everything below is grouped by whether it blocks cutover.

---

## Blocks cutover

Work that has to exist before the Laravel application can be switched off,
because someone uses it to do their job.

### 1. Attendance

`AttendanceController`, 4 routes, `attendances` table.

| Laravel | What it does |
| --- | --- |
| `GET /employee/attendance/clockIn` | Records a start time for today |
| `GET /employee/attendance/clockOut` | Records the end time and marks the day complete |
| `GET /employee/attendance/breakStatus` | Starts and ends a break |
| `GET /employee/attendance` | The employee's own attendance history |

Nothing in the new API touches this. Staff clock in and out here daily.

Only 6 rows exist, which suggests it is either lightly used or recently
introduced — **worth confirming with the team before building it**, because six
rows across 15 staff is not the shape of a feature in daily use.

### 2. File uploads

Every upload in the old application writes into the Laravel `public/`
directory. The new API references those paths but writes none of them:

| Directory | Holds |
| --- | --- |
| `uploads/report` | Item photographs on certificates |
| `uploads/signature` | Laboratory signatures printed on cards |
| `uploads/order` | Customer images attached to an order |
| `uploads/employee` | Staff photographs |
| `uploads/banner`, `uploads/icon`, `uploads/website` | Site imagery |
| `uploads/documentation` | Laboratory documents |
| `screenshots` | Payment proof attached to transactions |

Certificate rendering reads from these today via `LEGACY_PUBLIC_ROOT`, so cards
still print. But **no new item image or signature can be added through the new
system**, which makes issuing a certificate with a photograph impossible.

`multer` is installed against this work; nothing uses it yet.

### 3. Role permissions

`role_permissions`, 70 rows — 14 action types across all 5 roles, each with
view, create, update and delete flags.

Action types in use: `account`, `admin_employee`, `customer`,
`employee_management`, `laboratory`, `product_collection`, `report`,
`visitor_book`, `website_blog`, `website_contact`, `website_education`,
`website_enquiry`, `website_home`, `website_report`.

This is **enforced**, not decorative. `OrderController` and the employee
dashboard both call `filterPermission()` and change what an employee sees based
on the result — an employee without `product_collection` view and create rights
sees only orders they received or were assigned, rather than the laboratory's
whole queue.

The new API has role guards but no permission matrix, so every staff member
currently sees everything their laboratory has. That is a **widening of access**
relative to the old system, and it needs closing before cutover rather than
after.

Neither reading nor editing the matrix is implemented.

### 4. Laboratory and staff records

| Laravel | New API |
| --- | --- |
| `POST /admin/laboratory/store` | — |
| `POST /admin/laboratory/update/{id}` | commission and active flag only |
| `POST /admin/employee/store` | `POST /api/users` (account only) |
| `POST /admin/employee/update/{id}` | — |
| `POST /admin/assign-employee` | — |
| `GET /admin/employee/assignment` | — |

A laboratory cannot be created or edited, and a staff account cannot be
attached to a laboratory. `POST /api/users` makes an account that belongs to
nobody, so a new employee cannot actually work until a row is added to
`employements` by hand.

### 5. Receipts and invoices

`GET /print-receipt/{id}` and `GET /print-invoice/{id}`.

Certificate cards are ported; the order paperwork is not. These are what the
customer is handed at the counter.

### 6. Profile and password

| Laravel | New API |
| --- | --- |
| `GET /{role}/profile` | `GET /api/users/me` reads it |
| profile update | — |
| `GET /{role}/change-password` | `POST /api/auth/change-password` exists |

Reading a profile works; editing one does not.

---

## Needed, but not blocking

Useful, in use, and can follow cutover without stopping anyone working.

### 7. Content management

Read endpoints exist for all of these; nothing can be edited.

| Area | Rows | Laravel routes |
| --- | --- | --- |
| Blog | 2 | create, store, edit, update |
| Branch city pages | 6 | open, opened, update, updated |
| Report types | 4 | create, store, edit, update |
| Banners | 8 | index, store |
| Website pages and policies | 4 | about, about/update, policy |

The public site reads them, so the pages keep working. They just cannot be
changed except through the old admin.

### 8. Roles

`GET /api/users/roles` lists them. Creating and editing a role is not
implemented — `POST /admin/role/store`, `GET /admin/role/update/{id}`.

Five roles exist and have been stable since 2021, so this is low urgency.

### 9. Customer lists — closed

`GET /{role}/customer/register`, `/customer/non-register`, and
`/admin/customer/verifier-users` are now
`GET /api/customers/registered`, `/unregistered` and `/verifiers`, with a
Customer screen in the panel.

There is no customer table: a customer is whoever has placed an order, so these
group `orders` by mobile number, scoped the way the order list is. "Registered"
means a GST number is present, which is the only distinction the data draws —
11 mobile numbers of 3,093 carry one, and no row holds an empty string, so the
Laravel `whereNotNull('gst')` and this split the same way.

Verifiers come from `reportsearches`. All 2,142 rows have a blank `fullname` —
the public verification form never asked for a name — so that tab shows the
number, the count of lookups and the date, and no name column.

### 10. Dashboard drill-downs

`Admin\DashboardController` has 12 routes: all-orders, all-delivered,
all-active, all-today, total-sale, total-paid, total-dues, `card/{card}`,
wallet, total-commision, dues-commision.

`GET /api/dashboard/summary` returns the numbers. Most drill-downs are
reachable through `GET /api/orders?status=`, but three are not: the
`card/{card}` breakdown, total commission, and dues commission.

### 11. Multi-card print layouts

`ReportController@MultiSmartCard` renders three different layouts depending on a
`print` parameter — `0` for `multsmart`, `99` for `multsmart2`, anything else
for `smartCardwithheader`.

The new `POST /api/cards/smart` renders one layout. **Ask which of the three is
the one actually printed**; the other two may be abandoned experiments.

### 12. Order intake — closed

`OrderController@create` / `store` is now `POST /api/orders` with a **Collect
new** screen. A mobile number that has ordered before fills the rest of the form
from that customer's last order, the way the Laravel counter screen does.

The dues list — `EmpOrderDuesList`, its own screen in Laravel — is
`GET /api/orders?dues=1` here. `dues_amount` is a varchar, so the filter coerces
it numerically: compared as text, `'100'` and `'0.00'` land on the wrong side.

### 13. Messages — nothing to migrate

Both sidebars show Message, with Send Message and Message History. Both entries
are `href="#"` in the Blade: no route, no controller, no table. The feature was
never built, so it is not in the new menu either.

### 14. Employee views inside the laboratory portal

`GET /laboratory/employee/wallet` and `GET /laboratory/employee/order` — a
laboratory looking at one of its staff members' wallet and order history.
`GET /api/users/staff` lists staff but does not drill into either.

---

## Deliberately not ported

Recorded so nobody rebuilds them by mistake.

| Feature | Why |
| --- | --- |
| `POST /regsiter`, `GET /verifysponserid` | Writes `userid`, `name`, `position`, `sponserid` — none of which exist in `users`. Contains a `$$last_child` double-dollar bug. Pasted in from another project; cannot ever have run. |
| `ReportController@editgetreportform` | Routed at `/report/getformdata/{sid}/{rid}` but the method does not exist. Returns 500. |
| `HolidayController`, `SliderController`, `OrderDetailController` | Empty classes, 10 lines each, no methods, no routes. |
| `FormlayoutController` | 5 real methods but **no route reaches it**. The `formlayouts` table holds 2 rows. `GET /api/catalog/form-layouts/:categoryId` reads them; the editor was never wired up in the old app either. |
| Laravel auth scaffolding | `ForgotPasswordController`, `ResetPasswordController`, `VerificationController` — framework defaults with no routes. There is no password reset in the old application either. |

---

## Suggested order

1. **Uploads** — blocks certificate issue, and several later items depend on it.
2. **Role permissions** — the new system currently grants staff more access than
   the old one. Close that before cutover, not after.
3. **Laboratory and staff records**, including employment assignment — without
   it no new person can be onboarded.
4. **Receipts and invoices** — counter paperwork.
5. **Attendance** — confirm it is really used first.
6. **Profile editing.**
7. Everything under "needed, but not blocking", in whatever order suits the
   team.

Two questions worth answering before any of it: whether attendance is genuinely
in daily use, and which of the three multi-card layouts is the one that gets
printed.
