<!-- Parent: ../AGENTS.md -->
<!-- Updated: 2026-06-06 -->

# webview/ — React 19 frontend (V3.0 canonical UI)

Standalone TypeScript project bundled by Vite, packaged into the C++ binary at CMake configure time. Loaded by `WebContent` via `juce::WebBrowserComponent`. See [`docs/ELEMENT_UNIFIED_BLUEPRINT.md`](../docs/ELEMENT_UNIFIED_BLUEPRINT.md) for visual paradigm (Neumorphism — **NOT** glass).

## Stack

- **React** 19.2.4 + ReactDOM 19.2.4 (client `createRoot`, `StrictMode`)
- **Vite** 8.0.1 + `@vitejs/plugin-react`
- **TypeScript** 5.9.3 (strict, ES2023, JSX)
- **Tailwind** 4.2.2 via `@tailwindcss/vite`
- **State**: Zustand 5 (`stores/`)
- **Graph**: `@xyflow/react` 12.10.2 (React Flow v12) — chunk-split out via `vite.config.ts`
- **Animation**: `framer-motion` 12 (chunk-split as `motion`)
- **Tests**: Vitest 4 + Testing Library + Playwright 1.59

## Source layout

```
webview/src/
├── main.tsx          # createRoot entry (StrictMode wrapper)
├── App.tsx           # Root composition
├── index.css         # Tailwind + design tokens + neumorphic utilities
├── events.ts         # Cross-store event bus
├── data/             # Demo graph + perform data, types
├── stores/           # Zustand: useAppStore, useGraphStore, usePerformStore
├── hooks/            # useKeyboard (global shortcuts)
├── motion/           # Reusable motion variants
├── bridge/           # C++ ↔ JS native bridge
│   ├── juceBackend.ts     # window.__JUCE__.backend.invokeNativeFunction wrapper
│   └── nativeApp.ts       # Typed function bindings (elementApp*, elementSession*, ...)
├── components/
│   ├── neu/          # Neumorphic primitives: NeuButton, NeuKnob, NeuFader, NeuMeter, …
│   ├── layout/       # AppShell, Toolbar, ToolPalette, InspectorHub
│   └── canvas/       # GraphCanvas, Block, Cable, QuickAddPopup, CommandPalette
├── assets/           # Static SVG/PNG
└── test/             # Vitest setup
```

## Bridge protocol

```ts
import { invokeNativeFunction } from "./bridge/juceBackend";
const about = await invokeNativeFunction("elementAppGetAbout");
```

- All native functions are prefixed `element*` (registered C++-side in [`../src/ui/element_webview_host.cpp`](../src/ui/element_webview_host.cpp)).
- Snapshot pattern: native pushes JSON state at ~60 Hz; React syncs via store actions.
- `window.__JUCE__` is shimmed in dev (`npm run dev`) — falls back to mock data when running standalone in browser.

## Subdirectories

| Directory | AGENTS.md | Role |
|-----------|-----------|------|
| `src/` | [src/AGENTS.md](src/AGENTS.md) | Full source map: components, stores, hooks, bridge, data, lib, motion, test |
| `.storybook/` | [.storybook/AGENTS.md](.storybook/AGENTS.md) | Storybook 9 config, verify-stories gate, Chromatic workflow |

## Build → embed pipeline

```bash
cd webview
npm install                    # first time only
npm run dev                    # http://localhost:5173 (hot reload with mock bridge)
npm run build                  # tsc -b && vite build → webview/dist/
npx tsc -b                     # type-check only
npm run lint                   # eslint
npx vitest run                 # unit tests (all)
npm run storybook              # Storybook dev server at http://localhost:6006
npm run verify-stories         # headless render-verify gate (catches mount-time throws)
```

2 known pre-existing verify-stories failures (do not regress others):
- `layout-bottomstrip--edit-tempo`
- `canvas-quickaddpopup--docs`

After `npm run build`, re-run CMake configure so `cmake/element_webview_dist.h.in` re-bakes `webview/dist/` into `generated_include/`. **Never edit `webview/dist/` by hand.**

## Conventions

- **No transparency / blur / glass** — neumorphic shadows only. Token palette in `index.css`.
- **NOTHING-fake rule**: every live component shows real engine data. No placeholder/mock data in shipped components. Demo data in `src/data/` is Storybook/dev only.
- **4-category block taxonomy** (separate from signal-type colours):
  - Virtual Instruments — blue `#4A90D9` ●
  - MIDI Effects — teal `#2BC4C4` ▲
  - Audio Effects — orange `#E8A838` ◆
  - Modulators/Utilities — purple `#A87FE0` ⬡
- **Signal-type colours** (cables/ports, distinct from category): Audio `#4A90D9`, MIDI `#2BC4C4`, Value/CV `#E8A838`. Always pair colour + shape (colour-blind safe).
- **Aggressive memoisation** for `@xyflow/react` (chunk-split rationale documented in `vite.config.ts`).
- **Dev port** 5173 (`npm run dev`). Storybook port 6006.
- Vitest tests colocate as `__tests__/` under the module they cover.
- Stories colocate as `*.stories.tsx` next to their component.

## Known gotchas

- **Zustand v5 useShallow**: derived selectors returning arrays or objects MUST be wrapped with `useShallow` from `zustand/react/shallow`. Without it the selector returns a new reference every render → infinite mount loop. This was the root cause of the blank-webview bug.
- **GraphCanvas `will-change` / WKWebView blur**: Do NOT add a permanent `will-change: transform` on `.react-flow__viewport`. It promotes the whole canvas to a composited layer; WKWebView then bitmap-stretches it on zoom, causing blur that is invisible in browser but visible in the real app. `GraphCanvas.tsx` promotes the layer only during pan/zoom gestures and demotes on gesture-end to force re-raster. See the comment block in `src/index.css`.
- **60Hz cable meters**: `useCableMeterStore` uses epsilon-diffed `Record<string, number>` + quantised primitive selectors to avoid re-render storms on every host snapshot push.
- **Shelved features**: DashboardBuilder, MacroDashboard, SceneLauncher, and Perform UI components exist in the codebase but must NOT be wired into navigation or new UI (decision D3, 2026-05-30).

## Anti-patterns

- Adding a feature to React without a matching `element*` native binding — features are gated by C++ state.
- Importing all of `lucide-react` — use the static `<Icon />` allowlist (chunk-split rationale in `vite.config.ts`).
- Mutating `webview/dist/` — output only; rebuild instead.
- `requestAnimationFrame` polling C++ state — subscribe to bridge updates instead.
- Adding `backdrop-blur` / `bg-opacity-*` Tailwind classes — violates Neumorphism mandate.
- Shipping placeholder/idle/mock data in a live component — violates NOTHING-fake rule.
