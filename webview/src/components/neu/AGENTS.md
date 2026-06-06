<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# neu/ — neumorphic design-system primitives

The design-system layer for Element's V3.0 UI. All interactive controls and
display elements are built on these primitives so the neumorphic shadow language
stays consistent across the entire UI. The shadow recipe is computed by
`src/lib/neu.ts` (`neu()` helper) and expressed as CSS custom properties in
`src/index.css`. No glass, no backdrop-blur, no transparency anywhere.

## Shadow recipe

- **Raised**: `box-shadow: 4px 4px 8px rgba(0,0,0,0.4), -4px -4px 8px rgba(255,255,255,0.05)`
  (dark bottom-right + light top-left — extrudes from surface)
- **Pressed**: inner shadows inverted — element sinks INTO the surface on activation
- **Micro-glow**: 4px outer glow of semantic hue at 25% opacity on active/focused elements

Surface token palette (from `src/index.css`):

| Token | Hex | Usage |
|-------|-----|-------|
| Canvas | `#1E1E22` | Main background |
| Panel | `#222226` | Side panels, toolbars |
| Surface | `#252529` | Cards, Blocks |
| Elevated | `#2A2A2E` | Hover states |
| Pressed | `#1A1A1E` | Inset fields, tracks |

## Key Files

| File | Description |
|------|-------------|
| `NeuButton.tsx` | Raised/pressed tactile button — presses INTO surface on click |
| `NeuKnob.tsx` | Rotary control with neumorphic raised face; drag-to-set value |
| `NeuFader.tsx` | Linear fader (vertical or horizontal) |
| `NeuToggle.tsx` | Binary toggle (raised = off, pressed = on) |
| `NeuInput.tsx` | Inset text input field |
| `NeuDisplay.tsx` | Read-only value display (inset, lit text) |
| `NeuBadge.tsx` | Small status badge (category colour + shape) |
| `Icon.tsx` | Static allowlist wrapper around lucide-react — only import icons via `<Icon name="..." />`. Never import lucide icons directly (breaks chunk-splitting). |
| `iconForCategory.ts` | Maps block category → `{ color, shape, iconName }` using the 4-category taxonomy |
| `EmptyState.tsx` | Neumorphic empty-state placeholder panel |
| `Skeleton.tsx` | Loading skeleton with neu surface styling |
| `index.ts` | Barrel export for all primitives |

## For AI Agents

- Always use `neu()` from `src/lib/neu.ts` or the CSS utilities in `src/index.css`
  for shadow values — never hand-roll box-shadow strings.
- `iconForCategory.ts` maps: Virtual Instruments → blue ●, MIDI Effects → teal ▲,
  Audio Effects → orange ◆, Modulators/Utilities → purple ⬡.
  Category colours are SEPARATE from signal-type cable colours.
- Never import lucide-react directly — use `<Icon name="..." />` only.
- Test command: `npx vitest run --dir src/components/neu`
- All primitives have stories (`*.stories.tsx`) — run `npm run storybook` to
  review visual states; run `npm run verify-stories` to gate mount-time health.

## Dependencies

- Internal: `src/lib/neu.ts`, `src/index.css` tokens
- External: React 19, lucide-react (via Icon allowlist only)
