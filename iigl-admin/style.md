# UI Style Guide

Design patterns for the IIGL admin panel. Use these consistently across every
screen.

Structured after `Prakriti_New_Admin/docs/style.md`, which is the house style
across these projects. Where this differs, it is because IIGL runs **MUI v9**
rather than v7 and has its own palette — the principles are the same.

The public website has its own guide at `iigl-frontend-website/style.md`. The
palette here comes from it, so the panel and the site are one brand rather than
two interpretations.

---

## Framework & Dependencies

| Job | Library | Notes |
| --- | --- | --- |
| UI | **Material UI v9** | The only UI library. No raw `<select>`, `<button>`, `<table>` |
| Styling | MUI `sx` (emotion) | Tokens from `src/lib/theme.ts`. No Tailwind in this build |
| Icons | `@mui/icons-material` | Outlined variants, `fontSize="small"` in tables and nav |
| Routing | react-router-dom v7 | Three entrances — see Roles below |
| Server state | `useFetch` (`src/lib/useFetch.ts`) | One hook per screen; returns `data`, `loading`, `error`, `reload` |
| Writes | `api` (`src/lib/api.ts`) | `get` / `post` / `patch` / `put` / `del`, always `credentials: include` |
| Uploads | `FileField` | Uploads on choose, hands back a path; the form saves it |
| Results | `messageOf(err)` into `toast.error` | Never a bare thrown string, never a banner |
| Charts | Inline SVG (`TrendChart`) | No charting library is installed, and none is wanted |

### MUI v9 differs from v7 in three ways

These bite on every screen, so they are here rather than in a footnote:

1. **Layout system props were removed.** `alignItems`, `justifyContent`,
   `flexWrap`, `display` go in `sx`, not on the component.
2. **`Stack` takes `spacing`, not `gap`.** `gap` is a silent type error.
3. **Slot props take an `sx` object**, not raw style keys:
   `slotProps={{ primary: { sx: { fontSize: 13.5 } } }}`.

---

## Page Layout Architecture

### The shell

`Shell` owns everything outside the page: the sidebar, the topbar, the
breadcrumb and the padding around the content. A page renders its own contents
and nothing else.

```
┌──────────────┬──────────────────────────────────────────────────────┐
│  logo block  │ TOPBAR  AppBar position="sticky"  height 68           │
│  SIDEBAR     │ ☰  welcome + date · search · Add report · bell · you  │
│  Drawer      ├──────────────────────────────────────────────────────┤
│  276px       │                                                       │
│  (76 when    │  🏠 Super Admin › Certificates      ← Breadcrumbs      │
│  collapsed)  │                                                       │
│  permanent   │  ┌────────────────────────────────────────────────┐   │
│              │  │ THE PAGE — <Outlet/>                           │   │
│              │  │                                                │   │
│              │  └────────────────────────────────────────────────┘   │
│              │  main: px {xs:2, md:3} · pt 2.5 · pb 8               │
└──────────────┴──────────────────────────────────────────────────────┘
```

