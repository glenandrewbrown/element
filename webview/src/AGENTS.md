<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# src/ — webview source root

All React/TypeScript source for the Element webview frontend. Entry point is `main.tsx`
(createRoot + StrictMode). `App.tsx` composes the root tree via `AppShell`. `index.css`
carries every design token (surface palette, neumorphic shadow utilities, motion CSS
vars) plus a mandatory comment block explaining why `will-change: transform` was removed
from `.react-flow__viewport`. `events.ts` is a lightweight cross-store event bus.

## Key Files

| File | Description |
|------|-------------|
| `main.tsx` | `createRoot` entry — StrictMode wrapper, mounts `<App />` |
| `App.tsx` | Root composition — renders `<AppShell />` |
| `App.css` | Minimal app-level overrides (prefer `index.css` tokens) |
| `index.css` | Tailwind 4 + design token CSS vars + neumorphic shadow utilities + will-change comment block |
| `events.ts` | Tiny cross-store event bus (import named exports; do not use raw `window.dispatchEvent`) |

## Subdirectories

| Directory | AGENTS.md | Role |
|-----------|-----------|------|
| `components/` | [components/AGENTS.md](components/AGENTS.md) | All UI components: canvas, layout, neu, reactbits |
| `stores/` | [stores/AGENTS.md](stores/AGENTS.md) | Zustand 5 stores |
| `hooks/` | [hooks/AGENTS.md](hooks/AGENTS.md) | useKeyboard, useJuceBridge, useBlockNodeLevelBallistic, useNodeSpectrum |
| `bridge/` | [bridge/AGENTS.md](bridge/AGENTS.md) | window.__JUCE__ typed wrappers |
| `data/` | [data/AGENTS.md](data/AGENTS.md) | Types + Storybook/dev demo data |
| `lib/` | [lib/AGENTS.md](lib/AGENTS.md) | autoLayout, neu() shadow helper |
| `motion/` | [motion/AGENTS.md](motion/AGENTS.md) | Framer-motion timing/easing tokens |
| `test/` | [test/AGENTS.md](test/AGENTS.md) | Vitest setup + fixtures |
| `assets/` | (skip) | Static SVG/PNG — no logic |

## For AI Agents

- **NOTHING-fake**: `src/data/demoGraph.ts` and `src/data/demoPerformData.ts` are
  Storybook/dev fixtures. Never import them from a live component path.
- **index.css will-change comment is load-bearing documentation** — read it before
  touching GraphCanvas compositing. Do NOT restore `will-change: transform` statically.
- Run `npx tsc -b` from `webview/` to type-check the whole tree before committing.
- Run `npx vitest run` from `webview/` for unit tests.
- Run `npm run verify-stories` for the headless Storybook render-gate.

## Dependencies

- React 19, Vite 8, Tailwind 4, Zustand 5, @xyflow/react 12, framer-motion 12
- Vitest 4 + @testing-library/react + Playwright 1.59
