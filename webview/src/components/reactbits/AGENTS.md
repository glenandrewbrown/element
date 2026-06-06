<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# reactbits/ — third-party-derived animated components

Thin directory holding animated UI bits derived from the React Bits library,
reskinned to Element's neumorphic dark chassis. Currently contains a single
component. Add here only when importing a motion/animation pattern that does
not belong in `neu/` (i.e. text or decorative motion, not interactive controls).

## Key Files

| File | Description |
|------|-------------|
| `BlurText.tsx` | Animated text reveal with blur-in entrance (framer-motion). Used for headings and labels that benefit from a soft entrance transition. |
| `BlurText.stories.tsx` | Storybook story for visual review |

## For AI Agents

- Components here are motion/polish only — they must not carry data-fetching or
  store subscriptions.
- Shadow/colour values must conform to the neumorphic token palette in
  `src/index.css` — no glass, no backdrop-blur.
- Test command: `npx vitest run --dir src/components/reactbits`
- Story render-gate: `npm run verify-stories`

## Dependencies

- Internal: `src/index.css` tokens, `src/motion/index.ts` timing tokens
- External: React 19, framer-motion 12
