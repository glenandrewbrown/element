# Lane A (C++ reliability) — interface contract + status (2026-06-01)

Branch `chromatic-ui-review`. C++ only. Build verified: `cmake --build build-merged -j8` exit 0,
zero errors/warnings on all changed files. 6/8 deterministic `Sandbox*` ctest suites pass
(protocol, IPC, parameter round-trip, wait-for-response, semaphore, atomic-integrity). The 2
real-subprocess stress suites (`SandboxOrderedShutdownTests`, `SandboxedProcessorNodeTests`) are
pre-existing-flaky on this machine (fail at a *different* load cycle each run — 36 then 21 — a race
in the untouched real-process LOAD handshake, not a Lane-A regression; my shutdown change is a
no-op when no editor is open).

## ▶ LANE-B CONTRACT (JS bridge — build the Block "plugin crashed — reload" UI against this)

### Event PUSHED host → webview (crash/restart/load-fail)
```
window.__elementNative.onSandboxEvent({
  nodeId:   <number>,   // engine numeric node id
  nodeUuid: "<string>", // the UUID the React Block components key on (use THIS to match a Block)
  kind:     "crashed" | "restarted" | "loadFailed" | "error",
  reason:   "<string>"  // human-readable, e.g. "ValhallaSupermassive crashed"
})
```
- Dispatched on the message thread (marshalled + SafePointer-guarded).
- `onSandboxEvent` is called defensively (`window.__elementNative && ...onSandboxEvent && ...`); the
  webview just needs to define `window.__elementNative.onSandboxEvent`.
- Fires ONLY for sandboxed (out-of-process) nodes — i.e. only when the user has opted into
  Preferences → Plugins → Sandbox Mode (default OFF). In-process nodes never emit.

### Native FUNCTIONS callable webview → host (return a Promise<bool>)
```
window.__JUCE__.backend invoke "elementRestartSandbox"(nodeUuid: string) -> bool
    // true if node is sandboxed and a restart was issued. Wire the "reload" button to this.

window.__JUCE__.backend invoke "elementOpenSandboxedEditor"(nodeUuid: string, screenX?: number, screenY?: number) -> bool
    // Opens the sandboxed plugin's editor in its OWN crash-isolated OS window (REAPER model).
    // true if node is sandboxed and an open was issued. For an IN-PROCESS node returns false →
    // caller should fall back to the existing pluginEditorOpen / floating-window path.

window.__JUCE__.backend invoke "elementCloseSandboxedEditor"(nodeUuid: string) -> bool
    // Closes that separate editor window.
```
(All resolve to bool; same invocation style as `elementSetNodeParameter`.)

## What is REAL vs flag-gated

| Item | State |
|---|---|
| R1 sandbox route (`createFilter` → `createSandboxedGraphNode`) | REAL, wired. Gated by `Settings::shouldSandboxPlugin()` (key `pluginSandboxMode`), **default 0 = in-process** (unchanged behavior). Set mode 1/2 to actually route a plugin through a worker. |
| R3 crash bridge (`onSandboxEvent` push + `elementRestartSandbox`) | REAL, wired end-to-end (node callback → `PluginManager::sigSandboxEvent` → webview host → JS). Only fires for sandboxed nodes. |
| Separate-window editor (worker creates editor in its own NSWindow) | REAL code path, compiles + links. Reachable only for sandboxed nodes via `elementOpenSandboxedEditor`. NOT yet runtime-verified against a real commercial plugin (needs the signed app + a sandboxed AU/VST3 — see continuation). |

NOTHING fake: no stub/placeholder data. When sandbox mode is off, none of this runs and plugins
behave exactly as before. When on but the worker can't host a plugin, the node falls back to
in-process (honest best-effort; default-on hardening is R6, gated later).

## Files changed (C++ only)
- `src/engine/graphmanager.cpp` — R1 sandbox branch in `createFilter` (+`<element/settings.hpp>`).
- `include/element/plugins.hpp` — `SandboxEvent` enum + `sigSandboxEvent` signal + `emitSandboxEvent()`.
- `src/nodes/sandboxedprocessor.hpp` — emit sandbox events from crash/restart/load-fail callbacks; `openEditor/closeEditor/isEditorOpen` passthroughs (+`<element/plugins.hpp>`).
- `src/engine/sandboxipc.hpp` — `OpenEditorWindow/CloseEditorWindow` + `EditorWindowOpened/Failed/Closed` message types + `EditorWindowPayload`.
- `src/engine/sandboxhost.hpp` — `openEditor/closeEditor/isEditorOpen` + editor listener callbacks + worker-msg handling + crash-time editor-state clear.
- `src/engine/sandboxworker.hpp` — `handleOpenEditorWindow/handleCloseEditorWindow/closeEditorWindowIfOpen`; editor teardown in shutdown + unload.
- `src/engine/sandboxeditorwindow.hpp` / `.cpp` — NEW. Worker-side `SandboxEditorWindow` (DocumentWindow) + `sandbox_editor_window::openEditorWindow/closeEditorWindow/...` (pure JUCE, cross-platform).
- `src/engine/sandboxeditorwindow_mac.mm` — NEW. `sandboxWorkerActivateForEditor()` (promotes dock-hidden worker + brings window to front). APPLE only; non-Apple stub in the `.cpp`.
- `src/ui/element_webview_host.cpp` / `include/.../element_webview_host.hpp` — subscribe `sigSandboxEvent` → `emitSandboxEventToWeb` (onSandboxEvent push); `elementRestartSandbox` / `elementOpenSandboxedEditor` / `elementCloseSandboxedEditor` native fns (+`nodes/sandboxedprocessor.hpp`).
- `src/CMakeLists.txt` — add `sandboxeditorwindow_mac.mm` to APPLE sources. **Reconfigure done** (new `.cpp` is GLOB-picked, `.mm` explicit).

## CONTINUATION (runtime verification — needs the signed app + a real plugin; not done in this lane)
1. **Sign + run** the freshly built `build-merged/element_app`: hardened runtime +
   `com.apple.security.cs.disable-library-validation` (+ allow-jit / allow-unsigned-exec-mem) or the
   worker rejects 3rd-party VST3 dylibs (see EDITOR-EMBED-FOLLOWUP §"Signing"):
   `codesign --force --deep --options runtime --entitlements cmake/entitlements.plist --sign - <app>`.
2. **Turn the flag on**: Preferences → Plugins → Sandbox Mode = 1 (all) or 2 (AU-only) — OR set
   `pluginSandboxMode` in the user settings plist. Add ONE plugin → confirm a separate worker pid
   hosts it (Activity Monitor; worker log `~/Library/Application Support/Element/log/sandbox_worker.log`).
3. **Editor**: from the webview, invoke `elementOpenSandboxedEditor(nodeUuid)` → confirm the plugin's
   editor appears in its own window (worker-owned, WindowServer-composited). SIGKILL the worker pid
   → host survives + the window vanishes + `onSandboxEvent("crashed")` reaches the Block (R3) →
   `elementRestartSandbox` reloads. This is the crash-isolation ship proof.
4. **R2 blocker** (separate task): real-AU load-time message-thread hang (BRASS_4Horns) still blocks
   default-on; the in-process fallback in `createFilter` papers over it for opt-in users but R6
   (default-on) needs R2 fixed first.
5. **Known seam for embedded-in-canvas** (DEFERRED, future sprint): the spike's IOSurface/CARenderer
   mirror is preserved in worktree `.claude/worktrees/agent-a1c2f243783cd6324`; this lane shipped the
   separate-window path instead (per EDITOR-EMBED-FOLLOWUP "Ship path NOW").