| Piece | Rule |
| --- | --- |
| Sidebar | 276px, 76px collapsed. **One group open at a time**; until someone picks one, the group holding the current page is open. The rail shows tooltips |
| Header height | `HEADER_H` **68**, on both toolbars. The logo block and the topbar sit either side of the drawer edge and read as one bar only while they match exactly — the topbar carries a search field, so left to a `minHeight` its content decides the height and the two drift apart |
| Menu shape | Two levels. A **group row** carries the icon, a 15px/600 label and a chevron; its children are text only, 14px, indented `pl 4.75` to sit under the label rather than the icon. A group with one entry is a plain link with no chevron |
| Menu state | Current entry: group row filled navy when the group is closed or is itself the page, child **filled navy with white text** when its group is open, the same fill the group row takes — one look for "you are here" at both levels. Hover is a 6% navy tint, so hover and here can never be confused. An open group row takes `action.hover`, not the fill — it heads the list rather than competing with the entry inside it that is actually open. A group opens itself when the current page is inside it |
| Menu classes | The current-entry class is **`current`**, never `active`: react-router's `NavLink` sets `active` itself on a path match that ignores the query, which lit `/categories` while `/categories?tab=sub` was the page |
| Menu type | Group row 47px, label 15px/600, icon 21px. Child row 38px, label 14px |
| Menu corner | `RADIUS` **1** (8px) on both items and group rows, and both inset `mx 1.25` so their left edges line up. Small, matching the panels — a 24px corner on a 48px row is a full pill |
| Brand mark | `/logo.png`, the transparent square mark. The horizontal logo has a baked-in navy background and must not be used on white |
| Topbar | Sticky, height 68. Menu toggle, welcome and date, search, **Add report**, alerts, profile |
| Notifications | The bell counts transactions sent to you and still pending, and opens that list. A control in the topbar either means something or is not there |
| Breadcrumbs | Rendered by the shell, once, above every page. Material UI `Breadcrumbs` used as documented: `aria-label="breadcrumb"`, a `NavigateNext` icon separator rather than a typed character, a `Link` per ancestor, and the current page as a `Typography` with `aria-current="page"` — not a link, because it goes nowhere. A crumb's label matches the menu entry that leads there |
| Content padding | `px` `{ xs: 2, md: 3 }`, `pt` `2.5`, `pb` `8` — **a page must not add its own** |

### The menu

Nine groups, collapsible, in `GROUPS` in `Shell.tsx`. Three rules hold it
together:

**The icon belongs to the group.** One subject, one icon; repeating it down the
children only crowds the text.

**The list comes first.** A menu entry opens a list; creating happens on the
list, through its own Add button. There is no separate Create entry — it is a
second door to the same room, and it puts the rarer action above the common one.

**Nothing is listed that has nothing behind it.** An entry that opens an empty
screen, or a screen built on a table that does not exist, is worse than a
missing entry: it makes the whole menu untrustworthy.

**There are two menus, not one.** An administrator runs the business; a
laboratory and its employees run the counter. `ADMIN_GROUPS` and `FIELD_GROUPS`
in `Shell.tsx` are picked by role — one menu with most of it hidden would leave
an employee reading a list of things they cannot open.

| | Administrator (1) | Laboratory (2) | Lab employee (3) |
| --- | --- | --- | --- |
| Menu | `ADMIN_GROUPS` | `FIELD_GROUPS` | `FIELD_GROUPS` |
| Groups | Dashboard, Orders, Certificates, Report Master, Price Setup, Laboratory, Employee Management, Account, Customer, Website Setup, Your profile | Dashboard, Orders, Report, Customer, Account, Employee, Your profile | Dashboard, Orders, Report, Customer, Account, Attendance, Your profile |
| Add report (topbar) | no | yes | yes |
| Collect new / Issue a certificate | no | with the permission | with the permission |

The counter menu is the work of one laboratory: take an order, issue the
certificates, settle the account. Every list behind it is already scoped to that
laboratory by the API, and an employee without `product_collection` view **and**
create rights sees only the orders they took or were assigned.

Role narrowing on an entry is `labOnly` / `staffOnly`; a permission requirement
is `needs`. A group hidden by role is still enforced by the API — the menu is
about not offering someone a door that opens onto a refusal.

**A sub-entry deep-links into a section rather than duplicating it.** `Sub
Category` is `/categories?tab=sub` — the same screen, opened on its other list.
A deep-linked screen must therefore:

- read the parameter and open on that section, not merely scroll to it;
- title itself after the section, so `PageHead` matches the entry that was
  clicked;
- write the parameter back when the person switches section on the page, so a
  reload lands where they were and the menu entry stays lit;
- have its label registered in `VIEWS` in `src/lib/breadcrumbs.ts`, so the
  trail reads `Product Master › Sub Category` rather than the screen's name.

### Three kinds of page

Every screen is one of these. Pick the matching skeleton rather than inventing a
fourth.

**1. List** — head, filters, table.

