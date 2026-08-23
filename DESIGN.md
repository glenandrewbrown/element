---
name: Element UI
description: Precision creative instrument interface for professional modular audio routing.
colors:
  canvas-base: "#1E1E22"
  canvas-grid: "#2A2A2E"
  panel-bg: "#252529"
  panel-border: "#3A3A3E"
  surface: "#2C2C30"
  surface-elevated: "#333338"
  text-primary: "#E5E5EA"
  text-secondary: "#8E8E93"
  text-dim: "#5A5A5E"
  color-instrument: "#4A90D9"
  color-midifx: "#2BC4C4"
  color-audiofx: "#E8A838"
  color-modulator: "#A87FE0"
  signal-success: "#34D399"
  signal-error: "#EF4444"
  badge-vst3: "#4A90D9"
  badge-au: "#A855F7"
  badge-clap: "#2BC4C4"
  badge-lv2: "#6B7280"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "1.2"
    letterSpacing: "0.01em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "1.4"
    letterSpacing: "0.01em"
  mono:
    fontFamily: "Geist Mono, JetBrains Mono, monospace"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "1.4"
    letterSpacing: "normal"
rounded:
  block: "4px"
  panel: "6px"
  modal: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
---

# Design System: Element

## 1. Visual Theme & Atmosphere
Element is a **precision creative instrument** designed for expert users in flow state. The atmosphere is professional, dense, and high-precision — reminiscent of premium physical audio hardware. It avoids minimalist padding or hidden options, instead presenting technical complexity with pristine visual hierarchy.

## 2. Colors
- **Canvas Base** (`#1E1E22`) — Main canvas background.
- **Canvas Grid** (`#2A2A2E`) — Dot grid color (20px spacing).
- **Panel BG** (`#252529`) — Side panels, inspector, toolbars.
- **Panel Border** (`#3A3A3E`) — Subtle boundaries and separators.
- **Surface** (`#2C2C30`) — Card chassis, default blocks.
- **Surface Elevated** (`#333338`) — Active/hover states.

### Semantic Category Colors (Header / Border highlights)
- **Virtual Instruments** (`#4A90D9` / `--color-instrument`) — circle shape ●
- **MIDI Effects** (`#2BC4C4` / `--color-midifx`) — triangle shape ▲
- **Audio Effects** (`#E8A838` / `--color-audiofx`) — diamond shape ◆
- **Modulators & Utilities** (`#A87FE0` / `--color-modulator`) — hexagon shape ⬡

## 3. Typography
- **UI & Text:** `Inter` throughout. All numerical displays use tabular figures (`'tnum' 1`).
- **Sizes:** Block titles: 14px/600. Body: 13px/400. Values/Numbers: 13px/500 (Mono). Labels: 12px/500. Letter-spacing 0.01em body, 0.02em labels. Minimum readable size 12px.
- **Mono:** `Geist Mono` or `JetBrains Mono` for readouts, parameter values, code, and console logs.

## 4. Layout
- **Density:** High density. Keep layout margins and paddings tight (4px/8px grid) to maximize the visible workspace.
- **Canvas:** Node-based editor with dot grid background. Blocks and connections (cables) occupy the canvas workspace.
- **Panels:** Collapsible sidebars (Inspector on right, Tool Palette/Snippet Shelf on left) wrap the central canvas.

## 5. Elevation & Depth
- **Depth Paradigm:** Neumorphism. Shadows feel like they are extruded from or pressed into a single dark chassis. No glassmorphism, translucency, or wood/metal textures.
- **Raised Elements (Buttons, Blocks):**
  - Light shadow: `rgba(255,255,255,0.05)` top-left (8px blur)
  - Dark shadow: `rgba(0,0,0,0.4)` bottom-right (8px blur)
- **Pressed Elements (Inputs, Inset tracks):**
  - Inner dark shadow top-left, inner light catch bottom-right.
- **Floating Modals:** Standard drop shadow `0 8px 32px rgba(0,0,0,0.5)`.

## 6. Shapes
- **Corner Radii:** Soft but strict.
  - Blocks: 4px
  - Panels: 6px
  - Modals: 8px
- **Block Headers:** Use shapes as secondary visual markers for categories (● circle, ▲ triangle, ◆ diamond, ⬡ hexagon) for color-blind safety.

## 7. Components
- **Ports & Hitboxes:** Ports are rendered as 10-12px elements. Hovering triggers a glow (16-18px). The snap hitbox is 24px, and connection snap radius is 32px.
- **Active Glows:** Active elements receive a subtle micro-glow: 4px outer glow of semantic category hue at 25% opacity.
- **Tooltips:** Show immediately on hover (zero delay) to respect expert flow velocity.

## 8. Do's and Don'ts
- **DO:**
  - Surface technical variables and controls directly.
  - Respect spatial memory by keeping layouts consistent.
  - Use tabular figures for changing numbers to prevent visual jitter.
- **DON'T:**
  - Don't use light/dark mode toggling; Element is strictly unified dark.
  - Don't introduce glassmorphism or blur effects.
  - Don't use decorative textures (wood panels, fake screws, metal brushes).
