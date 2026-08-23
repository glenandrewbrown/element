# Element V3.0 Design Tokens Reference
## For JUCE LookAndFeel Porting

**Source**: `webview/src/` (React 19 + Tailwind 4 + Lucide React)  
**Generated**: 2026-05-08  
**Branch**: local-enhancements  
**Purpose**: Extract all V3 design tokens for `LookAndFeel_Element_V3` JUCE subclass

---

## 1. COLOR PALETTE

### Surface Tones (Neumorphic Base)
| Token | Hex | Usage | JUCE ColourId |
|-------|-----|-------|---------------|
| `canvas` | `#1e1e22` | App background | `defaultBackground` |
| `panel` | `#222226` | Panel background | `panelBackground` |
| `surface` | `#252529` | Button/control base | `buttonBackground` |
| `elevated` | `#2a2a2e` | Hover/raised state | `buttonHoverBackground` |
| `pressed` | `#1a1a1e` | Pressed/inset state | `buttonPressedBackground` |
| `panel-border` | `#3a3a3e` | Dividers, borders | `outlineColour` |
| `surface-elevated` | `#333338` | Secondary elevated | (custom) |

### Semantic Block Colours (Tonal Accents)
| Token | Hex | Meaning | JUCE ColourId |
|-------|-----|---------|---------------|
| `generator` (blue) | `#4a90d9` | Audio/signal source | (custom) |
| `modifier` (orange) | `#e8a838` | Effect/processor | (custom) |
| `logic` (teal) | `#2bc4c4` | Logic/control flow | (custom) |

### Format Badges
| Token | Hex | Format |
|-------|-----|--------|
| `badge-vst3` | `#4a90d9` | VST3 |
| `badge-au` | `#a855f7` | AU |
| `badge-clap` | `#2bc4c4` | CLAP |
| `badge-lv2` | `#6b7280` | LV2 |

### Signal & Feedback
| Token | Hex | Meaning |
|-------|-----|---------|
| `signal-primary` | `#4a90d9` | Primary signal |
| `success` | `#34d399` | Success state |
| `warning` | `#e8a838` | Warning state |
| `error` | `#ef4444` | Error/panic state |

### Text
| Token | Hex | Usage |
|-------|-----|-------|
| `text-primary` | `#e5e5ea` | Main text |
| `text-secondary` | `#8e8e93` | Secondary/muted |
| `text-dim` | `#5a5a5e` | Placeholder/disabled |

---

## 2. TYPOGRAPHY

### Font Family
```
Font: Inter (system-ui, -apple-system fallback)
CSS: --font-sans: "Inter", system-ui, -apple-system, sans-serif
```

### Font Weights (Used)
| Weight | Usage | JUCE Equivalent |
|--------|-------|-----------------|
| 400 (regular) | Body text | `Font::plain` |
| 500 (medium) | Subtle emphasis | (custom) |
| 600 (semibold) | Secondary labels | (custom) |
| 700 (bold) | Button labels, headers | `Font::bold` |

### Font Sizes (Tailwind + Custom)
| Token | Pixel | Usage | JUCE Equivalent |
|-------|-------|-------|-----------------|
| `text-[10px]` | 10px | Badge, small label | `Font(10)` |
| `text-[11px]` | 11px | Button, input | `Font(11)` |
| `text-[12px]` | 12px | Body text | `Font(12)` |
| `text-[13px]` | 13px | Secondary | `Font(13)` |
| `text-[14px]` | 14px | Heading | `Font(14)` |
| `text-[16px]` | 16px | Large heading | `Font(16)` |

### Line Heights
| Token | Value | Usage |
|-------|-------|-------|
| `leading-none` | 1 | Compact labels |
| (default) | 1.5 | Body text |

### Letter Spacing
| Token | Value | Usage |
|-------|-------|-------|
| `tracking-tight` | -0.5% | (rare) |
| `tracking-wide` | 0.5% | Button labels |
| `tracking-wider` | 0.75% | Badge text |
| `tracking-widest` | 1% | (rare) |