```tsx
<PageHead title="Orders" subtitle="9,608 orders" action={<Button/>} />
<Panel
  actions={<TextField select … />}
  count={…}
  footer={<Pager meta={data?.meta} onPage={setPage} />}
>
  <TableFrame loading={…} error={…} empty={…} emptyText={…}>
    <Table size="small" stickyHeader>…</Table>
  </TableFrame>
</Panel>
```

Nothing sits between the head and the panel. A saved record is a toast, not a
banner wedged in there — see **Messages**.

**2. Detail** — head with a back action, then one `Panel` per section, figures in
a tile grid.

**3. Form** — head with a back action, one `Panel` holding the fields, submit at
the end. A short form goes in a `Dialog` instead; a long one, or one with steps,
gets its own route — see `NewReport`.

### Key principles

1. **One `PageHead` per screen.** Never a bare `<h1>`, never two.
2. **No page padding.** `Shell` already pads the content area; a page that adds
   its own doubles it. `Login` is the exception — it renders outside the shell.
3. **No page renders a breadcrumb.** The shell does, once.
4. **Every surface is a `Panel`.** Not a bare `Paper`, `Card` or `CardContent`.
5. **Every table is wrapped in `TableFrame`**, which owns loading, error and
   empty. Do not hand-roll a spinner.
6. **Reload after a write.** The list is the truth, not the component's state.
7. **The result of an action is a toast**, never a banner pushed in above the
   panel. See **Messages** below for the one case that stays inline.
8. **A form opens as a `FormPanel` above the list**, not as a row of fields
   wedged into the table's toolbar.
9. **Typecheck with `npx tsc -p tsconfig.app.json --noEmit`.** The root
   `tsconfig.json` is a solution file with no files of its own — running `tsc`
   against it reports success on code that does not compile.

---

## Theme

`src/lib/theme.ts` is the only place a colour, radius or component default is
declared. **Nothing in a page writes a brand hex.**

Every value derives from the `BRAND` object at the top of that file. Change
`navy` there and the whole panel follows.

### Palette

| Token | Value | Contrast on white | Use |
| --- | --- | --- | --- |
| `primary.main` | `#061948` | 16.9:1 | App bar, primary buttons, active nav, links |
| `primary.dark` | `#03102f` | — | Hover and pressed |
| `primary.light` | `#2c3b64` | 11.0:1 | Large fills that read as a slab in full navy |
| `secondary.main` | `#d58a2b` | **2.8:1** | Accent only — see below |
| `text.primary` | `#3c4252` | 10.0:1 | Body text |
| `text.secondary` | `#4a5265` | 7.8:1 | Labels, captions, table headers |
| `divider` | `#e6e8ee` | — | Borders and rules |
| `background.paper` | `#ffffff` | — | Panels, tables, dialogs |
| `background.default` | `#f8f9fb` | — | The page behind them |

**Gold is an accent, never a surface.** `#d58a2b` measures 2.8:1 on white, below
the 4.5:1 AA needs for body text. It is legitimate as an icon, a left border on
a callout, or a small chip with white text on it. It is not legitimate for body
copy, a primary button, or a filled bar.

**One theme.** Light only. White is half the brand, so the panel stays white
whatever the operating system prefers. There is no `prefers-color-scheme`
handling and none should be added to a component.

### Spacing

| `sx` value | Pixels | Between |
| --- | --- | --- |
| `0.5` | 4px | Buttons in a table row |
| `1` | 8px | Tiles in a grid, controls in a panel header |
| `1.5` | 12px | The padding a tile grid sits in |
| `2` | 16px | Fields in a dialog; one dashboard panel and the next |
| `2.5` | 20px | Page head and the first panel |
| `4` | 32px | A section heading inside a screen |

A dashboard is a dozen panels of tiles at once, so its gaps are the tight end of
this table — `spacing={1}` inside a `p: 1.5` grid, `mt: 2` between panels. Wider
than that and the screen reads as four separate pages stacked.

### Border radius

Four values, and no others.

| Token | `sx` value | Use |
| --- | --- | --- |
| sm | `1` (4px) | Thumbnails, small chrome |
| md | `2` (8px) | Every surface: panels, tables, dialogs, nav items |
| pill | `6` | The topbar search field |
| circle | `"50%"` | Avatars, dots |

