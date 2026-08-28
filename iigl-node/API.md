# IIGL API

102 endpoints. Generated from the OpenAPI document by `npm run docs` — do not edit by hand.

The interactive version is at `/docs` when the server is running, and the raw
document at `/openapi.json`.

## Getting a session

```http
POST /api/auth/login
Content-Type: application/json

{ "mobile": "9800000000", "password": "…" }
```

The response sets an httpOnly cookie named `iigl.sid`. Send it with every
subsequent request — `credentials: "include"` in the browser, `-b` with curl.
Sessions last eight hours.

Passwords are the existing Laravel bcrypt hashes, so credentials carried over
from the PHP application unchanged.

A number held by more than one account resolves by password: sign-in compares
against every account on that number and picks the one it matches, rather than
taking the lowest id. Three active staff were locked out by that in the old
system.

## Roles

| `role_id` | Role | Sees |
| --- | --- | --- |
| 1 | Administrator | Everything, and the matrix does not restrict them |
| 2 | Laboratory | Its own orders, certificates, staff and money |
| 3, 4, 5 | Lab employee, manager, office boy | Their laboratory, narrowed by the permission matrix |

Staff guards test `role_id > 2`, so roles 4 and 5 are included. Do not hardcode
`role_id === 3`.

Records are filtered to the caller’s laboratory. Requesting another
laboratory’s record by id returns 403 rather than the row.

`role_permissions` narrows staff further. Without view and create on
`product_collection`, a person sees only the orders they took or were assigned.

## Conventions

**Every response is wrapped.** A single record comes back as `{ "data": … }`;
a list adds `meta`:

```json
{
  "data": [ … ],
  "meta": { "page": 1, "per_page": 50, "total": 9608, "total_pages": 193 }
}
```

**Pagination** is `?page=` and `?per_page=`, one-indexed, capped per endpoint.

**Errors** are always the same shape, and the message is written for a person:

```json
{ "error": "conflict", "message": "All 2 reports for this item have already been created." }
```

| Status | `error` | Means |
| --- | --- | --- |
| 400 | `bad_request` | The request is wrong. The message says how. |
| 401 | `unauthorized` | No session, or it expired. |
| 403 | `forbidden` | Another laboratory’s record, or the role lacks access. |
| 404 | `not_found` | No such record. |
| 409 | `conflict` | The request is valid but the state forbids it. |
| 429 | `too_many_requests` | Rate limited. Sign-in and verification logging only. |
| 500 | `internal` | Our fault. The detail is in the server log, not the response. |

**A path id must be a positive whole number.** Anything else is a 400 before
any query runs.

**Uploads are separate from saving.** `POST /api/uploads/{bucket}` returns a
path; submit that path with the form it belongs to. An abandoned form leaves a
file on disk and no record, which is the cheaper failure.

**PDFs stream inline** with `Content-Type: application/pdf`. Add `?format=html`
to any card or document endpoint to get the markup instead — that is what to
diff against the Laravel output when checking for visual drift.

---

# Endpoints


## Auth

Sign in, sign out, and the current session.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/auth/change-password` | session | — | **current_password**, **new_password** | 400, 401 | Change your own password |
| POST | `/api/auth/login` | public | — | **mobile**, **password** | 400, 401 | Sign in |
| POST | `/api/auth/logout` | public | — | — | — | Sign out |
| GET | `/api/auth/me` | session | — | — | 401 | Current session |

## Public

Open endpoints: the marketing site and certificate verification.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/public/banners` | public | `type` | — | — | List active banners |
| GET | `/api/public/blogs` | public | — | — | — | List articles |
| GET | `/api/public/blogs/{slug}` | public | — | — | 404 | Read an article |
| GET | `/api/public/branches` | public | — | — | — | List branch city pages |
| GET | `/api/public/branches/{slug}` | public | — | — | 404 | Read a branch page |
| GET | `/api/public/pages/{pageType}` | public | — | — | 404 | Website page content |
| GET | `/api/public/report-types` | public | — | — | — | List certificate types |
| GET | `/api/public/verify-by-id/{id}` | public | — | — | 404 | Verify a certificate by its id |
| POST | `/api/public/verify-log` | public | — | fullname, mobile, report_no | — | Record a verification lookup |
| GET | `/api/public/verify/{reportNo}` | public | — | — | 404 | Verify a certificate |
| GET | `/health` | public | — | — | — | Liveness probe |
| GET | `/openapi.json` | public | — | — | — | This document |