---

## 3. SPACING SCALE

### Tailwind Defaults (Used in Neu Components)
| Token | Pixels | Usage Frequency |
|-------|--------|-----------------|
| `p-0` / `px-0` / `py-0` | 0 | Rare |
| `p-1` / `px-1` / `py-1` | 4px | Badge padding |
| `p-1.5` / `px-1.5` / `py-1.5` | 6px | Input padding |
| `p-2` / `px-2` / `py-2` | 8px | Button padding |
| `p-3` / `px-3` / `py-3` | 12px | Button padding (md) |
| `p-4` | 16px | Panel padding |
| `gap-1` | 4px | Icon + text spacing |
| `gap-2` | 8px | Common gap |
| `gap-3` | 12px | Larger gap |
| `gap-4` | 16px | Section gap |

### Button Padding (Specific)
```
sm: py-1.5 px-2.5  (6px vertical, 10px horizontal)
md: py-2 px-3      (8px vertical, 12px horizontal)
```

---

## 4. SHADOW / ELEVATION (Neumorphic)

### Core Shadow Definitions
All shadows use **light top-left + dark bottom-right** rule for raised effect.

#### Raised (Default Button State)
```css
/* Tailwind class */
shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)]

/* Breakdown */
Light: -2px -2px 8px rgba(255, 255, 255, 0.04)  /* top-left white */
Dark:   2px  2px  8px rgba(0, 0, 0, 0.35)       /* bottom-right black */
```

#### Pressed / Inset (Active Button State)
```css
/* Tailwind class */
shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]

/* Breakdown */
Dark inset:   inset  2px  2px  6px rgba(0, 0, 0, 0.4)
Light inset:  inset -1px -1px  4px rgba(255, 255, 255, 0.05)
```

#### Glow Effects (Semantic Accent)
| Color | Shadow | Hex |
|-------|--------|-----|
| Audio (blue) | `shadow-[0_0_4px_rgba(74,144,217,0.6)]` | `#4a90d9` |
| Modifier (orange) | `shadow-[0_0_4px_rgba(232,168,56,0.6)]` | `#e8a838` |
| Logic (teal) | `shadow-[0_0_4px_rgba(43,196,196,0.6)]` | `#2bc4c4` |

#### CSS Custom Properties (`:root`)
```css
--shadow-raised: -2px -2px 6px rgba(255, 255, 255, 0.04),
                  3px 3px 8px rgba(0, 0, 0, 0.4);

--shadow-pressed: inset -2px -2px 4px rgba(255, 255, 255, 0.04),
                  inset 3px 3px 6px rgba(0, 0, 0, 0.45);

--shadow-glow-audio: 0 0 4px rgba(74, 144, 217, 0.25);
--shadow-glow-midi:  0 0 4px rgba(43, 196, 196, 0.25);
--shadow-glow-cv:    0 0 4px rgba(232, 168, 56, 0.25);
```

### Component-Specific Shadows

#### NeuButton
- **Raised**: `shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)]`
- **Pressed**: `shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]`
- **Active (logic)**: Add `shadow-[0_0_8px_rgba(43,196,196,0.2)]` overlay
- **Panic (error)**: Add `shadow-[0_0_12px_rgba(239,68,68,0.15)]` overlay

#### NeuInput
- **Inset**: `shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]`
- **Focus ring**: `focus:ring-1 focus:ring-generator/30` (blue tint)

#### NeuDisplay
- **Inset**: `.neu-inset` class (same as input)

#### NeuKnob
- **Indicator dot glow**: `shadow-[0_0_4px_rgba(43,196,196,0.8)]` (teal, 0.8 opacity)
- **Track glow**: `shadow-[0_0_4px_rgba(74,144,217,0.6)]` (blue, 0.6 opacity)

#### NeuFader
- **Track**: `.neu-inset` (pressed state)
- **Thumb**: `shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)]` (raised)

