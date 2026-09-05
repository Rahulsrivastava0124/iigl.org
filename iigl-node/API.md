# IIGL API

202 endpoints. Generated from the OpenAPI document by `npm run docs` — do not edit by hand.

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
Sessions last two days by default, and the length is a setting.

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
| POST | `/api/auth/change-password` | session | — | current_password, **new_password** | 400, 401 | Change your own password |
| POST | `/api/auth/forgot-password` | public | — | identifier, email | 400, 429 | Ask for a password reset link |
| POST | `/api/auth/login` | public | — | **mobile**, **password** | 400, 401 | Sign in |
| POST | `/api/auth/logout` | public | — | — | — | Sign out |
| GET | `/api/auth/me` | session | — | — | 401 | Current session |
| POST | `/api/auth/reset-password` | public | — | **email**, **token**, **new_password** | 400, 429 | Set a new password using a reset link |

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
| GET | `/api/catalog/attribute-values` | session | `attr_id`, `subcategory_id`, `category_id`, `q`, `page`, `per_page` | — | 400, 401, 403 | Attribute values across a branch of the catalogue |
| GET | `/api/catalog/attributes/{id}/values` | session | — | — | 401, 403 | Allowed values for an attribute |
| GET | `/api/catalog/categories` | session | — | — | 401, 403 | List categories |
| GET | `/api/catalog/categories/{id}/attributes` | session | — | — | 401, 403 | Certificate form fields across a whole category |
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
| PATCH | `/api/orders/{id}` | session | — | customer_name, mobile, alt_mobile, email, gst, address, dues_date, assigned_to, +5 more | 400, 401, 403, 404, 409 | Amend an order |
| DELETE | `/api/orders/{id}` | session | — | — | 401, 403, 404, 409 | Delete an order |
| POST | `/api/orders/{id}/deliver` | session | — | — | 400, 401, 403, 404 | Hand the order over |
| GET | `/api/orders/{id}/quote` | session | `discount` | — | 401, 403, 404 | Price an order |
| POST | `/api/orders/{id}/settle` | session | — | discount, paid_amount, pay_mode, transaction_no, deliver | 400, 401, 403, 404 | Take payment on an order |
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
| PATCH | `/api/transactions/{id}` | session | — | amount, pay_mode, transaction_no, remark | 400, 401, 403, 404 | Amend a transaction |
| POST | `/api/transactions/{id}/status` | session | — | **status** | 400, 401, 403, 404 | Approve or decline a remittance |
| POST | `/api/transactions/commission` | session | — | **commission_on**, pieces, pay_mode, transaction_no, remark, attachment | 400, 401, 403 | Pay commission to the administrator |
| GET | `/api/transactions/commission/earnings` | session | `page`, `per_page` | — | 401, 403 | What the commission is made of, order by order |
| GET | `/api/transactions/commission/summary` | session | — | — | 401, 403 | Commission earned, paid and due |
| POST | `/api/transactions/dues/{orderId}` | session | — | **amount**, pay_mode, transaction_no, remark | 400, 401, 403, 404 | Collect dues against an order |
| GET | `/api/transactions/ledger` | session | `user_id` | — | 401, 403 | Running account |
| GET | `/api/transactions/wallet` | session | — | — | 401, 403 | Your balance |

## Users

