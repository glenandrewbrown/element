# W0-TOKENS — Frozen Neumorphic Token Vocabulary

> **THE CONTRACT.** All Wave-1 component reskins reference THESE tokens. No ad-hoc
> shadow, colour, or glow values anywhere in `webview/src/**`. If a component needs a
> value not listed here, the gap is escalated and this spec is amended FIRST — the
> tokens are frozen, not the reskins.
>
> Source of truth: `webview/src/index.css`. This file documents what is frozen there.
> Owner of `index.css` for Wave-0: the W0-TOKENS task. Status: **FROZEN 2026-06-01.**

Element is "one continuous dark chassis" (Principle 6 of the finish-app plan). Material
coherence outranks per-component local fidelity. Surfaces, shadows, and glows come from a
single shared vocabulary so 30+ components read as the same extruded material — that is the
entire point of freezing this before any reskin starts.

---

## 0. How the token system is layered (read this first)

`index.css` deliberately runs **three** layers. Pick the right one:

| Layer | Form | Where | Use it for |
|-------|------|-------|------------|
| **`@theme` (canonical palette)** | **HEX** | `@theme { … }` | Tailwind utility classes — `bg-canvas`, `bg-surface`, `text-text-primary`, `text-instrument`, `border-panel-border`. This is the authoritative palette. |
| **Frozen global HSL mirror** | **HSL triplet** | `:root { … }` | `hsl(var(--cat-instrument))`, `hsl(var(--depth-2) / 0.45)` — anywhere you need an **alpha-composited** colour, a glow, or a per-level tint. Resolvable in EVERY component. |
| **`.nodeblock-v3` scope** | HSL triplet | `.nodeblock-v3 { … }` | Verbatim mockup-port of the Block chassis. Re-declares cat/sig/status with **identical** values for drop-in parity. Do not diverge it from the global layer. |

**Rule of thumb:** solid background/text/border → Tailwind `@theme` utility. Colour with an
alpha, a glow, a gradient stop, or a depth tint → `hsl(var(--…))` from the global HSL layer.

**Why both HEX and HSL for the same colours?** Tailwind v4 `@theme` generates utilities from
hex. But neumorphism needs `colour / alpha` (glows at 25–45%, tints at 12–55%), which is only
ergonomic with the `hsl(H S% L% / a)` form. The HSL triplets round-trip to the locked hexes
(verified below), so the two layers are the *same palette in two notations* — never a second,
diverging palette.

---

## 1. Surface tones — the chassis (HEX, locked)

Narrow tonal range is **critical** for the "same material" illusion. These are Element's
locked values and override the mockup's (darker) surface HSLs. Defined in `@theme` as hex;
consumed via Tailwind utilities (`bg-canvas`, `bg-panel`, …).

| Token (`@theme`) | Tailwind util | Hex | Usage |
|------------------|---------------|-----|-------|
| `--color-canvas` | `bg-canvas` | `#1E1E22` | Main background — the deepest plane |
| `--color-panel` | `bg-panel` | `#222226` | Side panels, toolbars |
| `--color-surface` | `bg-surface` | `#252529` | Cards, blocks, raised controls |
| `--color-elevated` | `bg-elevated` | `#2A2A2E` | Hover states, lifted surfaces |
| `--color-pressed` | `bg-pressed` | `#1A1A1E` | Inset fields, tracks, recessed wells |
| `--color-panel-border` | `border-panel-border` | `#3A3A3E` | Panel borders & dividers |
| `--color-surface-elevated` | — | `#333338` | Secondary divider / elevated edge |

> The mockup's surface HSLs (canvas `240 6% 11%` ≈ `#1A1A1E`, pressed `240 8% 8%` ≈ `#131316`)
> are **deliberately NOT adopted** — they are darker than Element's locked chassis. Element's
> surfaces stay hex-only; there is no `hsl(var(--canvas))` token, and none is needed (the
> `.neu-*` chassis utilities use hardcoded `hsl(240 5% 20%)`-class literals tuned to these hexes).