`shape.borderRadius` is 8, so a `Paper` or `Panel` needs nothing in `sx`.

---

## Status colour

Semantic colour is **separate from the brand** and is the one place colour does
real work. Do not restyle these to navy for visual consistency.

| Meaning | MUI colour | Examples |
| --- | --- | --- |
| Success | `success` | Approved, Delivered, Active, Yes, Day closed |
| Warning | `warning` | Pending, In progress, On break, Open |
| Error | `error` | Declined, Unpriced, Inactive, destructive actions |
| Default | `default` | Anything unrecognised |

Use the shared components rather than a `Chip` with a colour picked by hand:

| Component | For |
| --- | --- |
| `StatusChip` | `transactions.status` — 0 pending, 1 approved, 2 declined |
| `OrderChip` | `orders.status` — preparing, delivered, other |
| `YesNo` | Any boolean column |

All three are `variant="outlined"` and `size="small"`. A chip always carries a
**word as well as a colour** — colour is never the only signal.

---

## Components

`src/components/ui.tsx` holds the shared set. They exist so loading, error and
empty states are identical on every screen, which is most of what makes a panel
feel finished.

| Need | Use | Not |
| --- | --- | --- |
| Page title and one action | `PageHead` | A bare `Typography variant="h1"` |
| A surface | `Panel` | `Paper`, `Card`, `CardContent` |
| A table's states | `TableFrame` | A hand-rolled `CircularProgress` |
| Server pagination | `Pager`, passed as `Panel footer={…}` | `TablePagination`, or `Pager` as a child |
| A short form | `Dialog` | A raw `MuiDialog` |
| The result of an action | `useToast()` | `Notice`, a bare `Alert`, a `msg`/`err` state pair |
| Something permanently true of the screen | `Notice` | A toast that vanishes |
| A figure on a card | `Tile` | `Paper` with your own padding |
| A file | `FileField` | A raw `<input type=file>` |
| Money | `money()` | `toLocaleString` inline |

### Tables

```tsx
<Table size="small" stickyHeader>
```

- `size="small"` everywhere. This is a dense product.
- `stickyHeader` on anything that can exceed a screen.
- `hover` on every body row.
- Figures: `align="right"` **and** `className="tabular"`.
- Identifiers — report numbers, order numbers, `#id` — get `className="mono"`.
  People read them character by character against a printed document.
- The actions column is last and unlabelled: `<TableCell />` in the head.
- Wrapping text needs `sx={{ whiteSpace: 'normal', minWidth: 160 }}`; everything
  else stays on one line and the container scrolls.

### Panel anatomy

A list screen is one `Panel`, and everything has a fixed place in it:

```tsx
<Panel
  title="Attribute values"
  actions={<Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
    <SearchField … /> {branchFilters(220)} <Button variant="contained" startIcon={<AddIcon />}>Add value</Button>
  </Stack>}
  count={`${shown} of ${total} in ${branch}`}
  footer={<Pager meta={data?.meta} onPage={setPage} />}
>
  <TableFrame …><Table size="small" stickyHeader>…</Table></TableFrame>
</Panel>
```

- **Header, one row, in this order:** search, filters, the primary action.
  Selects in a header take a fixed width — 220 — so they line up; the same
  selects in a form take none and fill their grid cell.
- **Footer, one row:** the count on the left, the `Pager` on the right, sharing
  a single rule. Two stacked footers is the bug this replaced.
- **`Panel` pads nothing**, so a table can run edge to edge. Anything else you
  put in a panel supplies its own `px: 2, py: 1.5`.
- **A filter that is not set says so:** `TableFrame emptyText="Select a
  category."` rather than an empty table or "Nothing here yet."

### Filters and forms share their selects

Where a form needs the same Category / Subcategory pair the header filters, it
is **one function returning both fields**, called twice — never a second copy:

```tsx
const branchFilters = (width?: number) => ( … );   // header: 220. form: undefined
```