Laboratories, staff and account administration.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/users` | session | — | **fullname**, **mobile**, **password**, **role_id**, email, empid, lab_id, joining_date, +2 more | 400, 401, 403, 409 | Create an account |
| GET | `/api/users/{id}` | session | — | — | 401, 403, 404 | Read one account |
| PATCH | `/api/users/{id}` | session | — | fullname, mobile, email, role_id, is_active, commision, commission_type, registration_fee, +33 more | 400, 401, 403, 404, 409 | Update any account |
| DELETE | `/api/users/{id}` | session | — | — | 400, 401, 403, 404, 409 | Delete an account |
| PATCH | `/api/users/{id}/active` | session | — | is_active | 401, 403, 404 | Activate or deactivate an account |
| POST | `/api/users/{id}/employment` | session | — | **lab_id**, joining_date, salary, remark | 400, 401, 403, 404, 409 | Attach a person to an employer |
| PATCH | `/api/users/{id}/employment` | session | — | salary, joining_date, remark | 400, 401, 403, 404 | Change the terms of a posting |
| POST | `/api/users/{id}/employment/end` | session | — | leave_date, remark | 401, 403, 404 | End an employment |
| POST | `/api/users/{id}/password` | session | — | **password** | 400, 401, 403, 404 | Reset someone's password |
| GET | `/api/users/laboratories` | session | — | — | 401, 403 | List laboratories |
| GET | `/api/users/laboratories/{id}/agreement` | session | `format`, `blank` | — | 401, 403, 404 | The Franchise Agreement, the four pages after the form |
| GET | `/api/users/laboratories/{id}/detail` | session | — | — | 401, 403, 404 | One laboratory, with its payments, staff and certificates |
| GET | `/api/users/laboratories/{id}/registration` | session | `format`, `blank` | — | 401, 403, 404 | The Franchisee Form, filled from the laboratory |
| GET | `/api/users/me` | session | — | — | 401, 403 | Your account record |
| PATCH | `/api/users/me` | session | — | fullname, owner_name, alt_mobile, office_tel, email, address, city, state, +24 more | 400, 401, 403, 409 | Update your own profile |
| GET | `/api/users/staff` | session | `page`, `per_page`, `lab_id` | — | 401, 403 | List staff |

## Dashboard

Aggregate counts and totals.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/dashboard/summary` | session | — | — | 401, 403 | Counts and totals |
| GET | `/api/dashboard/trend` | session | — | — | 401, 403 | Twelve months of orders and certificates |

## Cards

Printed certificates: smart cards and classic reports.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/cards/{kind}` | session | `format` | **report_ids** | 400, 401, 403, 404 | Print several certificates as one PDF |
| GET | `/api/cards/{kind}/{id}` | session | `format` | — | 400, 401, 403, 404 | Print one certificate |
| GET | `/api/cards/data/{id}` | session | — | — | 401, 403, 404 | Card data without rendering |
| GET | `/api/cards/order/{kind}/{id}` | session | `format` | — | 400, 401, 403, 404 | Print a receipt or an invoice |

## Coupons

Discount coupons against course fees: the codes, and the enrolments each one was spent on.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/coupons` | session | `page`, `per_page`, `q`, `course_id`, `active` | — | 401, 403 | List coupons |
| POST | `/api/coupons` | session | — | **code**, title, description, discount_type, **discount_value**, max_discount, min_amount, course_id, +5 more | 400, 401, 403, 409 | Write a coupon |
| GET | `/api/coupons/{id}` | session | — | — | 401, 403, 404 | Read one coupon |
| PATCH | `/api/coupons/{id}` | session | — | code, title, description, discount_type, discount_value, max_discount, min_amount, course_id, +4 more | 400, 401, 403, 409 | Change a coupon |
| DELETE | `/api/coupons/{id}` | session | — | — | 401, 403, 404, 409 | Delete a coupon |
| PATCH | `/api/coupons/{id}/active` | session | — | **is_active** | 401, 403, 404 | Switch a coupon on or off |
| GET | `/api/coupons/{id}/redemptions` | session | `page`, `per_page` | — | 401, 403, 404 | Where a coupon went |
| POST | `/api/coupons/redeem` | session | — | **code**, **enrolment_id**, note | 400, 401, 403, 404, 409 | Spend a coupon on an enrolment |
| POST | `/api/coupons/validate` | session | — | **code**, **enrolment_id** | 400, 401, 403, 404 | What a coupon would take off an enrolment |

## Catalogue admin