#### NeuToggle
- **Inactive**: `.neu-inset` (pressed state)
- **Active**: `${track} ${glow}` (color-specific glow)

---

## 5. BORDER RADIUS

### Tailwind Defaults (Used)
| Token | Pixels | Usage |
|-------|--------|-------|
| `rounded-sm` | 2px | Input, small controls |
| `rounded-md` | 6px | (rare) |
| `rounded-full` | 9999px | Knob, toggle pill, indicator dots |

**JUCE Equivalent**: Use `Graphics::drawRoundedRectangle()` with radius parameter.

---

## 6. ICON CATALOG

### Top 20 Icons by Frequency (Lucide React)
| Rank | Icon | Count | Usage |
|------|------|-------|-------|
| 1 | `X` | 4 | Close button |
| 2 | `Settings` | 4 | Settings panel |
| 3 | `Plus` | 3 | Add/create |
| 4 | `LayoutGrid` | 3 | Grid view toggle |
| 5 | `AudioWaveform` | 3 | Audio signal |
| 6 | `Trash2` | 2 | Delete |
| 7 | `Search` | 2 | Search input |
| 8 | `Puzzle` | 2 | Plugin/snippet |
| 9 | `Power` | 2 | Power toggle |
| 10 | `Pencil` | 2 | Edit |
| 11 | `Clock` | 2 | Time/tempo |
| 12 | `Volume2` | 1 | Volume control |
| 13 | `Undo2` | 1 | Undo |
| 14 | `Square` | 1 | Record |
| 15 | `SkipBack` | 1 | Previous |
| 16 | `Redo2` | 1 | Redo |
| 17 | `Play` | 1 | Play |
| 18 | `Network` | 1 | Connections |
| 19 | `Music` | 1 | Music/instrument |
| 20 | `MoreVertical` | 1 | Menu |

### Icon Rendering Details
- **Source**: Lucide React (1.14.0)
- **Grid**: 24×24
- **Stroke**: 1.5px
- **Tone**: Monochrome (inherits text color)
- **Semantic Tones** (from `Icon.tsx`):
  - `audio`: `#4a90d9` (blue)
  - `midi`: `#2bc4c4` (teal)
  - `cv`: `#e8a838` (orange)
  - `primary`: `#e5e5ea` (text-primary)
  - `secondary`: `#8e8e93` (text-secondary)

**JUCE Porting**: Use SVG paths from Lucide or hand-draw equivalent glyphs in `Graphics::drawPath()`.

---

## 7. COMPONENT DESIGN RULES

### NeuButton
- **Base**: `bg-surface` + `border-white/5` (subtle border)
- **Raised state**: `shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)]`
- **Pressed state**: `active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]` + `translate-y-px`
- **Variants**:
  - `default`: text-primary
  - `active`: text-logic + glow-teal indicator dot
  - `panic`: text-error + glow-red indicator dot
- **Sizes**:
  - `sm`: `py-1.5 px-2.5 text-[10px] gap-1.5`
  - `md`: `py-2 px-3 text-[11px] gap-2`
- **Typography**: `font-bold uppercase tracking-wider`
- **Motion**: `transition-all duration-100`

### NeuInput
- **Base**: `bg-pressed` + `border-none` + `rounded`
- **Inset shadow**: `shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4),inset_-1px_-1px_4px_rgba(255,255,255,0.05)]`
- **Focus**: `focus:ring-1 focus:ring-generator/30` (blue tint)
- **Text**: `text-[11px] text-text-primary`
- **Placeholder**: `placeholder-text-dim`
- **Motion**: `transition-shadow duration-100`

### NeuDisplay
- **Base**: `bg-pressed` + `rounded` + `overflow-hidden`
- **Inset shadow**: `.neu-inset` (same as input)
- **Typography**: `tabular-nums` (monospace digits)

