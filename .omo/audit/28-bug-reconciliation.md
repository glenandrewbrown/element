# Prior 28-Bug Reconciliation vs Wave-3 Live Build

**Date:** 2026-05-29 · **Branch:** local-enhancements · **Build:** post-`ff023feb`.
**Prior source:** `docs/REACT_UI_AUDIT_2026-05-24.md` (28 bugs: 4 P0, 7 P1, 11 P2, 6 P3).
**Method:** 17 `task-11-*.png` host screenshots + targeted code grep + `.omo/audit/bridge-contract.md` (Wave-1 call-site diff) + `.omo/audit/layout-finding.md`.
**Classifications:** `still-present` · `fixed` · `artifact-of-blank-UI` (was a dev-mode/no-bridge symptom; correct surface in host now shows real data) · `superseded` (reframed/absorbed by a Wave-1/3 finding) · `needs-live` (no screenshot or code fact decides it).
**Discipline:** verdicts are evidence-cited; where a screenshot can't decide AND code can't, the row is `needs-live` (not guessed).

---

## P0 — Blockers (4)

| Bug | Verdict | Evidence note |
|-----|---------|---------------|
| BUG-001 No plugin scan in React Preferences | superseded | Reframed by `bridge-contract.md` sec.0/sec.5: the scan feature is **unbuilt on both sides**, not a wiring gap. Still absent in `PreferencesModal.tsx` (grep: no "scan"/`elementScanPlugins`). Carried as finding **F-09**. |
| BUG-002 No bridge fns for plugin scan | superseded | `bridge-contract.md`: the 7 named natives have ZERO React call sites AND ZERO C++ registration -> genuinely unbuilt, not a registration gap. Same cluster as F-09. |
| BUG-003 Preferences dropdowns ignore store data | fixed | `PreferencesModal.tsx:15` reads `useHostExtrasStore.audioSetup`; `:86-147` populate `<option>` from `deviceTypes/outputDevices/inputDevices/sampleRates/bufferSizes`. The "renders selects but never populates options" root cause is gone. (Live values screenshot: `task-11-preferences-modal.png` shows populated dropdowns + APPLY AUDIO.) |
| BUG-004 No audio device enumeration bridge | superseded | `bridge-contract.md`: device data already flows via `elementGetEngineSnapshot.audioSetup`, consumed at `PreferencesModal.tsx:15`. The premise that a *dedicated* enumeration native is needed was wrong — no gap to fix. |

## P1 — High (7)

| Bug | Verdict | Evidence note |
|-----|---------|---------------|
| BUG-005 Plugin browser always empty | needs-live | Was a dev-mode/no-scan symptom. Host notepad reports 1996 plugins cold-booted; `task-11-brass-window-3.png` browser panel present but list legibility insufficient to count entries. Confirm in host. (cluster F-09) |
| BUG-006 Session tree not populated on boot | fixed | `SessionTree.tsx:182-188` `useEffect` calls `nativeSessionGetGraphTree()` on mount and maps the result into `graphs`. The "not called on boot" root cause is gone. Session tree shows "Graph 1" + children in `task-11-brass-window-3.png`. |
| BUG-007 Parameters never load for any block | needs-live | `elementGetNodeParameters` path exists; no screenshot selects a block to show its param list (inspector shows PROJECT OVERVIEW only in `task-11-brass-front-2.png`). Carried as finding **F-14**. |
| BUG-008 Engine snapshot polling returns null | artifact-of-blank-UI | Was dev-mode (no bridge). In host, toolbar metrics (BPM/BUFFER/LATENCY) and native status bar (Engine Running, CPU 3.7%) populate -> snapshot is flowing. `task-11-brass-blocks.png`, `task-11-brass-window.png`. |
| BUG-009 About dialog version shows em-dash | fixed | `task-11-about-modal.png` shows "Element / Version 1.1.0" + CHECK FOR UPDATES + CLOSE. `elementAppGetAbout` returns real data in host. |
| BUG-010 Session ops fire-and-forget (no feedback) | needs-live | No screenshot exercises New/Open/Save and observes feedback/dirty-flag update. The dirty dot (".") on "BRASS_4Horns •" is visible (`task-11-brass-canvas-full.png`) which implies a dirty flag exists, but success/feedback UX is not decidable. |
| BUG-011 QuickAdd / CommandPalette data-starved | needs-live | Structural features exist; depends on the same host plugin list as BUG-005/F-09. Not exercised in screenshots. |

## P2 — Medium (11)