While **adding**, the form's selects drive the page filter, so the list behind
follows what you are about to create. While **editing** they are form-local: a
row that refilters itself out from under you mid-edit is the same bug twice.

**Never hold a picked record as an object found in a list.** Hold its id and
derive the record. `rows.find(…)` against a list fetched for another branch
returns `undefined`, and a save guarded on that object silently does nothing.

### Buttons

| Variant | Use | Count |
| --- | --- | --- |
| `contained` | The one action that matters here | One per screen or dialog |
| `text` (default) | Row actions, secondary actions | Any |
| `color="error"` text | Delete, decline, retire | Any |

`disableElevation` is global. Do not add shadows to buttons.

### Forms

- `TextField` defaults to `size="small"` and `fullWidth` — do not repeat them.
- A select is a `TextField select`, never a bare `Select`.
- Constraints go in `slotProps.htmlInput`: `{ min: 0, step: 0.001 }`.
- Explanation goes in `helperText`, not a paragraph above the field.
- Dialogs stack fields in `<Stack spacing={2}>`.

---

## Messages

**The result of an action is a toast.** `useToast()` from
`src/components/Toast.tsx`, mounted once in `App.tsx`:

```tsx
const toast = useToast();
…
try {
  await api.patch(`/admin/attributes/${id}`, body);
  toast.ok('Attribute updated.');
  reload();
} catch (e) {
  toast.error(messageOf(e));
}
```

`ok` · `error` · `info`. Bottom right, 4s for a success and 8s for a failure,
one at a time with the rest queued. Click-away does not dismiss it — a message
must not disappear because someone clicked the table behind it.

There is no `msg` / `err` state pair on a page any more, and no
`{msg && <Notice kind="ok">…}` above the panel. That pattern moved the whole
page down on every save and then sat there until something else replaced it.

**`Notice` is for what stays true**, not for what just happened:

| Case | Use |
| --- | --- |
| Saved, deleted, moved, failed | `toast` |
| The fetch behind this screen failed | `Notice` — it describes what you are looking at |
| A standing explanation (a role has no permissions yet) | `Notice` |
| Sign-in, forgot password, reset | `Notice` — the message belongs on the form, and these render outside the shell |

---

## Roles and permissions

### Three kinds of user

| Kind | `role_id` | Signs in at | Sees |
| --- | --- | --- | --- |
| **Super admin** | 1 | `/super` or the default address | Everything, unrestricted |
| **Admin** | 1 | the default address | Everything, unrestricted |
| **Staff** | 2, 3, 4, 5 | `/team` | Their laboratory, narrowed by the permission matrix |

> **The database has five roles, not three.** `administrator` (1),
> `frenchise` (2, a laboratory), `LAB EMPLOYEE` (3), `MANAGER` (4) and
> `Office Boy` (5). Roles 3, 4 and 5 are all staff; role 2 is a laboratory,
> which behaves like staff but scopes to itself rather than to an employer.
>
> Super admin and admin are the **same role** in the data — the split is which
> door they came in by, not what they may do. If they are meant to be different,
> that is a schema change and a decision, not a styling one.
>
> Guards test `role_id > 2` for staff. **Never hardcode `role_id === 3`** —
> roles 4 and 5 are in use.

### Permissions in the UI

`role_permissions` carries 14 action types per role, each with view, create,
update and delete. It is **enforced by the API**, and the UI should not offer a
button the role would be refused.

```tsx
import { usePermissions } from '@/lib/permissions';

const { can } = usePermissions();

{can('report', 'create') && <Button>Add report</Button>}
```

The matrix loads once at sign-in — fourteen rows that do not change while
someone is working. While it is loading `can()` returns false, because showing a
button and then taking it away is worse than showing it a moment late.

| Rule | Why |
| --- | --- |
| Check before an Add, Edit or Delete button | A control that 403s on click is worse than one that isn't there |
| Administrators pass every check | The matrix describes staff; locking an admin out of the screen that edits it would be a trap |
| A screen with no matrix entry is allowed | Hiding it would break it with no way to switch it back on |
| The server enforces regardless | This only stops the UI offering a dead button |
| The role gates the concept, the matrix gates the person | An administrator has no laboratory, so issuing a certificate is not theirs whatever the matrix says. Both have to agree |

