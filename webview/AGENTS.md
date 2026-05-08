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

## Build → embed pipeline

```bash
cd webview
npm install                # first time only
npm run dev                # http://localhost:5173 (hot reload with mock bridge)
npm run build              # tsc -b && vite build → webview/dist/
npx tsc -b                 # type-check only
npm run lint               # eslint
npm test                   # vitest run
```

After `npm run build`, re-run CMake configure so `cmake/element_webview_dist.h.in` re-bakes `webview/dist/` into `generated_include/`. **Never edit `webview/dist/` by hand.**

## Conventions

- **No transparency / blur / glass** — neumorphic shadows only. Token palette in `index.css`.
- **Three signal types** colour-coded: Audio `#4A90D9` (●), MIDI `#2BC4C4` (▲), Value/CV `#E8A838` (◆). Always pair colour + shape (colour-blind safe).
- **Aggressive memoisation** for `@xyflow/react` (chunk-split rationale documented in `vite.config.ts`).
- **Dev port** 5173 (`npm run dev`).
- Vitest tests colocate as `__tests__/` under the module they cover.

## Anti-patterns

- Adding a feature to React without a matching `element*` native binding — features are gated by C++ state.
- Importing all of `lucide-react` — use the static `<Icon />` allowlist (chunk-split rationale in `vite.config.ts`).
- Mutating `webview/dist/` — output only; rebuild instead.
- `requestAnimationFrame` polling C++ state — subscribe to bridge updates instead.
- Adding `backdrop-blur` / `bg-opacity-*` Tailwind classes — violates Neumorphism mandate.