| Bug | Verdict | Evidence note |
|-----|---------|---------------|
| BUG-012 inferCategory() naive name matching | still-present | `useJuceBridge.ts:167-179` still name-matches; C++ block loop (`element_webview_host.cpp:4218-4271`) emits no `category`. AUDIO IN renders orange diamond "modifier" (wrong) in `task-11-brass-canvas-full.png`. Finding **F-03**. |
| BUG-013 inferFormat() returns "INT" for everything | still-present | `useJuceBridge.ts:181-183` hardcodes `return "INT"`; block loop emits no `format`. All 4 blocks badged "INT" in `task-11-brass-canvas-full.png`. The "item 15" emit fix is scoped but NOT applied in this build. Finding **F-02**. |
| BUG-014 Engine state two truth sources | needs-live | `StatusBar.tsx:16` now ORs `selectEngineRunning || isPlaying`, reducing divergence, but a true single-source can only be confirmed by watching both surfaces live during a transport change. |
| BUG-015 Latency display unformatted | still-present (partial) | Toolbar was fixed (`Toolbar.tsx:419` `.toFixed(1)`), but `LiveHealth.tsx:127` still renders raw `{health.latency} ms`. Finding **F-05**. |
| BUG-016 MIDI learn is stub | still-present (partial) | `PreferencesModal.tsx:244-252` now toggles learning with a visible active label (indicator improved); view/edit/remove of learned maps unconfirmed. Finding **F-08** (needs-live for map mgmt). |
| BUG-017 Snippet/molecule save not implemented | still-present | `SnippetShelf.tsx` has only `nativeMoleculeInsert` (load); no save action/bridge anywhere; empty-state text still describes a non-existent "save as molecule". Finding **F-07**. |
| BUG-018 Plugin editor double-click path unverified | needs-live | No screenshot double-clicks a block to open a native plugin editor. |
| BUG-019 Import/Export .elg native file dialog | needs-live | File-dialog behaviour not exercised in any screenshot. |
| BUG-020 VirtualKeyboard sparse array | fixed | `VirtualKeyboard.tsx:49` now uses explicit `null` placeholders (`["C", null, "D", null, ...]`) — no consecutive-comma sparse array; no `undefined` key holes. |
| BUG-021 Session file browser always empty | needs-live | `nativeSessionListFiles` (`nativeSession.ts:57-58`) exists and is wired; whether the host returns entries is not decidable from screenshots. |
| BUG-022 Perform I/O activity "(n/a)" | still-present | `LiveHealth.tsx:92` still hardcodes `INPUT (n/a)`; the bridge still provides a single aggregate peak, not per-I/O. Finding **F-06**. |

## P3 — Low / Cosmetic (6)

| Bug | Verdict | Evidence note |
|-----|---------|---------------|
| BUG-023 14+ em-dash placeholders | artifact-of-blank-UI | Dev-mode-only per its own note. In host, BUFFER/SAMPLE/LATENCY are filled (`task-11-brass-blocks.png`). NOTE: the SAMPLE slot is filled but with the WRONG field ("1.1.0") -> that distinct defect is finding **F-04**, not an em-dash. |
| BUG-024 "Default Device" in status bar (dev) | needs-live | `StatusBar.tsx:18-19` shows "Default Device" only when `health.clock` is em-dash — wiring looks correct. But the only host device evidence is `task-11-brass-window.png`, the **native pre-paint bar**, NOT the React StatusBar (whose strip is illegible in the shell screenshots). Code-correct-wiring != host-render-confirmed, so needs-live. Finding **F-11**. |
| BUG-025 "Engine stopped" in status bar (dev) | needs-live | Same surface gap as BUG-024: `StatusBar.tsx:16,58-59` wired to live engine state; the native bar shows "Engine: Running" but the React StatusBar strip is not legible. needs-live. Finding **F-11**. |
| BUG-026 BPM not editable | fixed | `Toolbar.tsx:350-387` renders an editable `<input>` (onChange/onBlur/Enter -> `nativeTransportSetTempo`), gated by `editingBpm`. The static-text root cause is gone. |
| BUG-027 Board dropdown doesn't switch graphs | needs-live | Not exercised; BRASS shows a single "Graph 1". Cannot confirm/refute. Finding **F-13**. |
| BUG-028 Timecode display missing / below target Hz | artifact-of-blank-UI (display) + needs-live (rate) | Display: `StatusBar.tsx:104` renders `health.timecode || "00:00:00:00"`; toolbar SAMPLE shows live "1.1.0" so timecode data flows in host. The 4Hz-vs-target-Hz cadence concern is unmeasured here -> needs-live. |

---

## Tally (canonical single-bucket — sums to 28)

Each bug is assigned to exactly one bucket. Where a bug improved partially (e.g. BUG-016 active-indicator added but map-management unconfirmed; BUG-015 toolbar fixed but LiveHealth not), it is bucketed by the part that is NOT yet resolved, with the partial noted in its per-row above.

| Verdict | Count | Bugs |
|---------|-------|------|
| fixed | 5 | BUG-003, BUG-006, BUG-009, BUG-020, BUG-026 |
| still-present | 6 | BUG-012, BUG-013, BUG-015, BUG-016, BUG-017, BUG-022 |
| superseded | 3 | BUG-001, BUG-002, BUG-004 |
| artifact-of-blank-UI | 2 | BUG-008, BUG-023 |
| needs-live | 12 | BUG-005, BUG-007, BUG-010, BUG-011, BUG-014, BUG-018, BUG-019, BUG-021, BUG-024, BUG-025, BUG-027, BUG-028 |

**Total: 5 + 6 + 3 + 2 + 12 = 28.** ✓

Notes:
- **BUG-004** is `superseded` (not `fixed`): the premise that a *dedicated* audio-device-enumeration native is needed was wrong — device data already flows via `elementGetEngineSnapshot.audioSetup` (`bridge-contract.md`). Nothing was built to fix it; the requirement was invalid.
- **BUG-024 / BUG-025** are `needs-live`, NOT `artifact-of-blank-UI`: the React StatusBar render is unconfirmed in host (only the native pre-paint bar is legible). Artifact would require seeing the correct *React* surface show real data — that evidence does not exist. See finding **F-11**.
- **BUG-028** is `needs-live` for the 4Hz-vs-target cadence question, though its timecode *display* half is host-confirmed (`StatusBar.tsx:104`; toolbar SAMPLE shows live "1.1.0").
