# IIGL

Two applications against one shared MySQL database (`iigl`, the Laravel schema,
no foreign keys):

- `iigl-node/` — the API. Express 5, TypeScript, Kysely + mysql2, 102 endpoints,
  OpenAPI in `src/docs/`. `npm run sweep` exercises every route; `npm run docs`
  regenerates `API.md`; `npm run check:spec` fails if a route is undocumented.
- `iigl-admin/` — the panel. React 19, Vite, **Material UI 9.3**, react-router 7.
  House style is `iigl-admin/style.md`; follow it rather than inventing a
  second way to do the same thing.
- `iigl.org_old/` — the Laravel 7 application being replaced. Read it to settle
  what the old behaviour actually was; do not port its bugs.

## Material UI

The panel is on **Material UI 9.3**, not 5, 6 or 7. The APIs differ, and answers
written for older majors are a common source of broken code here:

- system layout props (`mt`, `display`, `gap` on a component) are gone — put
  them in `sx`;
- `Stack` takes `spacing`, not `gap`;
- slot overrides go through `slotProps`, each slot taking an `sx` object;
- `Grid` is the v2 API.

**Use the `mui-mcp` server for anything Material UI.** It is registered in
`.mcp.json` at the repo root, so it is available in this project without any
further setup: call `useMuiDocs` to fetch the docs for the installed version and
`fetchDocs` to read a specific page, and quote from what it returns rather than
from memory. When the server is unavailable, the machine-readable index is at
`https://mui.com/llms.txt`, and any docs page has a plain-text form at the same
address with `.md` appended (for example
`https://mui.com/material-ui/react-breadcrumbs.md`).

Prefer the documented component to a hand-built one: `Breadcrumbs` for the
trail, `Drawer` for the sidebar, `DataGrid`-shaped tables built from `Table`.
The panel's own wrappers live in `iigl-admin/src/components/ui.tsx` — reach for
those before writing a new one.

## Roles

Three: **super admin** (head office, `role_id` 1), **admin** (`role_id` 2 — a
laboratory; the laboratory account *is* its admin, so `isAdmin` and `isLab` are
the same test) and **team** (their staff, role 3, plus the older 4 and 5,
attached to an employer through `employements.parent_id`, which holds that
employer's `users.empid` rather than their id). `role_id` is
nullable, and NULL is **no role at all**: that person holds only the grants in
`user_permissions`. One sign-in door each — `super.` (or the bare
domain), `admin.`, `team.` — and `ROLES.md` at the repo root has the structure,
what each role sees and where each rule is enforced.

## Working here

- The database is a copy of production. Reads are free; check before writing.
- Certificate numbering, pricing bands and GST are ported behaviour, not new
  design. `iigl-node/PARITY.md` records how each was verified against Laravel.
- `iigl-node/FEATURE-GAP.md` lists what is still missing and what was
  deliberately not ported.
