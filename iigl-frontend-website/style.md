# IIGL Frontend Style Guide

## Typography

Use two font families across the website:

- Headings: `Playfair Display`
- Body, navbar, buttons, and labels: `Montserrat`

Font imports live in `index.html`.

```html
https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600&family=Playfair+Display:wght@400;500;600&display=swap
```

Do not use heavy bold font weights. Keep typography refined and light.

- Body text: `font-normal`
- Small labels: `font-medium`
- Navbar links: `font-medium`
- Buttons: `font-medium`
- Section headings: `font-medium`

Avoid `font-bold`, `font-extrabold`, and `font-black`.

## Heading Style

Primary and section headings should use:

```jsx
font-['Playfair_Display',Georgia,'Times_New_Roman',serif]
font-medium
tracking-normal
text-[#061948]
```

All section headings must use Title Case display text, such as `Our Report Categories`. Do not force section headings to all caps with uppercase text or the `uppercase` utility. Keep the same section heading size across the website — one size for every section, and the hero's larger size for the hero alone.

Hero heading size:

```jsx
text-[46px]
leading-[1.06]
max-[560px]:text-[32px]
```

Section heading size — smaller than the hero on purpose, so the page has one
loudest line and it is the first one:

```jsx
text-[36px]
font-medium
leading-[1.08]
max-[640px]:text-[28px]
```

Standard centered section header:

```jsx
<div className="mx-auto max-w-[820px] text-center">
  <h2 className="m-0 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[36px] font-medium leading-[1.08] tracking-normal text-[#061948] max-[640px]:text-[28px]">
    Section Heading
  </h2>
  <p className="mx-auto mt-3 max-w-[760px] text-[15px] font-normal leading-[1.65] text-[#4a5265]">
    Section supporting copy.
  </p>
</div>
```

For sections that introduce a card grid, keep the grid close to the header:

```jsx
<div className="mt-7 grid ...">
```

Use manual line breaks with block spans when exact wrapping matters.

```jsx
<h1>
  <span className="block">Institute of</span>
  <span className="block">International</span>
  <span className="block">Gemological Laboratory</span>
</h1>
```

## Body Text

Body copy should use Montserrat with comfortable line height:

```jsx
text-[15px]
font-normal
leading-[1.7]
text-[#3c4252]
```

For wider centered section copy:

```jsx
text-[16px]
font-normal
leading-[1.7]
text-[#4a5265]
```

## Color Palette

Use these colors consistently:

- Primary navy: `#2c3b64`
- Deep navy: `#061948`
- Gold accent: `#d58a2b`
- Dark gold: `#bd7724`
- Body text: `#3c4252`
- Muted text: `#4a5265`
- Light section background: `#f8f9fb`
- Why Choose background image: `Assets/whychoose_bg.png`
- Card border: `#e6e8ee`

Gold should be used only for accents, icons, active nav state, and key labels.

## Buttons

Primary dark button:

```jsx
inline-flex h-[54px] w-fit items-center justify-center gap-[18px]
rounded-lg bg-[#061948] px-6
text-[13px] font-medium leading-none text-white
```

Gold pill button:

```jsx
inline-flex h-[38px] min-w-[188px] items-center justify-center gap-2
rounded-full bg-linear-to-b from-[#df9d3d] to-[#bd7724] px-6
text-[12px] font-medium leading-none text-white
```

Button text should stay medium weight, not bold.

## Navbar

Navbar text:

```jsx
text-[13px]
font-medium
text-[#2c3b64]
```

Active nav item:

```jsx
text-[#d58a2b]
after:bg-[#d58a2b]
```

Keep nav height at `60px` on desktop and `58px` on small mobile.

## Cards

Cards should stay simple and clean:

```jsx
min-h-[198px]
rounded-xl
border border-[#e6e8ee]
bg-white
px-5 py-7
shadow-[0_15px_38px_rgba(44,59,100,0.08)]
```

Avoid nested cards and decorative ornament layers.

For image-led cards, do not put padding on the outer `article` if the image should sit flush with the card edge. Put padding only on the text/content wrapper.

```jsx
<article className="overflow-hidden rounded-xl border border-[#e6e8ee] bg-white shadow-[0_15px_38px_rgba(44,59,100,0.08)]">
  <div className="h-[136px] overflow-hidden bg-[#f8f9fb]">
    <img className="h-full w-full object-cover" src={imageUrl} alt="" />
  </div>
  <div className="px-5 pb-5 pt-[50px]">
    Card text content.
  </div>
</article>
```

## Wide Report Image Sections

For large report/certificate presentation sections, keep the layout editorial and image-led:

```jsx
<section className="bg-white px-5 py-12 text-[#2c3b64] sm:px-8 lg:px-12">
  <div className="mx-auto max-w-[1390px]">
    <div className="grid items-end gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:gap-14">
      <div>
        <h2 className="m-0 flex flex-wrap items-end gap-x-4 gap-y-2 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[36px] font-medium leading-[1.08] tracking-normal text-[#061948] max-[640px]:text-[28px]">
          <img className="h-auto w-[clamp(112px,10vw,154px)] translate-y-[2px]" src={logoTextUrl} alt="IIGL" />
          <span>Reports</span>
        </h2>
      </div>
      <p className="max-w-[650px] text-[17px] font-normal leading-[1.8] text-[#3c4252]">
        Supporting report copy.
      </p>
    </div>

    <figure className="mt-9 h-[clamp(300px,34vw,520px)] overflow-hidden rounded-[22px] border border-[#e6e8ee] bg-[#edf3f7] shadow-[0_20px_46px_rgba(44,59,100,0.12)]">
      <img className="h-full w-full object-cover" src={certificateUrl} alt="" />
    </figure>
  </div>
</section>
```