---

## 2. Block-category accents (4-category taxonomy)

Colour + shape together (shape carries colour-blind safety). HSL triplets, globally
resolvable. HEX equivalents drive `text-instrument` / `bg-audiofx` etc. via `@theme`.

| Category | Token | HSL | Hex (`@theme` `--color-*`) | Shape | Role |
|----------|-------|-----|-----|-------|------|
| Virtual Instruments | `--cat-instrument` | `210 65% 57%` | `#4A90D9` (`--color-instrument`) | ● Circle | Synths, samplers, audio input |
| MIDI Effects | `--cat-midifx` | `180 65% 47%` | `#2BC4C4` (`--color-midifx`) | ▲ Triangle | MIDI routers, processors, MIDI I/O |
| Audio Effects | `--cat-audiofx` | `38 80% 56%` | `#E8A838` (`--color-audiofx`) | ◆ Diamond | EQ, comp, reverb, delay |
| Modulators / Utilities | `--cat-modulator` | `266 64% 69%` | `#A87FE0` (`--color-modulator`) | ⬡ Hexagon | LFO, value/CV, scripting, routing |

Consume per-block as `hsl(var(--cat-${category}))` where `category ∈ {instrument, midifx,
audiofx, modulator}` (this is exactly how `Block.tsx` resolves its accent).

---

## 3. Signal-type accents (separate system from category)

Drives cables, signal pills, and port pips. Three signal types only.

| Signal | Token | Alias | HSL | Hex (`@theme`) |
|--------|-------|-------|-----|-----|
| Audio | `--sig-audio` | — | `210 65% 57%` | `#4A90D9` (`--color-audio`) |
| MIDI | `--sig-midi` | — | `180 65% 47%` | `#2BC4C4` (`--color-midi`) |
| Value / CV | `--sig-value` | `--sig-cv` → `var(--sig-value)` | `38 80% 56%` | `#E8A838` (`--color-value`) |

> **`--sig-cv` is an alias of `--sig-value`** (same value). Element code/`:root` uses
> `--sig-value`; the mockup/shadcn vocabulary uses `--sig-cv`. Both are frozen and point at
> the identical colour so neither naming divergence can split the palette. Prefer
> `--sig-value` in new Element code.

Category and signal share hex values (Instrument=Audio=blue, MIDIfx=MIDI=teal,
Audiofx=Value=amber) by design — but they are **distinct token namespaces**. Use `--cat-*` for
"what kind of block", `--sig-*` for "what flows through this cable/port". Do not collapse them.

---

## 4. Status (meters, LEDs, alerts)

| Status | Token | HSL | Role |
|--------|-------|-----|------|
| OK | `--status-ok` | `142 69% 58%` | Signal passing, healthy, green LED |
| Warn | `--status-warn` | `38 80% 56%` | Near-clip, caution (== audiofx amber) |
| Clip | `--status-clip` | `358 75% 59%` | Clipping, error, alert-pulse |

`@theme` hex feedback aliases also exist: `--color-success #34D399`, `--color-warning #E8A838`,
`--color-error #EF4444`. For meter/LED/alert chrome inside the canvas, prefer the `--status-*`
HSL tokens (they alpha-compose). For generic UI feedback (toasts, form validation), the
`@theme` `--color-success/warning/error` utilities are fine.

---

## 5. Text / foreground

| Token | Form | Value | Usage |
|-------|------|-------|-------|
| `--color-text-primary` | hex (`@theme`) | `#E5E5EA` | Primary text — `text-text-primary` |
| `--color-text-secondary` | hex (`@theme`) | `#8E8E93` | Secondary / labels — `text-text-secondary` |
| `--color-text-dim` | hex (`@theme`) | `#5A5A5E` | Tertiary / disabled — `text-text-dim` |
| `--foreground` | HSL (`:root`) | `240 11% 91%` (= `#E5E5EA`) | `hsl(var(--foreground) / a)` — alpha text |
| `--muted-foreground` | HSL (`:root`) | `240 3% 56%` (= `#8E8E93`) | `hsl(var(--muted-foreground) / a)` — alpha muted |