### NeuKnob
- **Sizes**:
  - `sm`: outer 48px, inner 32px, inset 8px, indicator 4×10px
  - `md`: outer 64px, inner 48px, inset 8px, indicator 4×12px
  - `lg`: outer 80px, inner 56px, inset 12px, indicator 4×14px
- **Colors**: blue (`#4a90d9`), orange (`#e8a838`), teal (`#2bc4c4`)
- **Indicator**: Vertical bar at top, rotates with value
- **Glow**: `shadow-[0_0_4px_rgba(...,0.6)]` (color-specific)
- **Interaction**: Vertical drag (0–100), shift for fine control (0.2× sensitivity)
- **Arc**: 270° sweep (-135° to +135°)

### NeuFader
- **Orientation**: Vertical or horizontal
- **Track**: `bg-pressed` + `.neu-inset` + `rounded-sm`
- **Fill**: Solid color bar (blue/orange/teal)
- **Thumb**: Raised shadow + border
- **Peak hold**: Thin line (optional)
- **Interaction**: Pointer drag, smooth value update

### NeuToggle
- **Base**: `w-6 h-3` (pill shape) + `rounded-full`
- **Inactive**: `bg-pressed` + `.neu-inset`
- **Active**: `${track}` (color-specific) + `${glow}` (shadow)
- **Pill**: `w-2 h-2` white dot, slides left/right
- **Motion**: `transition-all duration-150`
- **Colors**: blue, orange, teal

### NeuBadge
- **Base**: `inline-flex items-center` + `rounded-sm`
- **Padding**: `px-1.5 py-0.5`
- **Text**: `text-[10px] font-bold uppercase tracking-wide`
- **Border**: `border` + color-specific (blue/orange/teal/purple/grey)
- **Background**: `bg-pressed` + `.neu-raised`

---

## 8. MOTION TOKENS

### Easing Curves
| Token | Cubic Bezier | Usage |
|-------|--------------|-------|
| `EASE_STANDARD` | `(0.4, 0, 0.2, 1)` | Most UI motion |
| `EASE_MODAL` | `(0.32, 0.72, 0, 1)` | Modal/overlay entry |
| `EASE_OUT_EXPO` | `(0.16, 1, 0.3, 1)` | Tailwind --ease-out-expo |

### Durations (ms)
| Token | Duration | Usage |
|-------|----------|-------|
| `DURATION_PRESS` | 100ms | Tap/click response |
| `DURATION_HOVER` | 200ms | Hover/focus reveal |
| `DURATION_MODAL` | 250ms | Modal entry |
| `DURATION_PAGE` | 150ms | Page transition |

### Composite Transitions (CSS-ready)
```css
--motion-press: 100ms cubic-bezier(0.4, 0, 0.2, 1);
--motion-hover: 200ms cubic-bezier(0.4, 0, 0.2, 1);
--motion-modal: 250ms cubic-bezier(0.32, 0.72, 0, 1);
--motion-page:  150ms cubic-bezier(0.4, 0, 0.2, 1);
```

**JUCE Porting**: Use `juce::AnimatedPosition` or `juce::ComponentAnimator` with equivalent timing.

---

## 9. PORT DIFFICULTY RANKING

### Easy (1–2 hours)
- [x] Color palette → JUCE `ColourIds` + `LookAndFeel::setColour()`
- [x] Font family (Inter) + sizes (10–16px)
- [x] Font weights (regular, bold)
- [x] Spacing scale (4px, 8px, 12px, 16px)
- [x] Border radius (2px, 9999px)

**Implementation**: Create `enum class ElementColourIds` and override `LookAndFeel::getDefaultColour()`.

### Medium (4–8 hours)
- [x] Button drawing (raised + pressed shadows)
- [x] Input field drawing (inset shadow + focus ring)
- [x] Toggle drawing (pill shape + dot)
- [x] Badge drawing (border + background)
- [x] Icon rendering (SVG paths or glyph substitutes)

**Implementation**: Override `LookAndFeel::drawButtonBackground()`, `drawTextEditorBorder()`, etc.