## Catalog

Categories, subcategories, attributes and their values.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/catalog/attributes/{id}/values` | session | — | — | 401, 403 | Allowed values for an attribute |
| GET | `/api/catalog/categories` | session | — | — | 401, 403 | List categories |
| GET | `/api/catalog/categories/{id}/subcategories` | session | — | — | 401, 403 | Subcategories of a category |
| GET | `/api/catalog/form-layouts/{categoryId}` | session | — | — | 401, 403, 404 | Form layout for a category |
| GET | `/api/catalog/report-types` | session | — | — | 401, 403 | Certificate types |
| GET | `/api/catalog/subcategories` | session | — | — | 401, 403 | List all subcategories |
| GET | `/api/catalog/subcategories/{id}/attributes` | session | — | — | 401, 403 | Certificate form fields for a subcategory |
| GET | `/api/catalog/units` | session | — | — | 401, 403 | Weight units |

## Orders

Customer orders and the items on them.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/orders` | session | `page`, `per_page`, `status`, `dues` | — | 401, 403 | List orders |
| POST | `/api/orders` | session | — | — | 400, 401, 403, 409 | Create an order |
| GET | `/api/orders/{id}` | session | — | — | 401, 403, 404 | Read an order with its items and certificates |
| PATCH | `/api/orders/{id}` | session | — | customer_name, mobile, alt_mobile, email, gst, address, dues_date, show_name_in_card, +2 more | 400, 401, 403, 404, 409 | Amend an order |
| POST | `/api/orders/{id}/deliver` | session | — | discount, paid_amount, pay_mode, transaction_no | 400, 401, 403, 404 | Settle and deliver an order |
| GET | `/api/orders/{id}/quote` | session | `discount` | — | 401, 403, 404 | Price an order |
| GET | `/api/orders/customer/lookup` | session | `mobile` | — | 401, 403 | Find a returning customer by mobile |
| DELETE | `/api/orders/items/{id}` | session | — | — | 401, 403, 404 | Remove an item from an order |

## Reports

Certificates issued against order items.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/reports` | session | `page`, `per_page`, `order_id` | — | 401, 403 | List certificates |
| POST | `/api/reports` | session | — | — | 400, 401, 403, 409 | Issue a certificate |
| GET | `/api/reports/{id}` | session | — | — | 401, 403, 404 | Read a certificate |
| PATCH | `/api/reports/{id}` | session | — | subcategory_id, gross_weight, gross_wt_unit, carat_weight, stone_wt_unit, size, comments, is_approx, +2 more | 400, 401, 403, 404 | Amend a certificate |

## Transactions

Remittances, approvals, dues collection and wallet balance.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/transactions` | session | `page`, `per_page`, `direction`, `status` | — | 401, 403 | List transactions |
| POST | `/api/transactions` | session | — | **amount**, **pay_mode**, transaction_no, transaction_type, remark, attachment | 400, 401, 403 | Send a remittance |
| POST | `/api/transactions/{id}/status` | session | — | **status** | 400, 401, 403, 404 | Approve or decline a remittance |
| POST | `/api/transactions/commission` | session | — | **commission_on**, pay_mode, transaction_no, remark, attachment | 400, 401, 403 | Pay commission to the administrator |
| POST | `/api/transactions/dues/{orderId}` | session | — | **amount**, pay_mode, transaction_no, remark | 400, 401, 403, 404 | Collect dues against an order |
| GET | `/api/transactions/ledger` | session | `user_id` | — | 401, 403 | Running account |
| GET | `/api/transactions/wallet` | session | — | — | 401, 403 | Your balance |

## Users

