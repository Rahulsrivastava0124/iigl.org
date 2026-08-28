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

Hero heading size:

```jsx
text-[clamp(36px,3.2vw,54px)]
leading-[1.04]
```

Section heading size:

```jsx
text-[clamp(30px,3.2vw,46px)]
leading-[1.08]
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

## Icons

Use `lucide-react` icons.

Icon color:

```jsx
text-[#d58a2b]
```

Icon circles:

```jsx
h-[58px] w-[58px] rounded-full bg-[#f7efe7] text-[#d58a2b]
```

## Decorative Elements

Do not use ornaments, decorative divider lines, faint watermark icons, or corner arc graphics unless the user explicitly asks for them.

Keep sections clean, spacious, and focused on text, imagery, and cards.

## Tailwind Usage

Use Tailwind utility classes directly in components.

Keep `src/styles.css` limited to:

- `@import "tailwindcss";`
- base font/body styles
- third-party overrides such as Swiper pagination

Do not recreate large component styles in CSS when Tailwind classes can handle them.
