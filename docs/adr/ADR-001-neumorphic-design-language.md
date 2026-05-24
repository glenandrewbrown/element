# ADR-001: Neumorphic Design Language

**Status**: accepted
**Date**: 2026-05-24
**Deciders**: design
**Tags**: ui, design-system, v3

## Context

The V3.0 Instrument Paradigm overhaul required a single, opinionated visual language. Glassmorphism was the obvious 2024-era candidate but conflicts with the project goals: information density, mode-switching neutrality, and a "single continuous chassis" feel. Backdrop blur is also a measurable cost in a WebView running over a JUCE host with constant 60 Hz state syncs.

## Decision

Adopt **neumorphism** as the sole visual language. No glassmorphism, no backdrop-blur, no transparency layers. The entire UI is one continuous dark chassis with controls extruded from or pressed into the surface using paired soft shadows.

Surface tokens (narrow tonal range — critical for the "same material" illusion):

| Token | Hex |
|---|---|
| Canvas | `#1E1E22` |
| Panel | `#222226` |
| Surface | `#252529` |
| Elevated | `#2A2A2E` |
| Pressed | `#1A1A1E` |

Shadow rules:
- Raised: light TL `rgba(255,255,255,0.05)` + dark BR `rgba(0,0,0,0.4)`, 8 px blur min
- Pressed: inverted inner shadows. Buttons press INTO the surface on click.
- Active: 4 px outer micro-glow of semantic hue at 25% opacity.

## Consequences

### Positive
- Coherent "single instrument" feel across all panels and modes.
- No blur cost in the WebView render path.
- Tonal hierarchy survives at small sizes (knobs, ports, badges).

### Negative
- Tight tonal palette makes new components harder to design — every surface must respect the 5-step scale.
- Pure-black backgrounds and high-contrast OS themes are unsupported.

### Neutral
- Edit Mode and Perform Mode differ structurally, not by palette change (see ADR-007).

## Links
- `docs/ELEMENT_UNIFIED_BLUEPRINT.md`
- `docs/ELEMENT_V3_DESIGN_TOKENS_REFERENCE.md`