Creating and editing categories, attributes and prices. Administrators only.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/admin/attribute-values` | session | — | **attr_id**, **value_name**, description, icon | 400, 401, 403, 409 | Add a attribute value |
| PATCH | `/api/admin/attribute-values/{id}` | session | — | attr_id, value_name, description, icon | 400, 401, 403, 404 | Update a attribute value |
| DELETE | `/api/admin/attribute-values/{id}` | session | — | — | 401, 403, 404 | Retire an attribute value |
| POST | `/api/admin/attributes` | session | — | **attr_name**, **category_id**, **subcategory_id**, order_no, show_in_smart_card, show_in_classic_card, show_description, show_image, +2 more | 400, 401, 403, 409 | Add a attribute |
| PATCH | `/api/admin/attributes/{id}` | session | — | attr_name, category_id, subcategory_id, order_no, show_in_smart_card, show_in_classic_card, show_description, show_image, +2 more | 400, 401, 403, 404 | Update a attribute |
| DELETE | `/api/admin/attributes/{id}` | session | — | — | 401, 403, 404 | Retire an attribute |
| POST | `/api/admin/categories` | session | — | **name**, **unit**, description, short_description, banner, icon | 400, 401, 403, 409 | Add a category |
| PATCH | `/api/admin/categories/{id}` | session | — | name, unit, description, short_description, banner, icon | 400, 401, 403, 404 | Update a category |
| PATCH | `/api/admin/laboratories/{id}/commission` | session | — | **commision** | 400, 401, 403, 404 | Set a laboratory commission rate |
| GET | `/api/admin/prices` | session | `lab_id`, `category_id` | — | 401, 403 | List price bands |
| POST | `/api/admin/prices` | session | — | **category_id**, lab_id, **min_wt**, **max_wt**, **smart_price**, **classic_price**, gst_id, gst_percent, +1 more | 400, 401, 403, 409 | Add a price band |
| PATCH | `/api/admin/prices/{id}` | session | — | min_wt, max_wt, smart_price, classic_price, gst_id, gst_percent, rate | 400, 401, 403, 404 | Update a price band |
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
| GET | `/api/attendance` | session | `page`, `per_page`, `emp_id`, `from`, `to` | — | 400, 401, 403 | Attendance history |
| POST | `/api/attendance/break` | session | — | **on_break** | 400, 401, 403 | Start or end a break |
| POST | `/api/attendance/clock-in` | session | — | — | 401, 403, 409 | Clock in |
| POST | `/api/attendance/clock-out` | session | — | — | 400, 401, 403, 409 | Clock out |
| GET | `/api/attendance/today` | session | — | — | 401, 403 | Today's own record |

## Permissions

Roles, the permissions on them, and grants made to one person. Head office and a laboratory can both create roles.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/roles` | session | — | — | 401, 403 | Roles this account can use |
| POST | `/api/roles` | session | — | **name**, description | 400, 401, 403, 409 | Create a role |
| PATCH | `/api/roles/{id}` | session | — | name, description | 400, 401, 403, 404 | Rename a role |
| DELETE | `/api/roles/{id}` | session | — | — | 401, 403, 404, 409 | Delete a role |
| GET | `/api/roles/{id}/permissions` | session | — | — | 401, 403, 404 | The matrix for one role |
| PUT | `/api/roles/{id}/permissions` | session | — | **action_type**, view, create, update, delete | 400, 401, 403, 404 | Set one permission on one role |
| GET | `/api/roles/{id}/users` | session | — | — | 401, 403, 404 | Who holds this role |
| GET | `/api/roles/actions` | session | — | — | 401, 403 | Every permission that can be granted |
| POST | `/api/roles/actions` | session | — | **name**, label, description | 400, 401, 403, 409 | Add a permission to the list |
| GET | `/api/users/{id}/permissions` | session | — | — | 401, 403, 404 | What one person has been granted individually |
| PUT | `/api/users/{id}/permissions` | session | — | **action_type**, view, create, update, delete | 400, 401, 403, 404 | Grant or withdraw one permission for one person |
| DELETE | `/api/users/{id}/permissions/{action}` | session | — | — | 401, 403 | Drop an individual grant |
| GET | `/api/users/me/permissions` | session | — | — | 401, 403 | What you may do |

## Customers