---

## 6. Depth-nav tint per breadcrumb level (U2 nested chrome)

Per-level colour for the nested-Board chrome: depth-tinted breadcrumb pills,
`.nested-canvas-frame` border, left `.depth-ribbon`, and the `.depth-banner` ("Nested · Level N
· {board} inside {parent}"). Set `--depth` to the active level's token, then frame/ribbon/pill
read `hsl(var(--depth) / a)`. **These were absent before W0 and are added now** — U2
Breadcrumb+Nav depends on them.

| Level | Token | HSL | Colour |
|-------|-------|-----|--------|
| L0 (root) | `--depth-0` | `210 65% 57%` | blue |
| L1 | `--depth-1` | `180 65% 47%` | teal |
| L2 | `--depth-2` | `266 64% 69%` | purple |
| L3 | `--depth-3` | `38 80% 56%` | amber |
| L4 | `--depth-4` | `320 65% 60%` | magenta (`#DB57AF`) |

---

## 7. Neu shadow / glow recipes (EXACT CSS — copy, do not re-derive)

These are the frozen extrusion recipes. **Do not invent box-shadow values per component.**
Use the utility class; if you need a one-off, copy the recipe verbatim from here.

### 7.1 Shadow primitives (`:root` custom props — for inline `style`)
```css
--shadow-raised:  -2px -2px 6px rgba(255,255,255,0.04), 3px 3px 8px rgba(0,0,0,0.4);
--shadow-pressed: inset -2px -2px 4px rgba(255,255,255,0.04), inset 3px 3px 6px rgba(0,0,0,0.45);
--shadow-glow-audio:     0 0 4px rgba( 74,144,217,0.25);
--shadow-glow-midi:      0 0 4px rgba( 43,196,196,0.25);
--shadow-glow-cv:        0 0 4px rgba(232,168, 56,0.25);
--shadow-glow-modulator: 0 0 4px rgba(168,127,224,0.25);
```

### 7.2 Utility classes (preferred — apply via `className`)
```css
/* RAISED — control extruded from the chassis (light TL + dark BR, ≥8px blur) */
.neu-raised {
  box-shadow:
    -3px -3px 10px rgba(255,255,255,0.055),
     4px  4px 14px rgba(0,0,0,0.55),
    inset 0 1px 0 rgba(255,255,255,0.04);
}

/* PRESSED-SHALLOW — gently recessed (toggles, segmented tracks) */
.neu-pressed-shallow {
  box-shadow:
    inset  1px  1px 3px rgba(0,0,0,0.55),
    inset -1px -1px 3px rgba(255,255,255,0.035);
}

/* INSET — field/track pressed INTO the surface */
.neu-inset {
  box-shadow:
    inset 2px 2px 6px rgba(0,0,0,0.5),
    inset -1px -1px 3px rgba(255,255,255,0.05);
}

/* PRESSED — deep press, button-down state */
.neu-pressed {
  box-shadow:
    inset 4px 4px 10px rgba(0,0,0,0.6),
    inset -1px -1px 2px rgba(255,255,255,0.02);
}

/* FLOATING — popover/menu/command-palette lifted off the chassis */
.neu-floating {
  box-shadow:
    0 14px 44px rgba(0,0,0,0.65),
    -2px -2px 10px rgba(255,255,255,0.04);
}
```

### 7.3 SCULPT — the primary block chassis (gradient face + extrusion)
```css
.neu-sculpt {
  background: linear-gradient(180deg, hsl(240 5% 20%) 0%, hsl(240 6% 15%) 100%);
  box-shadow:
    inset 0  1px 0 rgba(255,255,255,0.075),
    inset 0 -1px 0 rgba(0,0,0,0.45),
    -5px -5px 16px rgba(255,255,255,0.05),
     6px  6px 22px rgba(0,0,0,0.7),
     0 1px 0 rgba(255,255,255,0.03);
}
.neu-sculpt-hover { /* lighter gradient + deeper shadow; NEVER changes size */
  background: linear-gradient(180deg, hsl(240 5% 22%) 0%, hsl(240 6% 16%) 100%);
  box-shadow:
    inset 0  1px 0 rgba(255,255,255,0.09),
    inset 0 -1px 0 rgba(0,0,0,0.5),
    -6px -6px 20px rgba(255,255,255,0.065),
     7px  7px 26px rgba(0,0,0,0.78);
}
```

### 7.4 APERTURE — recessed window cut into the chassis (portal/container interiors)
```css
.neu-aperture {
  background: radial-gradient(ellipse at 50% 35%, hsl(240 10% 10%) 0%, hsl(240 12% 6%) 100%);
  box-shadow:
    inset  4px  4px 12px rgba(0,0,0,0.9),
    inset -3px -3px 10px rgba(255,255,255,0.035),
    inset  0   0   2px rgba(0,0,0,0.7);
}
```

### 7.5 PORT WELL — recessed circular socket every port sits in
```css
.port-well {
  width: 14px; height: 14px; border-radius: 50%;
  background: hsl(240 10% 9%);
  box-shadow:
    inset  1.5px  1.5px 2.5px rgba(0,0,0,0.9),
    inset -1px   -1px   1.5px rgba(255,255,255,0.05);
}
.port-sidechain { outline: 1px dashed hsl(var(--cat-audiofx) / 0.7); outline-offset: 1px; }
```

### 7.6 Selection glow (per-category, 24px outer + 1.5px ring)
```css
.neu-glow-instrument { box-shadow: 0 0 0 1.5px hsl(var(--cat-instrument)), 0 0 24px 0 hsl(var(--cat-instrument) / 0.45), -3px -3px 10px rgba(255,255,255,0.06), 4px 4px 14px rgba(0,0,0,0.6); }
.neu-glow-midifx     { /* …same recipe, --cat-midifx     */ }
.neu-glow-audiofx    { /* …same recipe, --cat-audiofx    */ }
.neu-glow-modulator  { /* …same recipe, --cat-modulator  */ }
```

> **Micro-glow rule (CLAUDE.md):** active elements get a small outer glow of their semantic
> hue. The frozen forms: 4px @25% (`--shadow-glow-*`, subtle/idle-active) and 24px @45%
> (`.neu-glow-*`, selected). Pick the 4px form for "passing signal / live"; the 24px form for
> "selected". Do not introduce other glow radii/opacities.

### 7.7 Nested-chrome recipes (depth-driven — U2)
```css
.nested-canvas-frame { border: 2px solid hsl(var(--depth) / 0.45);
  box-shadow: inset 0 0 0 1px hsl(var(--depth) / 0.15), inset 0 60px 80px -40px hsl(var(--depth) / 0.18); }
.depth-ribbon { background: linear-gradient(180deg, hsl(var(--depth) / 0.85) 0%, hsl(var(--depth) / 0.25) 100%); }
.aperture-frame-container { box-shadow: inset 0 0 0 1px hsl(var(--frame-accent) / 0.55), inset 0 0 0 2px hsl(var(--frame-accent) / 0.12); }
.aperture-frame-portal { outline: 1.5px dashed hsl(var(--cat-audiofx) / 0.85); outline-offset: -3px; }
```

---

## 8. Motion vocabulary (frozen — pair with `webview/src/motion/index.ts`)

| Token | Value | Use for |
|-------|-------|---------|
| `--motion-press` | `100ms cubic-bezier(0.4,0,0.2,1)` | button press-in |
| `--motion-hover` | `200ms cubic-bezier(0.4,0,0.2,1)` | hover state swap |
| `--motion-modal` | `250ms cubic-bezier(0.32,0.72,0,1)` | modal/sheet enter |
| `--motion-page` | `150ms cubic-bezier(0.4,0,0.2,1)` | dive/navigate transitions |
| `--ease-out-expo` | `cubic-bezier(0.16,1,0.3,1)` | the house easing (`.t-precision`, cables, palette enter) |

`.t-precision { transition: all 200ms cubic-bezier(0.16,1,0.3,1); }` — the default
non-layout transition. Chassis hover/sculpt swaps transition `box-shadow` + `background`
ONLY (never size/footprint — Glen feedback 3 + 6: hover must not change a block's shape).

Reduced-motion: `@media (prefers-reduced-motion: reduce)` kills animations + Framer springs —
already in `index.css`, applies globally.

---

## 9. HSL ↔ HEX parity (verification)

The global HSL triplets round-trip to the locked `@theme` hexes (computed; ≤2 LSB rounding):

| Token | HSL | Round-trips to | Locked hex | Match |
|-------|-----|----------------|-----------|-------|
| cat/sig instrument/audio | `210 65% 57%` | `#4A91D9` | `#4A90D9` | ✓ |
| cat/sig midifx/midi | `180 65% 47%` | `#2AC6C6` | `#2BC4C4` | ✓ |
| cat/sig audiofx/value | `38 80% 56%` | `#E9A735` | `#E8A838` | ✓ |
| cat modulator | `266 64% 69%` | `#A97DE3` | `#A87FE0` | ✓ |
| foreground | `240 11% 91%` | `#E6E6EB` | `#E5E5EA` | ✓ |
| muted-foreground | `240 3% 56%` | `#8B8B92` | `#8E8E93` | ✓ |

Surface tones are intentionally NOT mirrored to HSL (the mockup's surface HSLs are darker than
Element's locked chassis; see §1).

---

## 10. What changed in W0 (the freeze) and what did NOT

**Added to `webview/src/index.css` `:root` (the only changes this wave):**
- Promoted `--cat-*`, `--sig-*`, `--status-*`, `--foreground`, `--muted-foreground` to the
  **global `:root`**. They previously existed only inside the `.nodeblock-v3` scope, so any
  Wave-1 component outside a block subtree (Breadcrumb, Cable, Inspector, QuickAdd, free-standing
  ports) would have had them resolve to nothing. Now globally resolvable. *Rationale: Principle 6
  coherence — the same accent must be reachable from every component, not just the Block.*
- Added `--sig-cv` as an alias of `--sig-value` (naming reconciliation: mockup/shadcn use
  `--sig-cv`, Element uses `--sig-value`; aliasing prevents a palette split).
- Added `--depth-0..4` (blue/teal/purple/amber/magenta). *These were entirely absent* and are a
  hard dependency of U2 Breadcrumb+Nav nested chrome (`.nested-canvas-frame` / `.depth-ribbon` /
  `.depth-banner`).

**Deliberately NOT changed:**
- No existing token value was altered. No surface hex moved. The `@theme` hex palette is
  untouched and remains canonical for Tailwind utilities.
- Mockup's darker surface HSLs were **rejected** in favour of Element's locked hexes (task rule:
  keep Element's locked values where they differ).
- The `.nodeblock-v3`-scoped re-declarations were left in place (identical values) so the
  verbatim mockup port stays drop-in; a comment now flags them as mirroring the global layer.
- No component was restyled. This wave freezes vocabulary only.

---

## 11. The contract (one line)

**All Wave-1 reskins reference the tokens in this spec / `index.css`; no ad-hoc shadow,
colour, or glow values. `index.css` is append-only per-component against this frozen set —
if a value you need is missing, amend this spec first, then build.**
