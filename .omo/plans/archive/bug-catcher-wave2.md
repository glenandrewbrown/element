> 🗄️ **ARCHIVED — HISTORICAL. Do NOT execute.** 2026-05-08 pattern-based bug-discovery plan (`local-enhancements` lineage). Live successors: `.omo/audit/findings.md` · `.omo/audit/28-bug-reconciliation.md`.
> Current state: `.omo/PROJECT-STATE.md` · plans index: `.omo/plans/README.md`. _(Archived 2026-05-30.)_

# Element Bug-Catcher Wave 2 — DISCOVERY-FIRST PLAN

**Date:** 2026-05-08
**Branch:** local-enhancements
**HEAD at start:** 62b6fa9b
**Session:** ses_1faab0a77ffenAEVqNCbc89rdm
**Scope:** US-006 deep pattern-based bug discovery — apply 9 known bug classes systematically across the entire React + bridge surface

---

## Context — Stakeholder Pivot

Prior session enumerated 133 bug instances across 10 classes; ~50 fixed. Stakeholder feedback redirects us:

> "Be thorough, inquisitive, agile — if you discover one bug, follow the root and ask: could this same kind of bug also be present for X, Y, Z?"

**Strategy change:** Pattern-hunt across the codebase BEFORE any fixes. The prior list was found by audit; the next layer requires *systematic* application of each bug pattern to every plausible target.

---

## 9 Bug Patterns to Apply Systematically

| # | Pattern | Where to look |
|---|---------|---------------|
| P1 | Faked / hallucinated data | Stores: useSession/Graph/Perform/HostExtras + Inspector LOG/METERS |
| P2 | No-op onClick / placeholder buttons | NodeContextMenu, EdgeContextMenu, modal actions, sidebar nav |
| P3 | Dual / divergent state | Sessions, graphs, plugins, audio settings (Scene-pattern mirrors) |
| P4 | Early-return omitting state | C++ snapshot builders, polling timers, mount effects |
| P5 | Read-only display without subscription | Inspector LOG/METERS, LiveHealth, BPM, mode badge, BLOCKS/CABLES |
| P6 | Async race conditions | Session→graph load, plugin add→editor open, mode toggle→re-fetch |
| P7 | AX opacity (icon-only buttons) | Every icon-only button |
| P8 | Bridge response misinterpreted / silent catch | All store fetchers, bridge wrappers |
| P9 | Codemod semantic mismatch | All `<Icon name="..." />` sites |
| P10 | Test coverage gap | 36 untested production files (already enumerated) |

---

## Phase A — Discovery (parallel agents, READ-ONLY)

- [ ] **A1: Pattern P1 hunt** — Faked/hallucinated data in stores + components. Output → `.sisyphus/qa/discovery/p1-fake-data.md`
- [ ] **A2: Pattern P2+P3 hunt** — No-op onClick + dual-state systems across context menus, modals, sidebar, store mirrors. Output → `.sisyphus/qa/discovery/p2-p3-noop-and-dual.md`
- [ ] **A3: Pattern P4 hunt** — C++ early-return omitting state in snapshot builders + React mount-effect omissions. Output → `.sisyphus/qa/discovery/p4-early-return.md`
- [ ] **A4: Pattern P5 hunt** — Read-only displays without subscription (Inspector LOG/METERS, BPM, mode badge, counts, etc). Output → `.sisyphus/qa/discovery/p5-read-only.md`
- [ ] **A5: Pattern P6 hunt** — Async race conditions in load/populate sequences. Output → `.sisyphus/qa/discovery/p6-async-race.md`
- [ ] **A6: Pattern P8 hunt** — Silent catches + bridge response misinterpretation. Output → `.sisyphus/qa/discovery/p8-silent-catch.md`
- [ ] **A7: Pattern P9 hunt** — `<Icon name>` semantic mismatches against the action they represent. Output → `.sisyphus/qa/discovery/p9-icon-semantic.md`

## Phase B — Synthesis

- [ ] **B1: Master discovery report** — Combine all A1-A7 findings into `.sisyphus/qa/discovery/master-discovery-report.md` with severity/priority. Cross-reference against existing deep-review.md to find NEW bugs (not already enumerated).

## Phase C — Prioritized Fixes (created from B1)

- [ ] **C1+...** Generated dynamically from B1 — only after discovery + synthesis complete.

## Phase F — Final Verification

- [ ] **F1:** Webview build clean — `cd webview && npm run build && npx tsc -b --noEmit` → exit 0
- [ ] **F2:** Vitest all pass — `cd webview && npx vitest run`
- [ ] **F3:** ctest baseline preserved — 65/65 (excluding 2 slow service tests)

---

## Architecture Reference (carry-over from handover)

### Engine Snapshot Pattern (ESTABLISHED)
- C++: `elementGetEngineSnapshot` at `src/ui/element_webview_host.cpp:885-958`
- React: `webview/src/stores/useEngineSnapshotStore.ts` (250ms poll)
- Selectors: `selectCpuPercent`, `selectSampleRate`, `selectBufferSize`, `selectDeviceName`, `selectEngineRunning`, `selectTransportPlaying`, `selectTransportRecording`, `selectTempoBpm`, `selectTimeSig`, `selectTransportTimecode`

### logBridgeError Pattern (ESTABLISHED)
- `webview/src/bridge/bridgeError.ts` — use in ALL new bridge wrappers

### Commit Protocol
- NEVER `--no-verify`
- `git commit -F /tmp/msg.txt` for multi-line messages

### Store Inventory
- 11 stores: useAppStore, useBusStore, useCableMeterStore, useDashboardStore, useEngineSnapshotStore, useGraphStore, useHostExtrasStore, useParameterStore, usePerformStore, usePluginBrowserStore, useSessionStore

### Bridge Wrapper Inventory
- 10 wrappers: bridgeError, juceBackend, nativeApp, nativeEngineSnapshot, nativeGraph, nativeKeyboard, nativePerform, nativePluginEditor, nativePrefs, nativeSession
