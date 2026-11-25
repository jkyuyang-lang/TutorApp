# Design System — Frans Hals Museum-inspired

Bold, warm, editorial. Saturated golds against deep darks. Color-blocked sections. Uppercase labels. High contrast.

## Architecture

```
src/styles/tokens.css    Portable CSS custom properties (--fh-*)
src/app/globals.css      Tailwind theme mapping + light/dark themes
```

`tokens.css` is framework-agnostic. Drop it into any project and use `var(--fh-*)`.

---

## Color Palette

### 5 Scales (50-900 each)

| Scale   | Tailwind prefix | Vibe                            |
|---------|----------------|---------------------------------|
| **Gold**  | `gold-*`       | Warm, saturated, dominant brand |
| **Sage**  | `sage-*`       | Muted olive-green accent        |
| **Navy**  | `navy-*`       | Deep blue-black, gallery dark   |
| **Coral** | `coral-*`      | Warm red for errors / alerts    |
| **Cream** | `cream`        | Warm off-white for cards        |

### Light Theme — Gold is the background

The background is **gold-300** (saturated, not a subtle cream). Cards sit on **cream**. Text is **navy-900**. This is the museum's signature look: warm, bold, unapologetic.

| Role             | Token              | Feel                    |
|------------------|--------------------|-------------------------|
| `background`     | gold-300           | Saturated gold surface  |
| `foreground`     | navy-900           | Near-black text         |
| `card`           | cream              | Warm white cards        |
| `primary`        | navy-900           | Dark buttons/CTAs       |
| `primary-fg`     | gold-300           | Gold text on dark btns  |
| `secondary`      | sage-300           | Green accent buttons    |
| `border`         | gold-400           | Visible, warm borders   |
| `ring` (focus)   | sage-300           | Green focus rings       |
| `sidebar`        | navy-900           | Dark sidebar contrast   |

### Dark Theme — Navy gallery at night

| Role             | Token              | Feel                    |
|------------------|--------------------|-------------------------|
| `background`     | navy-900           | Deep dark               |
| `foreground`     | gold-100           | Warm light text         |
| `primary`        | gold-300           | Gold buttons            |
| `primary-fg`     | navy-900           | Dark text on gold       |
| `secondary`      | sage-300           | Green accents           |

---

## Color-Blocked Sections

The museum alternates bold colored sections down the page. Use these utility classes:

```html
<section class="fh-section-gold">Gold background, dark text</section>
<section class="fh-section-dark">Navy background, warm light text</section>
<section class="fh-section-sage">Sage background, dark text</section>
<section class="fh-section-cream">Cream background, dark text</section>
<section class="fh-section-coral">Coral background, dark text</section>
```

---

## Typography

**Font:** Rubik (Google Fonts) — 400, 500, 600, 700.

### The hierarchy is deliberately dramatic

| Class            | Size   | Weight | Style                         |
|------------------|--------|--------|-------------------------------|
| `fh-display`     | 96px   | 700    | Billboard, tighter tracking   |
| `fh-hero`        | 72px   | 700    | Page hero                     |
| `fh-heading-1`   | 56px   | 700    | Section hero                  |
| `fh-heading-2`   | 40px   | 700    | Page heading                  |
| `fh-heading-3`   | 30px   | 600    | Card heading                  |
| `fh-heading-4`   | 24px   | 600    | Sub-section                   |
| `fh-heading-5`   | 20px   | 500    | Minor heading                 |
| `fh-body-lg`     | 18px   | 400    | Lead paragraph                |
| `fh-body`        | 16px   | 400    | Body text                     |
| `fh-body-sm`     | 14px   | 400    | Secondary text                |
| `fh-caption`     | 12px   | 400    | Metadata, timestamps          |
| `fh-label`       | 12px   | 700    | UPPERCASE, widest tracking    |
| `fh-label-lg`    | 14px   | 700    | UPPERCASE, wider tracking     |

### Base heading styles

All `h1`-`h6` elements automatically get bold Rubik with tight leading. No extra classes needed for basic headings.

---

## Visual Patterns

### The Museum Look

1. **Saturated backgrounds** — Gold-300 is the page background, not a whisper of cream
2. **Color blocks** — Sections alternate between gold, dark navy, sage, and coral
3. **Uppercase labels** — Navigation, categories, and metadata use `fh-label` (bold, tracked, caps)
4. **High contrast** — Navy-900 text on gold, gold-100 text on navy. Always WCAG AA+
5. **Bold headings** — H1/H2 are oversized (56px/40px) and bold-700. They command attention
6. **Warm cards** — Cards use cream (`--fh-cream`) on the gold background for subtle lift
7. **Dark sidebar** — Navigation lives in navy-900 with gold accents for dramatic contrast

### Usage Examples

```tsx
{/* Hero section with dramatic heading */}
<section className="fh-section-gold px-8 py-20">
  <span className="fh-label text-navy-600 mb-4 block">OUR HIGHLIGHTS</span>
  <h1 className="fh-hero max-w-3xl">The art of learning, together</h1>
</section>

{/* Dark content block */}
<section className="fh-section-dark px-8 py-16">
  <span className="fh-label text-gold-400 mb-4 block">UPCOMING</span>
  <h2 className="fh-heading-2">Your next lessons</h2>
  <div className="mt-8 grid grid-cols-3 gap-6">
    <Card>...</Card>
  </div>
</section>

{/* Navigation label style */}
<nav>
  <span className="fh-label">Dashboard</span>
  <span className="fh-label">Lessons</span>
  <span className="fh-label">Messages</span>
</nav>
```

---

## Spacing, Radii, Shadows, Transitions, Layout

See `src/styles/tokens.css` for complete values. Key points:

- **Spacing:** 4px base unit, scale from 2px to 128px
- **Radii:** sm(4px) through 2xl(24px) + full(pill)
- **Shadows:** 6 levels (xs through 2xl), oklch black
- **Transitions:** fast(100ms), normal(200ms), slow(350ms), slower(500ms)
- **Containers:** 640px through 1440px
- **Z-index:** base(0) > dropdown(10) > sticky(20) > overlay(30) > modal(40) > toast(50)
