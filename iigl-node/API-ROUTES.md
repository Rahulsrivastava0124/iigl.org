# IIGL API — routes

53 endpoints. Generated from the OpenAPI document by `npm run routes` — do not edit by hand.

Endpoints marked `public` need no session. Everything else requires the `iigl.sid` cookie from `POST /api/auth/login`.


## Auth

Sign in, sign out, and the current session.

| Method | Path | Auth | Query | Purpose |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/change-password` | session | — | Change your own password |
| POST | `/api/auth/login` | public | — | Sign in |
| POST | `/api/auth/logout` | public | — | Sign out |
| GET | `/api/auth/me` | session | — | Current session |

## Public

Open endpoints: the marketing site and certificate verification.

| Method | Path | Auth | Query | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/public/banners` | public | `type` | List active banners |
| GET | `/api/public/blogs` | public | — | List articles |
| GET | `/api/public/blogs/{slug}` | public | — | Read an article |
| GET | `/api/public/branches` | public | — | List branch city pages |
| GET | `/api/public/branches/{slug}` | public | — | Read a branch page |
| GET | `/api/public/pages/{pageType}` | public | — | Website page content |
| GET | `/api/public/report-types` | public | — | List certificate types |
| GET | `/api/public/verify-by-id/{id}` | public | — | Verify a certificate by its id |
| POST | `/api/public/verify-log` | public | — | Record a verification lookup |
| GET | `/api/public/verify/{reportNo}` | public | — | Verify a certificate |
| GET | `/health` | public | — | Liveness probe |
| GET | `/openapi.json` | public | — | This document |

## Catalog

Categories, subcategories, attributes and their values.

| Method | Path | Auth | Query | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/catalog/attributes/{id}/values` | session | — | Allowed values for an attribute |
| GET | `/api/catalog/categories` | session | — | List categories |
| GET | `/api/catalog/categories/{id}/subcategories` | session | — | Subcategories of a category |
| GET | `/api/catalog/form-layouts/{categoryId}` | session | — | Form layout for a category |
| GET | `/api/catalog/report-types` | session | — | Certificate types |
| GET | `/api/catalog/subcategories` | session | — | List all subcategories |
| GET | `/api/catalog/subcategories/{id}/attributes` | session | — | Certificate form fields for a subcategory |
| GET | `/api/catalog/units` | session | — | Weight units |

## Orders

Customer orders and the items on them.

| Method | Path | Auth | Query | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/orders` | session | `page`, `per_page`, `status` | List orders |
| POST | `/api/orders` | session | — | Create an order |
| GET | `/api/orders/{id}` | session | — | Read an order with its items and certificates |
| PATCH | `/api/orders/{id}` | session | — | Amend an order |
| POST | `/api/orders/{id}/deliver` | session | — | Settle and deliver an order |
| GET | `/api/orders/{id}/quote` | session | `discount` | Price an order |
| GET | `/api/orders/customer/lookup` | session | `mobile` | Find a returning customer by mobile |
| DELETE | `/api/orders/items/{id}` | session | — | Remove an item from an order |

## Reports

Certificates issued against order items.

| Method | Path | Auth | Query | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/reports` | session | `page`, `per_page`, `order_id` | List certificates |
| POST | `/api/reports` | session | — | Issue a certificate |
| GET | `/api/reports/{id}` | session | — | Read a certificate |
| PATCH | `/api/reports/{id}` | session | — | Amend a certificate |

## Transactions

Remittances, approvals, dues collection and wallet balance.

| Method | Path | Auth | Query | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/transactions` | session | `page`, `per_page`, `direction`, `status` | List transactions |
| POST | `/api/transactions` | session | — | Send a remittance |
| POST | `/api/transactions/{id}/status` | session | — | Approve or decline a remittance |
| POST | `/api/transactions/commission` | session | — | Pay commission to the administrator |
| POST | `/api/transactions/dues/{orderId}` | session | — | Collect dues against an order |
| GET | `/api/transactions/ledger` | session | `user_id` | Running account |
| GET | `/api/transactions/wallet` | session | — | Your balance |

## Users

Laboratories, staff and account administration.

| Method | Path | Auth | Query | Purpose |
| --- | --- | --- | --- | --- |
| POST | `/api/users` | session | — | Create an account |
| PATCH | `/api/users/{id}/active` | session | — | Activate or deactivate an account |
| GET | `/api/users/laboratories` | session | — | List laboratories |
| GET | `/api/users/me` | session | — | Your account record |
| GET | `/api/users/roles` | session | — | List roles |
| GET | `/api/users/staff` | session | `page`, `per_page`, `lab_id` | List staff |

## Dashboard

Aggregate counts and totals.

| Method | Path | Auth | Query | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/dashboard/summary` | session | — | Counts and totals |

## Cards

Printed certificates: smart cards and classic reports.

| Method | Path | Auth | Query | Purpose |
| --- | --- | --- | --- | --- |
| POST | `/api/cards/{kind}` | session | `format` | Print several certificates as one PDF |
| GET | `/api/cards/{kind}/{id}` | session | `format` | Print one certificate |
| GET | `/api/cards/data/{id}` | session | — | Card data without rendering |

---

53 endpoints: 14 public, 39 requiring a session.