---

## Writing

The words are part of the interface. Most of what makes a panel feel considered
is that its messages were written rather than emitted.

**Say what happened, in a sentence.**

> Order settled and marked delivered.
> Commission for IIGL-KOLKATTA set to 15%.

**An error says what is wrong and what to do about it.**

> That range overlaps an existing band of 0 to 15. Adjust the range or edit that band.
> Item 9693 cannot drop to 1: 2 certificates have already been issued.

Not "Invalid input" or "Operation failed."

**Name things as the person does.** Certificates, not reports. Laboratories, not
labs or members. In progress, not preparing. The database says `reports` and
`preparing`; the screen does not have to.

**Explain a number that looks wrong before someone reports it as a bug.** The
order screen says a certificate priced at zero is a gap in the price table, not
free work.

**Sentence case everywhere** — buttons, headings, labels, menu items. Not Title
Case, not ALL CAPS, except `overline`, where the uppercase is a type style.

---

## Money

Indian grouping, through `money()` from `src/components/ui.tsx`. Never
`toLocaleString` inline.

```
money(113778)  →  1,13,778
money(null)    →  —
```

Figures are right-aligned and `tabular`. Currency amounts on a card or tile show
without a symbol; the label says what they are.

---

## API conventions

Base path is `VITE_API_URL`, default `/api`. See `src/lib/config.ts`.

**Every response is wrapped.** A record is `{ data }`; a list adds `meta`:

```json
{ "data": [ … ], "meta": { "page": 1, "per_page": 50, "total": 9608, "total_pages": 193 } }
```

**Errors are always the same shape.** `messageOf(err)` pulls the message out;
put it in `toast.error`, never in the table body.

```json
{ "error": "conflict", "message": "All 2 reports for this item have already been created." }
```

**A 401 anywhere returns the whole panel to sign-in.** It is handled once in
`api.ts` and is not a screen's problem.

---

## Accessibility

- Every icon-only control needs a label. A checkbox takes
  `slotProps={{ input: { 'aria-label': '…' } }}`.
- Colour is never the only signal — a chip carries a word too.
- Focus rings come from MUI. Do not remove outlines.
- Body text stays at or above 4.5:1. That is why gold is not a text colour.

---

## Material UI

The panel is on **Material UI 9.3**. Answers written for v5–v7 break here:
system layout props are gone (use `sx`), `Stack` takes `spacing`, slot overrides
go through `slotProps`.

Use the **`mui-mcp`** server — registered in `.mcp.json` at the repo root — for
anything Material UI: `useMuiDocs` for the installed version's documentation,
`fetchDocs` for a page. The machine-readable index is `https://mui.com/llms.txt`,
and any page has a plain-text form with `.md` appended
(`https://mui.com/material-ui/react-breadcrumbs.md`).

Reach for the documented component before building one: `Breadcrumbs` for the
trail, `Drawer` for the sidebar, `Table` for lists. The panel's own wrappers are
in `src/components/ui.tsx`.

---

## State and colour

One scale, in `src/components/ui.tsx`:

```ts
type Tone = 'settled' | 'waiting' | 'refused' | 'plain';
```

Everything that reports a state takes its colour from it, so the same meaning is
the same colour on every screen:

| Where | How |
| --- | --- |
| Chips | `StateChip` with `transactionState()`, `orderState()`, `flagState()`, `attendanceState()`, `remainingState()` |
| The result of an action | `toast.ok` / `toast.error` — an `Alert` inside a `Snackbar`, severity from the call |
| A standing message | `Notice` — `kind` (`ok`/`error`/`warn`/`info`) resolves to a tone, then to an Alert severity |
| Figures | `Tile tone=` — the dashboard's Outstanding is `waiting` while anything is owed, `settled` at zero |
| Destructive controls | `IconAction danger` — nothing types `color="error"` at a call site |
| The rest | `toneColour(tone)` for the odd badge or line of text |

