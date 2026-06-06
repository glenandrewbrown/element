<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# bridge/ — window.__JUCE__ typed wrappers

Typed abstractions over `window.__JUCE__.backend`. Components and hooks must
never access `window.__JUCE__` directly — always go through these modules.
In dev / browser mode the backend is shimmed with mock data so the webview
runs standalone. In production the shim is replaced by the real JUCE bridge.

## Key Files

| File | Description |
|------|-------------|
| `juceBackend.ts` | Core wrapper: `invokeNativeFunction(name, args?)` → Promise. All C++-registered handlers are called through this. |
| `bridgeError.ts` | Typed error class for bridge call failures; thrown by `juceBackend.ts` on non-OK responses. |
| `nativeApp.ts` | App-level calls: `elementAppGetAbout`, `elementAppQuit`, `elementAppGetVersion`, etc. |
| `nativeSession.ts` | Session/project calls: open, save, close, get active graph id. |
| `nativeGraph.ts` | Board/graph manipulation: add/remove/move nodes, connect/disconnect cables, get graph state. |
| `nativePerform.ts` | Perform-mode calls: scene triggers, panic (Note Off all MIDI outputs). |
| `nativePrefs.ts` | Preferences read/write. |
| `nativeKeyboard.ts` | Native keyboard event forwarding (for JUCE-side shortcut handling). |
| `nativePluginEditor.ts` | Open/close/resize native plugin editor window (VST3/AU/CLAP). |
| `nativeEngineSnapshot.ts` | `elementGetEngineSnapshot` — pulls engine status JSON (CPU, latency, buffer, drop count). Schema documented in C++ `element_webview_host.cpp`. |
| `nativeInstances.ts` | `elementGetInstances` / `elementGetInstanceSnapshot` — multi-instance (U11): queries Element PluginProcessors co-hosted in same DAW process. |
| `nativeNodeSpectrum.ts` | Spectrum analyser data for selected node. |
| `nativePluginScan.ts` | Plugin scan trigger + progress events. |

## For AI Agents

- Every new C++-registered handler needs a typed wrapper here before components
  can use it. Do NOT call `window.__JUCE__.backend.invokeNativeFunction` inline.
- All native function names are prefixed `element*` (registered in
  `src/ui/element_webview_host.cpp` on the C++ side).
- Bridge event subscriptions (push from C++ → JS) belong in `src/hooks/useJuceBridge.ts`,
  not scattered across components.
- Test command: `npx vitest run --dir src/bridge`

## Dependencies

- Internal: none (leaf module — everything else depends on this)
- External: none (pure TypeScript wrappers over `window.__JUCE__`)