Keep this report-heading pattern clean: do not add a standalone logo above it, and do not add a decorative divider below it.

## Education Image Sections

For education/course sections that use a wide background image, place the supplied image as the primary visual and layer the copy only over the intentionally blank side of the image. Keep the content readable with a light overlay and avoid adding extra nested cards.

```jsx
<section className="bg-[#f8f9fb] px-5 py-12 text-[#2c3b64] sm:px-8 lg:px-12">
  <div className="mx-auto max-w-[1390px]">
    <div className="relative min-h-[560px] overflow-hidden rounded-[26px] bg-white shadow-[0_18px_50px_rgba(44,59,100,0.10)] ring-1 ring-[#e6e8ee]">
      <img className="absolute inset-y-0 left-0 h-full w-[104%] max-w-none object-cover object-left" src={educationUrl} alt="" />
      <div className="relative z-10 w-[min(51%,640px)] px-8 py-11 sm:px-10 lg:px-12">
        <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#bd7724]">IIGL Education</p>
        <h2 className="mt-7 font-['Playfair_Display',Georgia,'Times_New_Roman',serif] text-[36px] font-medium leading-[1.08] tracking-normal text-[#061948] max-[640px]:text-[28px]">
          Your Journey to Excellence Starts Here
        </h2>
      </div>
    </div>
  </div>
</section>
```

Feature rows inside this section should use `lucide-react` icons in soft gold circles, small Playfair headings, and compact Montserrat descriptions.

Do not add decorative text divider lines, faint watermark icons, or a separate right-side royal-blue brand panel in the education section unless explicitly requested.

## Testimonials

`ReviewsSection.jsx` is the pattern for quoted praise: a gold label, the section
heading, then four house cards in the same 1 / 2 / 4 column grid the report
categories use.

- The label is `text-[12px] font-medium uppercase tracking-[0.14em] text-[#bd7724]`
  with a short gold rule under **it** — not under the heading, where the rest of
  the site has none.
- Stars are lucide `Star` with `fill="currentColor"` and `strokeWidth={0}`. An
  outlined star reads as an empty one, which says the opposite of five out of
  five.
- The quote takes `flex-1` so every card in the row ends its attribution block
  on the same line whatever the length of the words above it.
- The attribution sits under a `border-t border-[#e6e8ee]` hairline: avatar,
  name in `text-[#061948]`, trade in `text-[#4a5265]`.
- **Faces are initials in a `bg-[#f7efe7]` disc.** There are no client
  photographs in `Assets/`, and a stock portrait beside a named person is a
  picture of somebody else.

---

## Footer

The footer sits on the deep navy `#061948` and is the only large dark block on
the site. Gold is used for the column headings, the icons, the send button and
the tagline — never for a body line.

```jsx
<footer className="relative overflow-hidden bg-[#061948] px-5 pt-14 text-white sm:px-8 lg:px-12">
  <div className="mx-auto max-w-[1390px]">
    <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.25fr_0.85fr_0.85fr_0.85fr_1.15fr] lg:gap-8">
```

- Column headings: `text-[12px] font-medium uppercase tracking-[0.14em] text-[#d58a2b]`,
  with a short gold rule under them (`h-px w-9 bg-[#d58a2b]/60`). This is the
  one place a rule under a heading belongs — see Decorative Elements for the
  rest of the site, where it does not.
- Link text is `text-white/70`, brightening to white on hover, with a
  `ChevronRight` that turns gold.
- Body copy on navy: `text-[13px] leading-[1.75] text-white/70`. Do not use the
  light-background body colours here.

### The mark on navy

`Assets/logo-text.png` is **RGB with no alpha**, so placing it on the navy
produces a white rectangle. Use `Assets/footer logo.png`, which has an alpha
channel, and paint it through a CSS mask so the shape takes the brand gold:

```jsx
<span
  aria-hidden
  className="block h-[52px] w-[52px] bg-[#d58a2b]"
  style={{
    maskImage: `url(${markUrl})`,
    maskSize: 'contain',
    maskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskImage: `url(${markUrl})`,
    WebkitMaskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
  }}
/>
```

The same mask at `bg-white/[0.045]` and 320px is the faint diamond in the top
right corner. The wordmark and the tagline beside it are text — Playfair for
`IIGL`, Montserrat for `Learn. Understand. Excel.` in gold — because no asset
carries that lockup in white.

### Brand icons

`lucide-react` 1.x removed Facebook, LinkedIn, Instagram and YouTube. Those four
are inline `<svg>` paths in the footer, which is the one exception to the Icons
rule below: there is no lucide icon to reach for, and a generic globe is not a
social link.

---

## Icons

Use `lucide-react` icons.

Do not use custom inline SVG icons for card or section UI when a `lucide-react` icon is available. For card icon badges, use one direct imported lucide component per icon slot instead of drawing or composing custom SVG shapes.

```jsx
import { Gem } from 'lucide-react';

<Gem className="h-[26px] w-[26px]" strokeWidth={1.6} />
```

Icon color:

```jsx
text-[#d58a2b]
```

Icon circles:

```jsx
h-[58px] w-[58px] rounded-full bg-[#f7efe7] text-[#d58a2b]
```

## Decorative Elements

Do not use ornaments, decorative divider lines below headings, faint watermark icons, or corner arc graphics unless the user explicitly asks for them.

Keep sections clean, spacious, and focused on text, imagery, and cards.

## Tailwind Usage

Use Tailwind utility classes directly in components.

Keep `src/styles.css` limited to:

- `@import "tailwindcss";`
- base font/body styles
- third-party overrides such as Swiper pagination

Do not recreate large component styles in CSS when Tailwind classes can handle them.