Laboratories, staff and account administration.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/users` | session | — | **fullname**, **mobile**, **password**, **role_id**, email | 400, 401, 403, 409 | Create an account |
| GET | `/api/users/{id}` | session | — | — | 401, 403, 404 | Read one account |
| PATCH | `/api/users/{id}` | session | — | fullname, mobile, email, role_id, is_active, commision, empid, address, +2 more | 400, 401, 403, 404, 409 | Update any account |
| PATCH | `/api/users/{id}/active` | session | — | is_active | 401, 403, 404 | Activate or deactivate an account |
| POST | `/api/users/{id}/employment` | session | — | **lab_id**, joining_date, salary, remark | 400, 401, 403, 404, 409 | Attach a person to a laboratory |
| POST | `/api/users/{id}/employment/end` | session | — | leave_date, remark | 401, 403, 404 | End an employment |
| POST | `/api/users/{id}/password` | session | — | **password** | 400, 401, 403, 404 | Reset someone's password |
| GET | `/api/users/laboratories` | session | — | — | 401, 403 | List laboratories |
| GET | `/api/users/me` | session | — | — | 401, 403 | Your account record |
| PATCH | `/api/users/me` | session | — | fullname, owner_name, alt_mobile, email, address, city, state, pincode, +7 more | 400, 401, 403 | Update your own profile |
| GET | `/api/users/roles` | session | — | — | 401, 403 | List roles |
| GET | `/api/users/staff` | session | `page`, `per_page`, `lab_id` | — | 401, 403 | List staff |

## Dashboard

Aggregate counts and totals.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/dashboard/summary` | session | — | — | 401, 403 | Counts and totals |

## Cards

Printed certificates: smart cards and classic reports.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/cards/{kind}` | session | `format` | **report_ids** | 400, 401, 403, 404 | Print several certificates as one PDF |
| GET | `/api/cards/{kind}/{id}` | session | `format` | — | 400, 401, 403, 404 | Print one certificate |
| GET | `/api/cards/data/{id}` | session | — | — | 401, 403, 404 | Card data without rendering |
| GET | `/api/cards/order/{kind}/{id}` | session | `format` | — | 400, 401, 403, 404 | Print a receipt or an invoice |

## Catalogue admin

Creating and editing categories, attributes and prices. Administrators only.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/admin/attribute-values` | session | — | **attr_id**, **value_name**, description, icon | 400, 401, 403, 409 | Add a attribute value |
| PATCH | `/api/admin/attribute-values/{id}` | session | — | value_name, description, icon | 400, 401, 403, 404 | Update a attribute value |
| DELETE | `/api/admin/attribute-values/{id}` | session | — | — | 401, 403, 404 | Retire an attribute value |
| POST | `/api/admin/attributes` | session | — | **attr_name**, **category_id**, **subcategory_id**, order_no, show_in_smart_card, show_in_classic_card, show_description, show_image, +2 more | 400, 401, 403, 409 | Add a attribute |
| PATCH | `/api/admin/attributes/{id}` | session | — | attr_name, order_no, show_in_smart_card, show_in_classic_card, show_description, show_image, is_opensource, is_required | 400, 401, 403, 404 | Update a attribute |
| DELETE | `/api/admin/attributes/{id}` | session | — | — | 401, 403, 404 | Retire an attribute |
| POST | `/api/admin/categories` | session | — | **name**, **unit**, description, short_description, banner, icon | 400, 401, 403, 409 | Add a category |
| PATCH | `/api/admin/categories/{id}` | session | — | name, unit, description, short_description, banner, icon | 400, 401, 403, 404 | Update a category |
| PATCH | `/api/admin/laboratories/{id}/commission` | session | — | **commision** | 400, 401, 403, 404 | Set a laboratory commission rate |
| GET | `/api/admin/prices` | session | `lab_id`, `category_id` | — | 401, 403 | List price bands |
| POST | `/api/admin/prices` | session | — | **category_id**, lab_id, **min_wt**, **max_wt**, **smart_price**, **classic_price**, rate | 400, 401, 403, 409 | Add a price band |
| PATCH | `/api/admin/prices/{id}` | session | — | min_wt, max_wt, smart_price, classic_price, rate | 400, 401, 403, 404 | Update a price band |
| DELETE | `/api/admin/prices/{id}` | session | — | — | 401, 403, 404 | Delete a price band |
| POST | `/api/admin/subcategories` | session | — | **name**, **category_id**, description, banner, icon | 400, 401, 403, 409 | Add a subcategory |
| PATCH | `/api/admin/subcategories/{id}` | session | — | name, category_id, description, banner, icon | 400, 401, 403, 404 | Update a subcategory |

