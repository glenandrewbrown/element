# Element Design System — Token Reference

> **Source of truth for webview CSS design tokens.**
> All tokens live in `webview/src/index.css` — the `@theme {}` block for Tailwind v4 + `:root {}` for shadow/motion primitives.
> Surface shadows are generated via the **neumorphism-generator** skill (`neu()` / `ELEMENT_RAISED/PRESSED`).
> Color tokens are locked — see the taxonomy section below. Do not add free-form colours.

---

## Neumorphic Surface Tones

Narrow tonal range — critical for the "same material" illusion.

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-canvas` | `#1E1E22` | Main background |
| `--color-panel` | `#222226` | Side panels, toolbars |
| `--color-surface` | `#252529` | Cards, blocks |
| `--color-elevated` | `#2A2A2E` | Hover states |
| `--color-pressed` | `#1A1A1E` | Inset fields, tracks |
| `--color-panel-border` | `#3A3A3E` | Dividers, borders |
| `--color-surface-elevated` | `#333338` | Elevated card chrome |

Shadow primitives (`:root`):
- **Raised** — `--shadow-raised`: light top-left + dark bottom-right, 8px+ blur.
- **Pressed** — `--shadow-pressed`: inverted inset. Controls press INTO the surface.
- **Micro-glow** — `--shadow-glow-{audio|midi|cv|modulator}`: 4px outer glow at 25% opacity on active elements.

---

## Block Category Tokens (🔒 locked — 4-cat taxonomy, D1)

| Token | Hex | Shape | Category |
|-------|-----|-------|----------|
| `--color-instrument` | `#4A90D9` | ● Circle | Virtual Instruments |
| `--color-audiofx` | `#E8A838` | ◆ Diamond | Audio Effects |
| `--color-midifx` | `#2BC4C4` | ▲ Triangle | MIDI Effects |
| `--color-modulator` | `#A87FE0` | ⬡ Hexagon | Modulators / Utilities |

---

## Signal Tokens (cables, signal pills)

| Token | Hex | Signal |
|-------|-----|--------|
| `--color-audio` | `#4A90D9` | Audio |
| `--color-midi` | `#2BC4C4` | MIDI |
| `--color-value` | `#E8A838` | Value / CV |

---

## Accent Tokens (generic UI chrome)

| Token | Hex |
|-------|-----|
| `--color-accent-blue` | `#4A90D9` |
| `--color-accent-orange` | `#E8A838` |
| `--color-accent-teal` | `#2BC4C4` |
| `--color-accent-purple` | `#A87FE0` |

---

## Density / Sizing Token Ramp (G-14)

> Added Wave F / Task F1. Base unit: **4px**.
> Dense audio-instrument UI — readability over comfort. Information density IS the beauty.

### Spacing Scale

| Token | Value | Use |
|-------|-------|-----|
| `--space-1` | `4px` | Icon gutter, micro-gap |
| `--space-2` | `8px` | Row padding, tight stacks |
| `--space-3` | `12px` | Section gap, list row height padding |
| `--space-4` | `16px` | Card padding, standard gap |
| `--space-5` | `20px` | Panel section gap |
| `--space-6` | `24px` | Large component spacing |
| `--space-7` | `32px` | Panel-to-panel gap, modal padding |
| `--space-8` | `48px` | Hero / empty-state breathing room |

### Text Sizes

| Token | Value | Use |
|-------|-------|-----|
| `--text-xs` | `10px` | Port labels, tiny badges, captions |
| `--text-sm` | `11px` | Secondary params, stat readouts |
| `--text-md` | `12px` | Body default, param names |
| `--text-lg` | `14px` | Panel headings, block names |

> **Note:** These sizes are intentionally compact for a dense plugin chassis. Use `--text-lg` for the largest structural headings inside panels; never exceed `14px` for panel chrome.

### Control Heights

| Token | Value | Use |
|-------|-------|-----|
| `--control-h-sm` | `20px` | Inline labels, pill toggles, knob rings |
| `--control-h-md` | `28px` | Standard buttons, text inputs, tabs |
| `--control-h-lg` | `36px` | Toolbar primaries, large action buttons |

### Panel Padding (inner gutter)

| Token | Value | Use |
|-------|-------|-----|
| `--panel-padding-xs` | `4px` | Header strips, toolbar chrome |
| `--panel-padding-sm` | `8px` | Compact side panels, list rows |
| `--panel-padding-md` | `12px` | Standard inspector / browser panels |
| `--panel-padding-lg` | `16px` | Detail views, settings sections |

---

## Text Colours

| Token | Hex | Use |
|-------|-----|-----|
| `--color-text-primary` | `#E5E5EA` | Primary body text |
| `--color-text-secondary` | `#8E8E93` | Muted labels, secondary info |
| `--color-text-dim` | `#5A5A5E` | Disabled / very subtle |

---

## Motion

All motion tokens are in `:root`. See `webview/src/motion/index.ts` for the TypeScript mirror.

| Token | Value | Use |
|-------|-------|-----|
| `--motion-press` | `100ms ease` | Button/control press feedback |
| `--motion-hover` | `200ms ease` | Hover state transitions |
| `--motion-modal` | `250ms ease` | Dialog / popover appear |
| `--motion-page` | `150ms ease` | Panel/mode transitions |
| `--ease-out-expo` | `cubic-bezier(0.16,1,0.3,1)` | Springy exits |

---

## Governance Rules

1. **Neumorphism only** — no glassmorphism, no `backdrop-blur`, no decorative transparency.
2. **Shadows via skill** — always use `neu()` / `ELEMENT_RAISED/PRESSED` from `@/lib/neu`. Never hand-author shadow tuples.
3. **No free colours** — all colours must be a named token. Never raw hex in component code.
4. **Category tokens ≠ signal tokens** — `--color-instrument` (block UI) ≠ `--color-audio` (cable/signal). Use the right axis.
5. **Density tokens are READ-ONLY after Wave F** — downstream tasks consume them, they do not re-define them. Additions require orchestrator approval.
6. **No `using namespace juce;` in headers** — applies to C++ side; `juce::` prefix required.
