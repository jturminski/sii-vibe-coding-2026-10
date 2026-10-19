# Design Guidelines — Code10

Extracted from [code10it.com](https://code10it.com/) on 2026-10-17 with the Playwright CLI (computed styles, desktop viewport, cookie banner dismissed). Machine-readable tokens: [`assets/design-tokens.json`](../assets/design-tokens.json).

> Values come from the public website, not from an official brand book. Where they disagree with official Code10 brand material (e.g. the `code10-design` skill), the official material wins.

## Tokens Used in the App

The app (`app/src/app/globals.css`) follows the `code10-design` skill, not the extracted website values below (decided 2026-10-18, T2.4).

| Role | Value | Contrast |
|---|---|---|
| Primary (buttons, focus ring) | `#FFB702` with `#4D4D4D` text | 4.84:1 |
| Foreground | `#4D4D4D` (never pure black) | 8.45:1 on white |
| Muted foreground | `#666666` | 5.74:1 on white |
| Destructive | `#C0392B` with white text | 5.44:1 |
| Success | `#2E8B57`; status badge uses `#287A4C` with white text | 5.28:1 (badge) |
| Border / input border | `#D6D6D6` / `#8A8A8A` (`ink-400`) | input border 3.45:1 on white, the lightest Code10 grey meeting WCAG 1.4.11 (3:1) |
| Radius | 8px buttons, inputs and cards; 4px small; 12px largest | |

Use the website values only as a visual reference for Manual QA (`assets/homepage.png`).

## Assets

| Asset | Path | Notes |
|---|---|---|
| Homepage screenshot | [`assets/homepage.png`](../assets/homepage.png) | Full page, no overlays — visual reference for Manual QA |
| Logo | [`assets/logo.png`](../assets/logo.png) | 221×62 PNG, transparent background; "CODE" grey + "10" in yellow square |
| Favicon | [`assets/favicon.png`](../assets/favicon.png) | 150×150 PNG |
| Design tokens | [`assets/design-tokens.json`](../assets/design-tokens.json) | Colors, type, spacing, radius, components |

## Colors

| Token | Hex | Usage |
|---|---|---|
| `brand.primary` | `#FAB612` | Brand yellow: primary buttons, links, active nav items, top bar, highlights |
| `brand.primaryAlt` | `#F5B913` | Slight variant seen on gradient sections; treat as `primary` |
| `brand.accent` | `#F1980A` | Orange end of the yellow gradient (contact banner) |
| `brand.error` | `#FF0000` | Required-field markers and form errors |
| `brand.success` | `#2E7D32` | Not present on the site; neutral default for success states |
| `background.default` | `#FFFFFF` | Page and header background |
| `background.light` | `#F5F5F5` | Subtle section background (not extracted; suggested neutral) |
| `background.dark` | `#4D4D4D` | Dark solution cards (AI, Data & Analytics…) |
| `background.darkTranslucent` | `rgba(77,77,77,0.79)` | Text panel over hero images |
| `text.primary` | `#4D4D4D` | Body text and headings on light backgrounds |
| `text.secondary` | `#69727D` | Secondary copy, meta information |
| `text.muted` | `#808285` | Captions, footnotes |
| `text.onDark` | `#FFFFFF` | Text on dark or yellow surfaces (buttons) |
| `text.input` | `#142341` | Form field text |
| `border.input` | `#CCCCCC` | Form field borders |
| `neutral.buttonDark` | `#54595F` | Dark pill buttons in the top bar |

Contrast note: white text on `#FAB612` (as used on buttons) has low contrast (~1.8:1). For body-size text in the app, prefer `#4D4D4D` on yellow, or keep white only for bold 15px+ button labels as on the site.

## Typography

- **Font family:** `"Montserrat", sans-serif` for everything (headings, body, buttons, nav).
- **Source:** Montserrat is a Google Font (SIL Open Font License). The site self-hosts it via Elementor (`/wp-content/uploads/elementor/google-fonts/`) and also loads `fonts.googleapis.com`. No fonts were downloaded into this repo — load it from Google Fonts or `@fontsource/montserrat` (weights 400, 500, 600). Roboto on the site comes from an accessibility plugin and is not part of the brand.

| Role | Size | Weight | Line height | Transform |
|---|---|---|---|---|
| Hero title (h1) | 25px | 600 | 35px | none |
| Section title (h3) | 25px | 600 | 32.5px | uppercase |
| Card / subheading (h2) | 25px | 600 | 32.5px | capitalize |
| Lead paragraph | 20px | 400 | 33px | none |
| Body | 15px | 400 | 24.75px (1.65) | none |
| Nav / links / buttons | 15px | 600 | — | none |
| Form fields | 14px | 400 | — | none |

Weight scale: 400 regular, 500 medium, 600 semibold (default for emphasis), 700 bold (rare).

## Spacing

Base unit **4px**. Common values: 4, 8, 12, 16, 20, 24, 32, 40px. Buttons use `15px 30px`; inputs use `8px`; paragraphs have a 32px bottom margin in hero sections. Sections are separated by generous whitespace (80px+ on desktop).

## Border Radius

| Token | Value | Usage |
|---|---|---|
| `none` | 0px | Inputs, dark solution cards, top bar |
| `sm` | 4px | Small UI elements |
| `md` | 10px | Primary buttons |
| `lg` | 12px | Light content cards (with shadow) |
| `full` | 999px | Pill buttons in the top bar |
| `circle` | 50% | Carousel dots, icon buttons |

## Components

- **Top bar:** full-width `#FAB612` strip above the header, centered `#4D4D4D` text ("Meet us in TechEd Berlin") with a dark pill button on the right.
- **Header:** white background, logo at left (~128px wide), nav centered/right, language flags at far right.
- **Nav:** Montserrat 15px; items `#4D4D4D`, active/hover `#FAB612` weight 600; dropdowns marked with a caret.
- **Primary button:** `#FAB612` background, white text, 15px / 600, padding `15px 30px`, radius 10px, no border. Labels like "Find out more", "Read more", "Register now".
- **Dark pill button:** `#4D4D4D`/`#54595F` background, white text, fully rounded.
- **Light card:** white, radius 12px, shadow `0 0 10px rgba(0,0,0,0.13)`, title 25px/600, justified body text, yellow button at the bottom.
- **Dark card:** `#4D4D4D` background, white text, yellow line icon at top, yellow button.
- **Hero:** full-width dark tech imagery with a translucent grey text panel (`rgba(77,77,77,0.79)`), white h1 and lead text, yellow CTA; carousel arrows and dots.
- **Inputs:** white, `1px solid #CCCCCC`, square corners, 8px padding, 42px height, 14px text in `#142341`; labels bold, required marker `*` in red.
- **Contact banner:** horizontal yellow-to-orange gradient (`#FAB612` → `#F1980A`) with dark text and a dark pill button.

## Logo Usage

Use [`assets/logo.png`](../assets/logo.png) at top-left of the header, about 128px wide, on white or light backgrounds. Keep clear space at least the height of the "10" square around it. No inverted (dark-background) variant was found on the site; on dark surfaces place the logo on a white container or request an official inverted version.

## Visual Style Summary

Code10 presents itself as a clean, corporate IT consultancy: lots of white space, a single strong yellow accent and neutral greys. Montserrat in semibold gives headings a modern, geometric feel, while body copy stays light and readable. Yellow is reserved for action — buttons, links, active states and the top bar — and dark grey cards with yellow icons add contrast for product sections. Imagery is dark, technical and abstract (circuits, data), balancing the bright accent with a professional tone.
