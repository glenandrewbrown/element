---
name: neumorphism-generator
description: Generate neumorphic box-shadow / background CSS for Element's locked dark design system. Use when styling a raised/inset/concave/convex surface, building a Neu* primitive, or needing shadow values from a base colour. Reproduces the neumorphism.io algorithm.
---

# Neumorphism Generator

`webview/src/lib/neu.ts` — a validated reproduction of the neumorphism.io algorithm
(github.com/adamgiebl/neumorphism, BSD-3), adapted to Element's tokens. Tested: `webview/src/lib/__tests__/neu.test.ts` (7/7).

## Two APIs

**Canonical Element tokens (prefer for standard surfaces — alpha-based, keeps the "same material" illusion):**
```ts
import { ELEMENT_RAISED, ELEMENT_PRESSED, ELEMENT_GLOW } from "@/lib/neu";
<div style={ELEMENT_RAISED()} />              // raised chassis extrusion
<input style={ELEMENT_PRESSED()} />           // inset field / track
<button style={{ ...ELEMENT_RAISED(), ...ELEMENT_GLOW("#4A90D9") }} />  // active w/ semantic glow
```

**Dynamic generator (opaque-RGB, exact neumorphism.io output — for variations, concave/convex, semantic-hue surfaces):**
```ts
import { neu, neuStyle } from "@/lib/neu";
neu({ base: "#252529", distance: 8, intensity: 0.15 });
// → { boxShadow: "8px 8px 16px #1f1f23, -8px -8px 16px #2b2b2f", background: "#252529" }
neu({ base: "#252529", shape: "pressed" });   // inset
neu({ base: "#252529", shape: "convex" });    // adds linear-gradient background
<div style={neuStyle({ base: "#2A2A2E", distance: 6 })} />
```

Options: `{ base, distance=20, intensity=0.15, blur=distance*2, shape: 'flat'|'pressed'|'concave'|'convex', lightSource: 1|2|3|4 }`.

## Rules
- Light source is **top-left (1)** for the whole chassis — don't mix light sources on one board.
- Standard surfaces → use `ELEMENT_RAISED/PRESSED` (alpha tokens). Use `neu()` only when you need a derived/variant shadow or a semantic-hue base.
- Surface tokens: Canvas `#1E1E22` · Panel `#222226` · Surface `#252529` · Elevated `#2A2A2E` · Pressed `#1A1A1E`.
- NO glass / blur / transparency (other than the shadow alphas). Neumorphism only.

## Validate after use
`cd webview && npx vitest run --project unit src/lib/__tests__/neu.test.ts`
