<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# motion/ — framer-motion timing and easing tokens

Reusable motion vocabulary for Element's V3.0 micro-interactions. Components
reference these tokens rather than inlining milliseconds or easing strings, so
the motion language stays consistent. Pairs with CSS custom properties on `:root`
in `src/index.css` (`--motion-press`, `--motion-hover`, `--motion-modal`,
`--motion-page`).

## Key Files

| File | Description |
|------|-------------|
| `index.ts` | Exports easing curves (`EASE_STANDARD`, `EASE_DECELERATE`, `EASE_ACCELERATE`), duration constants (`DUR_PRESS`, `DUR_HOVER`, `DUR_MODAL`, `DUR_PAGE`), and composed framer-motion `Variants` objects for common transitions (press, hover, modal enter/exit, page transition, cable pulse). |

## For AI Agents

- Always import motion tokens from here — do not inline `duration` or `ease`
  values in component `motion.*` props.
- Motion must be purposeful and fast: press/hover ≤ 100 ms, modals ≤ 200 ms,
  page transitions ≤ 150 ms. Do not add gratuitous or slow animations.
- No glass / blur motion effects — only opacity, scale, and transform (no
  `backdropFilter` animate).
- Test command: `npx vitest run --dir src/motion`

## Dependencies

- Internal: `src/index.css` CSS custom properties (--motion-* vars)
- External: framer-motion 12
