# Style audit

The panel measured against [style.md](style.md), which follows the house guide
at `Prakriti_New_Admin/docs/style.md`.

Eighteen screens, seven shared components. Every finding was produced by
searching the source, not by reading it — the command is quoted so it can be
re-run. Re-run after the menu, header and breadcrumb rework.

| Severity | Raised | Fixed | Open |
| --- | --- | --- | --- |
| High | 1 | 1 | 0 |
| Medium | 5 | 4 | 0 |
| Low | 4 | 4 | 0 |

One finding — M3 — was withdrawn as a false positive rather than deleted. The
reasoning is kept below, because a check that produces a false positive is worth
knowing about.

---

## Clean

Recorded so a later reader knows these were checked.

**No brand hex is written outside the theme.**

```bash
grep -rn "#[0-9a-fA-F]\{6\}" src/ --include=*.tsx | grep -v theme.ts
# no matches
```

Every colour comes from `primary.main`, `text.secondary` and friends. Changing
`BRAND.navy` in `src/lib/theme.ts` restyles the whole panel.

**Every screen inside the shell uses `PageHead`.** Seventeen of eighteen; the
exception is `Login.tsx`, which renders outside the shell.

```bash
for f in src/pages/*.tsx; do grep -q "PageHead" $f || echo $f; done
# src/pages/Login.tsx
```

**No page renders its own breadcrumb or its own header.** Both come from the
shell.

```bash
grep -rn "Breadcrumb" src/pages/*.tsx
# no matches
```

**No page adds its own content padding.** The one `px` in a page is
`Login.tsx:47`, outside the shell and therefore its own responsibility.

**One radius constant.** After the search field was corrected (M5), no `sx`
carries a literal radius; menu rows, panels and the search field all take
`RADIUS` or the theme's 8px.

```bash
grep -rn "borderRadius" src --include=*.tsx | grep -v RADIUS
# no matches
```

---

## High — all fixed

### H1 — The permission matrix was not used in the UI *(fixed)*

The API exposes `GET /api/users/me/permissions` and `role_permissions` carries
14 action types per role. Nothing in the panel read it; screens gated on a bare
role check.

Now `src/lib/permissions.tsx` provides `PermissionProvider` / `usePermissions`,
and write controls sit behind both a role and a matrix check:

```bash
grep -rn "can(" src/pages/*.tsx src/components/*.tsx | wc -l
# 5
```

A related defect surfaced while verifying this: every `role_permissions` row for
role 2 is zero, and Laravel never reads them — the laboratory sidebar has no
permission check at all. Read literally, the zeros locked a laboratory out of
its own counter. `can()` in the API now treats a laboratory as unconditional,
like an administrator. See `iigl-node/src/services/permission.service.ts`.

---

## Medium — all fixed

### M1 — Bare `Paper` instead of `Panel` *(fixed)*

```bash
grep -rn "<Paper" src/pages/*.tsx
# src/pages/Login.tsx:38
```

The only remaining one is the sign-in card, which is not a page panel.

### M2 — The metric tile was implemented twice *(fixed)*

`Tile` in `src/components/ui.tsx` is now the single implementation; the
dashboard and the order totals both use it.

### M3 — Radius values are off the scale *(withdrawn)*

`borderRadius: 8` looked like a fifth value on a four-value scale.

> **Withdrawn — this was wrong.** The only match was
> `theme.ts: shape: { borderRadius: 8 }`, and `shape.borderRadius` is measured in
> **pixels**, not `sx` units. Eight pixels *is* the `md` value.
>
> The grep behind it cannot tell a theme pixel from an `sx` unit and should not
> be trusted alone.

### M4 — The two headers were different heights *(fixed)*

The logo block and the topbar both declared `minHeight: 76`, but the topbar
carries a search field, so its content decided the real height and the two never
lined up. Both now take `HEADER_H` as `minHeight` **and** `height` — measured 68
and 68.

### M5 — The search field was still a pill *(fixed)*

```bash
grep -rn "borderRadius: 6" src/components/Shell.tsx
# was: slotProps.input.sx — 48px on a 40px field
```

After the menu dropped its full rounding, the search field was the only pill
left in the shell. It now takes `RADIUS`.

---

## Low

### L1 — Status colour had three components and no shared mapping *(fixed)*

`StatusChip`, `OrderChip` and `YesNo` each decided their own colours. There is
now one tone scale and one chip behind all three:

```ts
export type Tone = 'settled' | 'waiting' | 'refused' | 'plain';
```

`transactionState()`, `orderState()` and `flagState()` map a value to a tone and
a label; `StateChip` renders it. Every status column in the panel goes through
`StateChip`, so a fourth column picks a tone rather than inventing a colour.
The three original names remain as thin wrappers, so no screen changed.

Verified in the browser: transactions render `Pending:Warning`, orders
`In progress:Warning`, laboratory flags `Yes:Success`.

### L2 — `Dashboard` had no `Panel` at all *(fixed)*

It was a grid of tiles with two loose `h2` headings and no surface — the only
screen in the shell without one.

The headings are now `Panel title="Orders"` and `Panel title="Money"` with the
tile grids inside them, so the dashboard's headings come from the same component
as every other panel heading rather than from a `Typography` that happens to
match.

### L3 — The notification bell had nothing behind it *(fixed)*

It now counts the one thing in this system that genuinely waits on a person:
transactions sent to you and neither approved nor declined —
`GET /transactions?status=0&direction=received`. The badge carries the number,
the tooltip says what it is, and clicking opens the pending list. An
administrator sees every pending one, because the API scopes that list by role.

The count is re-read on every navigation: the queue moves a few times a day and
the query is an indexed count, so polling would cost more than it tells.

Verified against the data: 4 pending transactions in the database, badge reads
4, and the bell opens `/transactions?status=0` showing "4 records".

### L4 — Role was checked by number in four places *(fixed)*

`src/lib/portal.ts` now exports `ROLE`, `isAdmin(user)` and `isLab(user)`, and
the four sites use them. The doc comment says what they are not: a role
narrowing, not a permission decision — a write control still needs `can()` from
the matrix as well.

Fixing this nearly introduced a worse bug. Renaming the local `const isAdmin`
to the imported function left three call sites reading `isAdmin ? … : …`, which
is a function and therefore always truthy — TypeScript accepts it, since a
function is a valid condition. Caught by grepping for every remaining reference
rather than trusting the compiler.

---

## Menu, header and breadcrumb — measured, not eyeballed

The rework was verified in the browser rather than by reading the source.

| Check | Result |
| --- | --- |
| Header heights | sidebar 68, topbar 68 |
| Menu group row | 47px, icon 21px, label 15px/600 |
| Menu child row | 38px, label 14px, no icon |
| Corner | 8px on group rows, child rows and the search field |
| Collapsed rail | 76px; every row centred at 38 |
| Open menu | rows centred at 137.5 against a drawer centre of 138 |
| Breadcrumb | `nav[aria-label="breadcrumb"] › ol › li`, icon separator, `aria-current="page"` on the last crumb |

Two defects were found by measuring:

- the sidebar's scrollbar took its 16px out of the left of the menu, so every
  row sat off-centre on the rail and short of the right edge when open — fixed
  with a thin bar and `scrollbar-gutter: stable both-edges`;
- react-router's `NavLink` sets its own `active` class on a path match that
  ignores the query, so `/categories` lit up while `/categories?tab=sub` was the
  page. The panel's class is now `current`, separate from the router's.

---

## Still open

Nothing. Every finding raised in this audit is fixed or, in M3's case,
withdrawn as a false positive.

The tone scale from L1 now covers the whole panel, not just the chips —
messages, figures, destructive controls and the notification badge all take
their colour from the state they report:

```bash
grep -rn 'color="error"\|color="success"\|color="warning"\|severity=' src --include=*.tsx | grep -v components/ui.tsx
# no matches
```

A state that is genuinely none of settled, waiting, refused or plain should
extend the scale in `ui.tsx`, not colour something at the call site.

Row actions were converted to icons across every table — Attributes,
Categories, Content, Laboratories, Orders, Pricing, Reports, Roles, Staff and
Transactions — behind two components, `RowActions` and `IconAction`. Each keeps
its label as the tooltip and the accessible name:

```bash
grep -rn '<Button size="small"' src/pages/*.tsx
# NewReport only — the wizard's "Choose", where the label is the instruction
```

`DangerButton` was removed in the same pass: with every destructive control now
an `IconAction danger`, it had nothing behind it.

One process note from this round: **`npx tsc --noEmit` silently checks nothing
here.** The project builds with `tsc -b` and project references, so a bare
`tsc --noEmit` returned clean while six files had unclosed JSX tags. Typecheck
with `npm run build`.