## Content

The public site: articles, branch pages, certificate types, banners and static pages. Administrators only.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/content/banners` | session | — | — | 401, 403 | List every banner |
| POST | `/api/content/banners` | session | — | **path**, **img_type**, name, url, status | 400, 401, 403, 409 | Add a banner |
| PATCH | `/api/content/banners/{id}` | session | — | path, img_type, name, url, status | 400, 401, 403, 404 | Update a banner |
| DELETE | `/api/content/banners/{id}` | session | — | — | 401, 403, 404 | Delete a banner |
| POST | `/api/content/blogs` | session | — | **page_name**, slug, content, thumbnail, banner, meta_title, meta_description, meta_keywords | 400, 401, 403, 409 | Add a article |
| PATCH | `/api/content/blogs/{id}` | session | — | page_name, slug, content, thumbnail, banner, meta_title, meta_description, meta_keywords | 400, 401, 403, 404 | Update a article |
| POST | `/api/content/branches` | session | — | **city**, pageURL, h1, content, img, title, description, keywords | 400, 401, 403, 409 | Add a branch page |
| PATCH | `/api/content/branches/{id}` | session | — | city, pageURL, h1, content, img, title, description, keywords | 400, 401, 403, 404 | Update a branch page |
| GET | `/api/content/pages` | session | — | — | 401, 403 | List the static pages |
| PATCH | `/api/content/pages/{id}` | session | — | page_name, content, banner, meta_title, meta_description, meta_keywords | 400, 401, 403, 404 | Edit a static page |
| POST | `/api/content/report-types` | session | — | **name**, short_description, description, banner, icon, meta_title, meta_description, meta_keywords | 400, 401, 403, 409 | Add a certificate type |
| PATCH | `/api/content/report-types/{id}` | session | — | name, short_description, description, banner, icon, meta_title, meta_description, meta_keywords | 400, 401, 403, 404 | Update a certificate type |
| POST | `/api/content/roles` | session | — | **role_name** | 401, 403, 409 | Add a role |
| PATCH | `/api/content/roles/{id}` | session | — | **role_name** | 401, 403, 404 | Rename a role |

## Uploads

Images and documents, written into the directories the Laravel application uses.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/uploads` | session | — | — | 401, 403 | Upload limits and accepted types |
| POST | `/api/uploads/{bucket}` | session | — | files | 400, 401, 403 | Upload one or more files |

## Attendance

Clocking in and out, breaks, and the record of both.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/attendance` | session | `page`, `per_page`, `emp_id` | — | 400, 401, 403 | Attendance history |
| POST | `/api/attendance/break` | session | — | **on_break** | 400, 401, 403 | Start or end a break |
| POST | `/api/attendance/clock-in` | session | — | — | 401, 403, 409 | Clock in |
| POST | `/api/attendance/clock-out` | session | — | — | 400, 401, 403, 409 | Clock out |
| GET | `/api/attendance/today` | session | — | — | 401, 403 | Today's own record |

## Permissions

The role permission matrix, and what the signed-in user may do.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/users/me/permissions` | session | — | — | 401, 403 | What you may do |
| GET | `/api/users/roles/{id}/permissions` | session | — | — | 401, 403 | The matrix for a role |
| PUT | `/api/users/roles/{id}/permissions` | session | — | **action_type**, view, create, update, delete | 400, 401, 403 | Set the permissions for one action type |

## Customers

Views over orders, grouped by mobile number. There is no customer table.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/customers/registered` | session | `page`, `per_page` | — | 401, 403 | Customers with a GST number |
| GET | `/api/customers/unregistered` | session | `page`, `per_page` | — | 401, 403 | Customers with no GST number |
| GET | `/api/customers/verifiers` | session | `page`, `per_page` | — | 401, 403 | People who looked up a certificate |

---

Bold body fields are required.

102 endpoints: 14 public, 88 requiring a session.