**A new state picks a tone; it does not choose a colour.** If a state is
genuinely none of the four, extend the scale here and every screen gains it at
once.

```bash
grep -rn 'color="error"\|color="success"\|color="warning"\|severity=' src --include=*.tsx | grep -v components/ui.tsx
# no matches — every colour decision lives in ui.tsx
```

Role narrowing is named, not numbered: `isAdmin(user)` / `isLab(user)` from
`src/lib/portal.ts`. They say who someone is, not what they may do — a write
control still needs `can()` from the permission matrix.

---

## Row actions

**A table row's controls are icons, never words.** `RowActions` + `IconAction`
in `src/components/ui.tsx`:

```tsx
<RowActions>
  <IconAction label="Edit attribute" icon={EditIcon} onClick={…} />
  <IconAction label="Values" icon={ValuesIcon} onClick={…} />
  <IconAction label="Retire" icon={RetireIcon} danger onClick={…} />
</RowActions>
```

At seven rows a word repeats seven times and the eye reads the same three
labels over and over, while the data they belong to gets the narrower column.

The label does not disappear — it is the tooltip **and** the accessible name, so
the control still announces itself to a screen reader and to anyone who hovers.
A disabled action keeps its tooltip through a wrapper span, because a disabled
button fires no events and the one control someone is unsure about must still be
able to explain itself.

`danger` takes the refused tone. An action that is really a link takes `to`
rather than `onClick`, so it renders as an anchor and middle-click still works.

**Page-level actions stay labelled.** "Add band" is a sentence about what the
page does; "Edit" beside a row is a verb the row already implies. The one row
exception is a wizard's choice — `NewReport`'s **Choose** — where the label is
the instruction, not a repetition.

---

## Adding a screen

1. Route in `src/App.tsx`. Administrator-only screens go inside `<AdminOnly>`;
   the API enforces the same rule, so this is about not showing someone a screen
   they cannot use.
2. Navigation entry in `src/components/Shell.tsx`, in the right group of the
   right menu — `ADMIN_GROUPS` for the head office, `FIELD_GROUPS` for the
   counter — with an outlined icon. If it deep-links into an existing screen,
   follow the rules under **The menu** and add its label to `VIEWS` in
   `src/lib/breadcrumbs.ts`; a child route goes in `LEAVES`.
3. Start from `PageHead` + `Panel` + `TableFrame`. Load with `useFetch`.
4. Write with `api.*`, catch with `messageOf(err)`, report with
   `toast.ok` / `toast.error`, then `reload()`.
5. Gate every write control behind a permission check.
6. Typecheck with `npx tsc -p tsconfig.app.json --noEmit` and build with
   `npx vite build`. The root `tsconfig.json` checks nothing.

---

## Charts

There is no charting library, and adding one needs a reason bigger than a
dashboard panel. `src/components/TrendChart.tsx` is a twelve-month area chart in
about seventy lines of inline SVG: one path for the line, one for the fill, and
a `<linearGradient>` from the series colour at 38% down to transparent — which
is the whole reason it reads as an area rather than a shape.

- The gradient id comes from `useId()`. Two charts on one page that share an id
  share a fill, and the second one gets the first one's colours.
- The line path takes `vectorEffect="non-scaling-stroke"`, or the
  `preserveAspectRatio="none"` stretch thins it unevenly.
- Colour comes from `BRAND`. Navy for the primary series, gold for the second —
  gold is legible here because it is a 2px line, not a text colour.
- No axis, no tooltip, no zoom. The shape of the last year is the point; the
  exact figures are the tiles above it.

**Never chart a column that is mostly zero.** `orders.payable_amt` is 0 on most
recent rows, so a revenue line draws a collapse that did not happen. The
dashboard charts orders and certificates because both are real for every month.

---

## What the certificate cards are not

The printed smart and classic cards keep the gold `#bc8f53` of the IIGL
documents and are **not** governed by this guide. They are records already in
circulation; recolouring them is a separate decision with its own reissue cost.