Views over orders, grouped by mobile number. There is no customer table.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/customers/registered` | session | `page`, `per_page` | — | 401, 403 | Customers with a GST number |
| GET | `/api/customers/unregistered` | session | `page`, `per_page` | — | 401, 403 | Customers with no GST number |
| GET | `/api/customers/verifiers` | session | `page`, `per_page` | — | 401, 403 | People who looked up a certificate |

## Students

The student pipeline: enquiry, registration, course, discount, certificate. New in this system — the Laravel menu had the entries but no tables.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/courses/{id}/students` | session | — | — | 401, 403, 404 | Who is on one course, and what it has brought in |
| GET | `/api/courses/enrolments/summary` | session | — | — | 401, 403 | Enrolment money, totalled |
| GET | `/api/student-certificates` | session | `page`, `per_page`, `student_id`, `q` | — | 401, 403 | Course certificates |
| POST | `/api/student-certificates` | session | — | **student_course_id**, issued_on, grade, remark, file | 400, 401, 403, 404, 409 | Issue a certificate |
| PATCH | `/api/student-certificates/{id}` | session | — | issued_on, grade, remark, file | 400, 401, 403, 404 | Update a certificate |
| DELETE | `/api/student-certificates/{id}` | session | — | — | 401, 403, 404 | Delete a certificate |
| GET | `/api/student-certificates/pending` | session | — | — | 401, 403 | Completed courses with no certificate yet |
| GET | `/api/students` | session | `page`, `per_page`, `status`, `q` | — | 401, 403 | List registrations |
| POST | `/api/students` | session | — | **name**, father_name, dob, gender, **mobile**, alt_mobile, email, address, +10 more | 400, 401, 403 | Register a student |
| GET | `/api/students/{id}` | session | — | — | 401, 403, 404 | One student, with their enrolments and certificates |
| PATCH | `/api/students/{id}` | session | — | name, father_name, dob, gender, mobile, alt_mobile, email, address, +10 more | 400, 401, 403, 404 | Update a registration |
| DELETE | `/api/students/{id}` | session | — | — | 401, 403, 404, 409 | Delete a registration |
| GET | `/api/students/enquiries` | session | `page`, `per_page`, `status`, `lab_id`, `q` | — | 401, 403 | Course enquiries |
| POST | `/api/students/enquiries` | session | — | **name**, **mobile**, email, course_id, course_interested, enquiry_date, source, status, +2 more | 400, 401, 403 | Record a course enquiry |
| PATCH | `/api/students/enquiries/{id}` | session | — | name, mobile, email, course_id, course_interested, enquiry_date, source, status, +2 more | 400, 401, 403, 404 | Update a course enquiry |
| DELETE | `/api/students/enquiries/{id}` | session | — | — | 401, 403, 404 | Delete a course enquiry |
| POST | `/api/students/enquiries/{id}/convert` | session | — | name, mobile, email, course_id, registration_date, status | 401, 403, 404, 409 | Convert an enquiry into a registration |
| GET | `/api/students/enquiries/{id}/followups` | session | — | — | 401, 403, 404 | The follow-up history of one course enquiry |
| POST | `/api/students/enquiries/{id}/followups` | session | — | note, outcome, next_follow_up_on, status | 400, 401, 403, 404 | Record a follow-up on a course enquiry |
| GET | `/api/students/summary` | session | — | — | 401, 403 | Counts across the whole pipeline |

## Courses

The course catalogue, the enrolments on it, and the discount that sits on the fee.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/courses` | session | `page`, `per_page`, `active`, `q` | — | 401, 403 | The course catalogue |
| POST | `/api/courses` | session | — | **name**, code, duration, fee, gst_id, gst_percent, description, is_active | 400, 401, 403, 409 | Add a course |
| PATCH | `/api/courses/{id}` | session | — | name, code, duration, fee, description, is_active | 400, 401, 403, 404 | Update a course |
| DELETE | `/api/courses/{id}` | session | — | — | 401, 403, 404, 409 | Delete a course |
| GET | `/api/courses/enrolments` | session | `page`, `per_page`, `status`, `student_id`, `discounted`, `q` | — | 401, 403 | List enrolments |
| POST | `/api/courses/enrolments` | session | — | **student_id**, **course_id**, batch, start_date, end_date, fee, fee_paid, status, +1 more | 400, 401, 403, 404, 409 | Enrol a student |
| PATCH | `/api/courses/enrolments/{id}` | session | — | batch, start_date, end_date, fee, fee_paid, status, completed_on, result, +1 more | 400, 401, 403, 404 | Update an enrolment |
| DELETE | `/api/courses/enrolments/{id}` | session | — | — | 401, 403, 404, 409 | Delete an enrolment |
| PATCH | `/api/courses/enrolments/{id}/discount` | session | — | type, value, reason, applied_on | 400, 401, 403, 404 | Apply or clear a discount |
| POST | `/api/courses/enrolments/{id}/payment` | session | — | **amount** | 400, 401, 403, 404 | Take a fee payment |
| GET | `/api/courses/enrolments/{id}/statement` | session | `format` | — | 401, 403, 404 | Print the fee statement |

## Enquiries

The general enquiry book: questions, visits, leads and complaints.

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/enquiries` | session | `page`, `per_page`, `kind`, `status`, `q` | — | 401, 403 | List enquiries |
| POST | `/api/enquiries` | session | — | kind, **name**, **mobile**, email, subject, course_id, course_interested, message, +7 more | 400, 401, 403 | Record an enquiry |
| GET | `/api/enquiries/{id}` | session | — | — | 401, 403, 404 | One enquiry |
| PATCH | `/api/enquiries/{id}` | session | — | kind, name, mobile, email, subject, course_id, course_interested, message, +6 more | 400, 401, 403, 404 | Update an enquiry |
| DELETE | `/api/enquiries/{id}` | session | — | — | 401, 403, 404 | Delete an enquiry |
| GET | `/api/enquiries/{id}/followups` | session | — | — | 401, 403, 404 | The follow-up history of one enquiry |
| POST | `/api/enquiries/{id}/followups` | session | — | note, outcome, next_follow_up_on, status | 400, 401, 403, 404 | Record a follow-up |
| GET | `/api/enquiries/summary` | session | — | — | 401, 403 | Counts per kind and per status |

