
## Re-review pass 2 — 2026-05-08 02:27

**HEAD:** 62b6fa9b44ebb63b36f9066ff1941daafa148db0
**Verdict:** APPROVED

### Per-criterion re-verification
- US-003 AC2 Record button reflects engine.isRecording: Y — `webview/src/components/layout/Toolbar.tsx:64` declares `recording = useEngineSnapshotStore(selectTransportRecording)`. Render at line 327-330 binds `recording` to className/title/aria-label/aria-pressed. Snapshot polls at 250ms via `useEngineSnapshotStore.startPolling()` and propagates `transportRecording` from `element_webview_host.cpp:955`.
- US-003 AC3 Stop reflects state: Y — Stop button issues `nativeTransportStop()` (line 321); since play/record both subscribe to engine snapshot, the snapshot poll flips both icons after engine acks the stop.
- US-003 AC5 External record trigger updates: Y — `handleToggleRecord` (line 119-121) calls `nativeTransportSetRecording(!recording)` only; no local `setRecording`. UI reflection therefore depends solely on `transportRecording` snapshot, which is published by `element_webview_host.cpp:932-955` regardless of trigger source (Lua/MIDI/native menu).
- US-002 Play button source-of-truth (rebound to engine snapshot): Y — `isPlaying = useEngineSnapshotStore(selectTransportPlaying)` at Toolbar.tsx:69. Stale duplicate declaration at line 140 is a comment only, no shadowing.

### Build/test/bundle gate
- ctest: 65/65 passed (8.03s, excluded DeviceServiceController/SessionServiceFileOps as instructed)
- vitest: 7/7 files, 46/46 tests passed (2.36s)
- main chunk size: index-7onyZlF_.js = 211.53 kB (gzip 53.38 kB) — well under 400 kB ceiling
- tsc errors: 0 (`tsc -b --noEmit` clean exit 0)
- vite build: clean, 2354 modules transformed in 434ms

### Findings
- Selectors `selectTransportRecording` (`useEngineSnapshotStore.ts:140`) and `selectTransportPlaying` (line 138) exist as required.
- C++ engine publishes `transportRecording` (`element_webview_host.cpp:955`) and `transportPlaying` (line 954); the prior architect's premise that "C++ doesn't publish isRecording" was incorrect — that stale comment has been removed from Toolbar.
- TypeScript bridge surfaces both fields (`webview/src/bridge/nativeEngineSnapshot.ts:26-27`, parsed at lines 116-117).
- `handleToggleRecord` correctly omits any local-state update; reliance on the snapshot poll is the only correct pattern given `nativeTransportSetRecording` returns void. Latency = up to one poll interval (250 ms), acceptable for a toggle.
- No remaining `useState(...)` related to `recording` or `isPlaying`; remaining `useState` calls (`prefsOpen`, `aboutOpen`, `captureBusy`, `editingBpm`, `bpmInput`) are unrelated UI ephemera.

### Recommendation
- APPROVED: proceed to deslop pass + /oh-my-claudecode:cancel
