# ADR-002: Three Signal Types — Audio, MIDI, Value

**Status**: accepted
**Date**: 2026-05-24
**Deciders**: design, engine
**Tags**: signal-routing, ports, accessibility

## Context

Most modular hosts surface two signal types: audio and MIDI. Element's modulation, automation, and macro-routing requirements collapse if CV/control data is forced through MIDI CC or audio-rate buses. Patches that mix LFOs, envelopes, and parameter automations across blocks became unreadable when every port looked the same.

## Decision

Standardise on **three** first-class signal types, each with both a colour and a shape indicator (colour-blind safe pairing):

| Type | Hex | Shape | Meaning |
|---|---|---|---|
| Audio (Generators) | `#4A90D9` | Circle (●) | Sample-rate audio buffers |
| MIDI (Logic) | `#2BC4C4` | Triangle (▲) | MIDI events |
| Value / CV (Modifiers) | `#E8A838` | Diamond (◆) | Control / modulation data, independent of MIDI |

Ports, cables, and badges all use the type's colour + shape. Mixed-type connections are blocked at the routing layer.

## Consequences

### Positive
- Modulation graphs become readable at a glance.
- Block category (Generator / Logic / Modifier) is implicitly tied to its dominant output type, simplifying inspector and palette grouping.
- Colour + shape pairing satisfies WCAG colour-blind accessibility without an alternate theme.

### Negative
- Plugin authors targeting Element must declare Value ports explicitly — there is no MIDI-CC fallback.
- Adds a third connection-type code path through routing, serialisation, and the WebView Cable component.

### Neutral
- Sample-rate Value buses (audio-rate CV) are still classified Value, not Audio — they ride the modulation graph.

## Links
- `docs/ELEMENT_UNIFIED_BLUEPRINT.md`
- ADR-001 (semantic colour palette)

**Related**: ADR-001
