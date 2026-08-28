# iigl-admin

Admin panel for the IIGL API. React, TypeScript and Vite.

## Running it

The API must be running first:

```bash
cd ../iigl-node && npm run dev
```

Then, once:

```bash
cp .env.example .env
```

and:

```bash
npm run dev
```

Opens on `http://localhost:5173`.

```bash
npm run build     # type-check and bundle to dist/
npm run preview   # serve the built bundle
```

## Configuration

Everything lives in `.env`. `.env.example` is committed and documents each
value; `.env` itself is ignored.

| Variable | Default | What it does |
| --- | --- | --- |
| `VITE_API_URL` | `/api` | Where the panel finds the API |
| `VITE_DEV_API_TARGET` | `http://localhost:3000` | Development only: where Vite forwards same-origin API calls |
| `VITE_DEV_PORT` | `5173` | Development only: the port this panel serves on |

**`VITE_API_URL` is read at build time**, not at run time — Vite substitutes it
into the bundle. A build therefore targets one API, and pointing the panel
somewhere else means rebuilding.

### Same origin, the default

```
VITE_API_URL=/api
VITE_DEV_API_TARGET=http://localhost:3000
```

The panel calls its own origin. In development Vite proxies those calls to
`VITE_DEV_API_TARGET`; in production the panel and the API sit behind one host,
served by the same reverse proxy.

Prefer this. The session cookie stays first-party, which survives the
third-party cookie restrictions that a cross-origin setup runs into, and CORS
never comes into it at all.

Note that the development target is *not* baked into a production build — only
`VITE_API_URL` is.

### A separate API host

```
VITE_API_URL=https://api.iigl.org/api
```

The browser calls that host directly and Vite stops proxying, so:

- the API must list this panel's origin in its `CORS_ORIGINS`, including each
  entrance you use — `https://admin.iigl.org`, `https://super.iigl.org`,
  `https://team.iigl.org`;
- both sides must be HTTPS, or the browser will not send the session cookie;
- the API's session cookie is `sameSite=lax`, which is enough for the fetch
  calls this panel makes but would not be for a cross-site form post.

In development the panel logs a note naming the origin that has to be
allowlisted, so a missing entry is obvious rather than showing up as an
unexplained network failure.

## Signing in

Mobile number and password, against the existing `users` table — the same
accounts as the API and the same passwords as the Laravel application.

### Three entrances

| Entrance | Accepts | Locally | In production |
| --- | --- | --- | --- |
| Default | Administrators | `/` | `admin.iigl.org` or the bare domain |
| Super admin | Administrators | `/super` | `super.iigl.org` |
| Team | Laboratories and staff | `/team` | `team.iigl.org` |

The entrance is read from the host first, so a subdomain works in production,
and from the first path segment as well, so `/super` and `/team` work locally
without touching DNS. Deploying under a subdomain needs no rebuild.

Correct credentials at the wrong entrance are refused with a message naming the
right one, and the session is dropped rather than left behind. A cookie from one
entrance does not carry someone into another.

**This is not a permission boundary.** The API decides what each role may do on
every request and always would, whichever door was used. The split is about
giving each group its own address and keeping the wrong sign-in screen out of
their way.

### What each role sees

| Role | Sees |
| --- | --- |
| Administrator (1) | Every laboratory, plus the catalogue and pricing screens |
| Laboratory (2) | Its own orders, certificates, transactions and staff |
| Staff (3, 4, 5) | Their laboratory's records |

Catalogue, attribute and pricing screens are administrator-only, hidden from the
navigation and guarded on the route. The API enforces the same rule, so hiding
them is a courtesy rather than the control.

### When a session ends

Sessions last eight hours, and the API currently keeps them in memory, so a
restart ends them all. Any request that comes back 401 returns the whole panel
to its sign-in screen. It does not leave open screens showing the API message
where their data should be.

## Theme

Material UI, themed to the IIGL colours. Everything lives in `src/lib/theme.ts`
— there is no stylesheet of our own, and `CssBaseline` paints the background.