## Master

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/master/countries` | session | `active` | — | 401, 403 | Countrys |
| POST | `/api/master/countries` | session | — | **name**, code, is_active | 400, 401, 403, 409 | Add a country |
| PATCH | `/api/master/countries/{id}` | session | — | name, is_active | 400, 401, 403, 404 | Update a country |
| DELETE | `/api/master/countries/{id}` | session | — | — | 401, 403, 404, 409 | Delete a country |
| PATCH | `/api/master/countries/{id}/active` | session | — | **is_active** | 401, 403, 404 | Retire or restore a country |
| GET | `/api/master/districts` | session | `active`, `state_id` | — | 401, 403 | Districts |
| POST | `/api/master/districts` | session | — | **state_id**, **name**, is_active | 400, 401, 403, 409 | Add a district |
| PATCH | `/api/master/districts/{id}` | session | — | state_id, name, is_active | 400, 401, 403, 404 | Update a district |
| DELETE | `/api/master/districts/{id}` | session | — | — | 401, 403, 404, 409 | Delete a district |
| PATCH | `/api/master/districts/{id}/active` | session | — | **is_active** | 401, 403, 404 | Retire or restore a district |
| GET | `/api/master/enquiry-types` | session | `active` | — | 401, 403 | Enquiry types |
| POST | `/api/master/enquiry-types` | session | — | **code**, **label**, sort, is_active | 400, 401, 403, 409 | Add a enquiry type |
| PATCH | `/api/master/enquiry-types/{id}` | session | — | label, sort, is_active | 400, 401, 403, 404 | Update a enquiry type |
| DELETE | `/api/master/enquiry-types/{id}` | session | — | — | 401, 403, 404, 409 | Delete a enquiry type |
| PATCH | `/api/master/enquiry-types/{id}/active` | session | — | **is_active** | 401, 403, 404 | Retire or restore a enquiry type |
| GET | `/api/master/gst` | session | `active` | — | 401, 403 | GST rates |
| POST | `/api/master/gst` | session | — | **name**, **percent**, is_active | 400, 401, 403, 409 | Add a gst rate |
| PATCH | `/api/master/gst/{id}` | session | — | name, percent, is_active | 400, 401, 403, 404 | Update a gst rate |
| DELETE | `/api/master/gst/{id}` | session | — | — | 401, 403, 404, 409 | Delete a gst rate |
| PATCH | `/api/master/gst/{id}/active` | session | — | **is_active** | 401, 403, 404 | Retire or restore a gst rate |
| GET | `/api/master/states` | session | `active`, `country_id` | — | 401, 403 | States |
| POST | `/api/master/states` | session | — | **country_id**, **name**, code, is_active | 400, 401, 403, 409 | Add a state |
| PATCH | `/api/master/states/{id}` | session | — | country_id, name, is_active | 400, 401, 403, 404 | Update a state |
| DELETE | `/api/master/states/{id}` | session | — | — | 401, 403, 404, 409 | Delete a state |
| PATCH | `/api/master/states/{id}/active` | session | — | **is_active** | 401, 403, 404 | Retire or restore a state |

## Settings

| Method | Path | Auth | Query | Body | Fails | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/settings` | session | — | — | 401, 403 | Every setting |
| PATCH | `/api/settings` | session | — | company.name, certificate.prefix, session.hours, mail.smtp_url | 400, 401, 403 | Save settings |
| POST | `/api/settings/test-smtp` | session | — | url | 400, 401, 403 | Test the mail connection |

---

Bold body fields are required.

202 endpoints: 16 public, 186 requiring a session.
