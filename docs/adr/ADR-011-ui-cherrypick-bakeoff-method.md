# ADR-011: V3 UI build method — cherry-pick bake-off across Element + mindful-studio

- **Status:** accepted (2026-05-30)
- **Supersedes:** the Stitch-first-only method implied by `.omo/plans/archive/pass2-stitch-redesign.md`
  (Stitch is retained, but repurposed — see Decision).

## Context

A complete React UI mockup of Element V3 exists in a sibling repo (`mindful-studio`, Lovable-built).
It realises the approved Instrument-V3 design in working React but is a pure visual mockup: no JUCE
bridge, no stores, no real audio, and a god-component architecture. Element's own webview has the
opposite profile: weak current visuals (the Pass-1 redesign was denied + reverted) but a real,
wired architecture (11 Zustand stores, ~70 JUCE bridge calls, React Flow canvas). Some current
Element components are genuinely better than the mockup's; some of the mockup's are better than
Element's; and a few surfaces are weak in both.

## Decision

Build the V3 UI by a **component-by-component bake-off**, not a wholesale port:

1. Take the **fundamental UI/UX design (layout, IA, interaction model, visual language) from the
   mockup** as the foundation.
2. For each component, **keep whichever of {Element-current, mockup} is better** on design/UX.
3. Where **both are inadequate, build a brand-new component** using the mandatory design tools
   (Stitch + ui-ux-pro-max + uiverse + image-gen). **Stitch is NOT retired** — it becomes the
   generator for the build-new path and the design-reference source per Storybook story.
4. **Every winner re-houses on Element's real architecture** (Zustand + JUCE bridge + React Flow).
   Architecture is held constant; the mockup never supplies architecture, and its debt (god-component,
   duplicate knobs, name-based nesting) is not inherited — copy only pure logic.

The bake-off is run through Storybook: Element's Storybook (:6006) as the hub, the mockup's
Storybook composed as a ref (:6007), scored on paradigm-fit / a11y / interaction / density /
feature-value (architecture excluded from scoring).

## Consequences

- Maximises reuse of *both* codebases' best work; avoids re-designing in Stitch what the mockup
  already realised, and avoids throwing away Element's wired components.
- Hard to reverse once components are re-housed, hence this record.
- Requires a cross-repo Storybook comparison rig and a per-component verdict matrix
  (`.omo/bakeoff/COMPONENT-BAKEOFF.md`).
- The C++ stabilise lane (CF1 fix) runs in parallel and remains a hard ship gate.