The primary colour is sampled from the logo files, where `#2c3b64` is the
dominant value across `logo.png`, `h-logo.png`, `card-logo.png` and
`logo-text.png`, so the panel matches the mark rather than approximating it. It
carries 10.96:1 against white, which is why it works for body text and small
labels as well as for fills.

| Token | Value | Used for |
| --- | --- | --- |
| `palette.primary.main` | `#2c3b64` | App bar, primary buttons, active navigation |
| `palette.primary.dark` | `#1d2846` | Hover and pressed |
| `palette.primary.light` | `#4a5c8c` | Large fills that read as a slab in full navy |
| `palette.background.paper` | `#ffffff` | Panels and tables |
| `palette.background.default` | `#f4f5f9` | The page behind them |

`cssVariables: true` is set, so the palette is emitted as CSS custom properties
and can be read from the browser or overridden without rebuilding the theme
object.

Semantic colour is kept separate from the brand: approved is green, pending
amber, declined red. Those carry state and are not swapped for navy.

Light only, deliberately. White is half the brand, so the panel stays white
whatever the operating system prefers rather than flipping to a dark ground.

The certificate cards are **not** part of this — they keep the gold `#bc8f53`
of the printed IIGL documents. Those are records already in circulation, and
recolouring them is a separate decision.

### A note on the Material UI version

This is MUI **v9**, the current stable line. It is stricter than v6 and v7 in
two ways worth knowing before editing a screen:

- The layout system props were removed. `alignItems`, `justifyContent`,
  `flexWrap`, `display` and friends go in `sx`, not on the component. `Stack`
  keeps `direction` and `spacing` — note `spacing`, not `gap`.
- Slot props take an `sx` object rather than raw style keys:
  `slotProps={{ primary: { sx: { fontSize: 13.5 } } }}`.

MUI adds roughly 280 kB to the bundle, taking it to about 170 kB gzipped. That
is the cost of the component library; it is a back office behind a sign-in, not
a public page, so the trade is a reasonable one.

## Screens

| Screen | What it does |
| --- | --- |
| Dashboard | Order counts, certificate count, and the billed, collected and outstanding totals |
| Orders | Filterable list; open one to price it and settle it |
| Order detail | Live quote as the discount changes, then settle and deliver in one step |
| Certificates | List, print a smart or classic card, or select up to 50 and print them as one PDF |
| Transactions | Approve or decline remittances sent to you |
| Laboratories | Set a laboratory's commission rate, activate or deactivate |
| Staff | Who is working where, and create accounts |
| Categories | Categories and subcategories |
| Attributes | Certificate fields per subcategory, their print order, and their allowed values |
| Pricing | Weight bands, standard or per laboratory |

## Notes on behaviour

**Order settlement.** The order detail screen quotes the order live as the
discount changes and shows which price band produced each line. Settlement sends
the discount and what was collected — never the total. The API prices the order
itself, so a figure from the browser can never become the bill.

**Unpriced certificates.** If a certificate's carat weight falls outside every
band it is billed as zero, and the screen says so before you can settle. That
means the price table has a gap, not that the certificate is free.

**Overlapping price bands.** New bands are rejected when they overlap an
existing one for the same category and laboratory. Overlaps that already exist
in the data are shown as they are — category `GEMS STONE` has bands 0–1, 0–15,
1–10 and 15–20, so some weights match more than one row and are priced by
whichever was created first. Worth cleaning up.

**Retiring attributes.** Attributes and their values are retired rather than
deleted. Certificates hold attribute ids inside a JSON column that no foreign
key protects, so removing a row would leave a blank field on cards already
issued.

**Batch printing.** Selecting certificates and printing posts a list of ids, so
the PDF arrives as a response body rather than at a URL. It is opened as a blob.
Fifty per request is the API's cap.

## Not built yet

Blog, branch pages, website content and banners — the content management side of
the old admin. Those endpoints do not exist on the API yet either.

Employment records are read-only here. Creating an account does not attach it to
a laboratory; that link lives in the `employements` table and still has to be
made directly.

File uploads. Item images, signatures and payment attachments are referenced by
path throughout and still read from the Laravel `public/` directory. Nothing in
either project writes them yet.