### Hard (1–2 days)
- [x] Neumorphic shadow painting (dual-layer light/dark)
- [x] Knob drawing (circular arc + indicator)
- [x] Fader drawing (track + thumb + fill)
- [x] Glow effects (drop-shadow equivalent)

**Implementation**: Custom `Graphics::drawDropShadow()` calls, `Path` arcs, `DropShadowEffect`.

### Don't Port (Web-only)
- [ ] Framer Motion animations (use JUCE `ComponentAnimator` instead)
- [ ] Tailwind CSS itself (use JUCE `LookAndFeel` overrides)
- [ ] React Flow canvas (use JUCE graph editor)
- [ ] Lucide React tree-shaking (hand-draw or use JUCE icon set)

---

## 10. IMPLEMENTATION CHECKLIST

### Phase 1: Foundation (Easy)
- [ ] Create `include/element/ui/lookandfeel_v3.hpp`
- [ ] Define `enum class ElementColourIds` with all 20+ colors
- [ ] Override `LookAndFeel::getDefaultColour()` to return hex values
- [ ] Set font family to Inter (or system fallback)
- [ ] Define font size constants (10–16px)

### Phase 2: Controls (Medium)
- [ ] Override `drawButtonBackground()` for raised/pressed states
- [ ] Override `drawTextEditorBorder()` for input inset shadow
- [ ] Override `drawToggleButton()` for pill + dot
- [ ] Override `drawLabel()` for badge styling
- [ ] Create icon rendering helper (SVG or glyph)

### Phase 3: Advanced (Hard)
- [ ] Implement neumorphic shadow helper (dual-layer paint)
- [ ] Override `drawRotarySlider()` for knob (arc + indicator)
- [ ] Override `drawLinearSlider()` for fader (track + thumb)
- [ ] Add glow effect helper (drop-shadow equivalent)
- [ ] Test on macOS, Windows, Linux

### Phase 4: Polish (Optional)
- [ ] Motion timing (use `ComponentAnimator` for press/hover)
- [ ] Focus ring styling (blue tint on input)
- [ ] Hover state transitions
- [ ] Accessibility (high-contrast mode, screen reader labels)

---

## 11. QUICK REFERENCE: HEX VALUES

```cpp
// Surface Tones
constexpr uint32_t ColourCanvas    = 0xFF1e1e22;
constexpr uint32_t ColourPanel     = 0xFF222226;
constexpr uint32_t ColourSurface   = 0xFF252529;
constexpr uint32_t ColourElevated  = 0xFF2a2a2e;
constexpr uint32_t ColourPressed   = 0xFF1a1a1e;

// Semantic Accents
constexpr uint32_t ColourGenerator = 0xFF4a90d9;  // blue
constexpr uint32_t ColourModifier  = 0xFFe8a838;  // orange
constexpr uint32_t ColourLogic     = 0xFF2bc4c4;  // teal

// Text
constexpr uint32_t ColourTextPrimary   = 0xFFe5e5ea;
constexpr uint32_t ColourTextSecondary = 0xFF8e8e93;
constexpr uint32_t ColourTextDim       = 0xFF5a5a5e;

// Feedback
constexpr uint32_t ColourSuccess = 0xFF34d399;
constexpr uint32_t ColourWarning = 0xFFe8a838;
constexpr uint32_t ColourError   = 0xFFef4444;
```

---

## 12. REFERENCES

- **Webview source**: `/Volumes/Projects/Development_Projects/Github_Repos/element/webview/src/`
- **Tailwind config**: Inline in `index.css` via `@theme` block
- **Motion tokens**: `webview/src/motion/index.ts`
- **Component library**: `webview/src/components/neu/*.tsx`
- **Icon registry**: `webview/src/components/neu/Icon.tsx` (Lucide React allowlist)
- **Design spec**: `docs/ELEMENT_UNIFIED_BLUEPRINT.md` (V3.0 Instrument Paradigm)

---

**End of Reference Document**
