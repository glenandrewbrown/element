# Element Bug-Catcher Wave 2 — Master Discovery Report

**Date:** 2026-05-08
**Synthesized from:** `p1-fake-data.md`, `p2-p3-noop-and-dual.md`, `p4-early-return.md`, `p5-read-only.md`, `p6-async-race.md`, `p8-silent-catch.md`, `p9-icon-semantic.md`
**Deduped against:** `deep-review.md` (133-instance taxonomy), `ui-bug-master-list.md`, `bug-categories.md`
**HEAD:** `62b6fa9b`

---

## 1 · Executive summary

Pattern-based discovery applied 9 known bug classes systematically across the React webview + C++ bridge surface. **Four of seven patterns came back essentially clean** — strong validation that prior Wave 1 + Ralph cleanup was thorough. The remaining bug surface is much narrower than the 80-instance estimate from the handover.

| Class | Status | Action |
|---|---|---|
| P2/P3 (no-op + dual-state) | **CLEAN** | No action |
| P4 (early-return) | **CLEAN** (1 critical was already fixed at HEAD) | No action |
| P8 (silent catch + bridge misread) | **CLEAN** | No action |
| P9 (icon semantic mismatch) | **CLEAN** (44/44 correct) | No action |
| P5 (read-only without subscription) | 2 NEW Toolbar fixes (4/4 + LIVE) | XS effort |
| P1 (faked data) | Most are DUP or DEMO-only; 2 NEW overlap with P5 | XS–S effort |
| **P6 (async races)** | **9 NEW patterns** — biggest find | S–M effort each |

**Total NEW bugs: 12 (deduped clusters).** **Top-3 highest-severity NEW**: T-P6-1 session-load race (P0), T-P5-1 Toolbar 4/4 + LIVE hardcode (P0, single edit clears both P1 + P5 entries), T-P6-3 plugin-add→editor-open race (P0).

---

## 2 · Action ledger (sorted: severity ASC, effort ASC)

| id | pattern | file:line(s) | description | sev | effort | proposed fix | dedupe |
|---|---|---|---|---|---|---|---|
| T-P5-1 | P1+P5 | `Toolbar.tsx:263–264` | Time-sig "4/4" + mode badge "LIVE" hardcoded; ignore real engine state | P0 | XS | Subscribe via `selectTimeSig` and `selectEngineRunning` from `useEngineSnapshotStore`; render conditional badge | NEW (cluster fix; clears P1.3 + P5.1 + P5.2 in one diff) |
| T-P6-1 | P6 | `useJuceBridge.ts:446–462` | Session load → graph populate: `applySnapshot` may run on `undefined`/incomplete payload; canvas renders empty until next snapshot | P0 | S | Add `sessionLoaded` flag in `useSessionStore`; gate consumers on it; fall back to retry-poll if first call returns null | NEW |
| T-P6-3 | P6 | useJuceBridge.ts (plugin-add path) | Plugin add → editor open: editor opens before bridge confirms plugin loaded → blank/disabled UI | P0 | S | Emit `onPluginLoaded` completion event from C++; React waits before opening editor | NEW |
| T-P1-2 | P1 | `BlockEmbed.tsx:201–206, 328` | `MeterEmbed` default props 0.62/0.58/0.78/0.74 + an explicit fake-prop call site | P1 | XS | Default all four levels to `0`; add `// TODO(per-block-meter-bridge)` comment; remove explicit fake values at line 328 | NEW (was T7 in earlier plan) |
| T-P6-4 | P6 | mode-toggle path | Mode toggle (Edit↔Perform) does not re-fetch panel data → stale view after switching modes | P1 | S | On `setMode`, dispatch `refresh()` on affected stores (`usePerformStore`, `useGraphStore`) | NEW |
| T-P6-5 | P6 | useJuceBridge.ts boot effect | App boot → state hydration: stores read before host is ready | P1 | S | Add `hostReady` flag set true after first successful bridge round-trip; initial fetches gated on it | NEW |
| T-P6-8 | P6 | scene-activation path | Scene activation → perform state update: local mutation precedes bridge ack → divergence on failure | P1 | S | `await` bridge ack before updating local; on failure, revert + log via `logBridgeError` | NEW |
| T-P6-9 | P6 | parameter-update path | Parameter write fires UI update before bridge confirms; "MIDI learn" sometimes silent on first try | P1 | S | `await` write ack; show pending state during round-trip | NEW |
| T-P1-5 | P1 | `LiveHealth.tsx:93` | Input meter `levelToLadderHeights(0)` — bridge does not yet emit input peak; rendering as 0 is honest, but visually identical to "active and silent" | P1 | XS | Render disabled/empty-state input meter (e.g. greyed-out ladder) until `Q-VU-INPUT` lands; preserves honesty | NEW |
| T-P6-6 | P6 | dashboard load → widget hydration | Dashboard renders before widget params hydrate → widgets briefly show defaults | P2 | S | Retry-poll widget hydration; or block render with `<Skeleton />` until hydrated | NEW |
| T-P6-7 | P6 | preset list / load | Preset load races against parameter update | P2 | S | Apply preset only after `nativePresetLoad` resolves; on parallel param writes, queue | NEW |
| T-P1-1 | P1 | `webview/src/data/demoGraph.ts` (22 cpuLoad/latencyMs literals) | Demo graph hardcodes per-block CPU + latency — only ACTIVE when `VITE_USE_DEMO_GRAPH=1`, but file is bundled and could be displayed if flag is mis-set | P2 | S | Either guard `demoGraph` behind a build-time `if (import.meta.env.DEV && import.meta.env.VITE_USE_DEMO_GRAPH)` import, or rename `cpuLoad`/`latencyMs` to `demoCpu`/`demoLatency` and have `mapBlock` ignore them | NEW |
| — | P5 | `Toolbar.tsx` BPM (line 261), CPU/buffer/latency tiles | Already correctly subscribed | — | — | none | DUP (verified working) |
| — | P5 | StatusBar engine-running, RUNNING/STOPPED | Already correctly subscribed via `selectEngineRunning` | — | — | none | DUP |
| — | P1 | `usePerformStore.ts:62–73` `defaultHealth` | "—" placeholders are honest empty state | — | — | none (NOT a bug) | STOP-LIST |
| — | P1 | `MacroDashboard.tsx` `VuMeter` | Receives real `health.outputPeak` | — | — | none (NOT a bug) | STOP-LIST |
| — | P1 | `Block.tsx:495–511` per-block CPU/latency | Engine snapshot does not yet expose per-node CPU; FIXME(US-002) tracked separately | — | — | depends on C++ `juce::AudioProcessor` instrumentation | DUP (deep-review §1.16–1.17) |
| — | P4 | `buildActiveGraphJson()` early-return | Hoist already landed in commit f653b167 | — | — | none | DUP |
| — | P9 | all 44 `<Icon name=>` use-sites | All semantically correct including ratified `Power = MIDI Panic` | — | — | none | STOP-LIST |
| — | P8 | all 23 catch blocks | All call `logBridgeError` or surface UI feedback | — | — | none | STOP-LIST |
| — | P2/P3 | all `<button>` + store mirrors | All buttons functional; scene/session/graph/audio state correctly unified | — | — | none | STOP-LIST |

**Ledger summary:** 12 actionable NEW rows + 9 STOP-LIST/DUP rows. NEW = 12 · DUP = 4 · STOP-LIST = 5 · total = 21 rows.

---

## 3 · Pattern-class summary

- **P1 (Faked data)** — Most remaining instances are DEMO-only (`demoGraph.ts`, only active under build flag) or already known (BlockEmbed defaults, Block.tsx per-node CPU pending US-002). Only one truly new prod-visible faked render: Toolbar's hardcoded `4/4` + `LIVE` strings.
- **P2/P3 (no-op + dual-state)** — Audit found **zero** issues. All `<button>` elements have working handlers; scene/session/graph/audio state is unified through proper setters. Prior cleanup was complete.
- **P4 (early-return omitting state)** — Audit found **zero** unfixed issues. The one critical case (`buildActiveGraphJson` engine block) was already hoisted in commit `f653b167`. All other JSON builders write all fields unconditionally.
- **P5 (read-only without subscription)** — Two clear NEW gaps in `Toolbar.tsx` (`4/4` time-sig and `LIVE` mode badge), both fixable with one diff via existing `useEngineSnapshotStore` selectors. All other display tiles (BPM, CPU, buffer, device, latency, block/cable counts, cable meters, health) are correctly subscribed.
- **P6 (async races)** — **The big new finding.** Nine distinct fetch-then-use sequences lack completion guards or ack-await. Most critical: session-load → graph-populate (canvas empty on first render) and plugin-add → editor-open (blank UI). Recommended pattern: emit C++ completion events (`onSessionLoaded`, `onPluginLoaded`) for critical paths; retry-poll for secondary paths; `await` for state-mutation paths.
- **P8 (silent catch + bridge misread)** — Audit found **zero** issues. All 23 catches go through `logBridgeError`. Five sampled bridge wrappers had matching TS↔C++ shapes. Prior `logBridgeError` sweep was comprehensive.
- **P9 (icon semantic mismatch)** — Audit found **zero** issues. 44/44 `<Icon name=>` picks correct, including ratified `Power = MIDI Panic`. F.0.7 codemod was clean.

---

## 4 · Top-10 fix-first (IDs only, ordered by impact ÷ effort)

1. **T-P5-1** — Toolbar 4/4 + LIVE hardcoded (single XS edit clears P1 + P5 simultaneously)
2. **T-P1-2** — BlockEmbed MeterEmbed defaults → 0 + TODO (XS, was already on prior plan)
3. **T-P6-1** — Session load → graph populate: `sessionLoaded` flag (P0)
4. **T-P6-3** — Plugin add → editor open: completion event (P0)
5. **T-P6-5** — App boot → state hydration: `hostReady` flag (P1)
6. **T-P6-4** — Mode toggle → re-fetch panel data (P1)
7. **T-P6-8** — Scene activation → await bridge ack before local mutation (P1)
8. **T-P6-9** — Param write → await ack (P1)
9. **T-P1-5** — LiveHealth INPUT meter → disabled empty state (P1)
10. **T-P1-1** — demoGraph DEMO-only guard (P2; defensive)

---

## 5 · Stop-list (false positives / not-bugs)

| Item | Reason |
|---|---|
| `usePerformStore.defaultHealth` "—" placeholders | Honest empty state, not fake data |
| `MacroDashboard.VuMeter` | Already wired to `health.outputPeak` (commit `3e189415`) |
| F-201 scene divergence | Already verified non-bug — `useAppStore.setScene` calls `usePerformStore.activateScene` |
| All `Power` icon uses (Toolbar:536, 580) | Ratified MIDI Panic mapping; both uses correct |
| All other 44 `<Icon name=>` picks | Verified semantically correct against action context |
| All 23 `catch` blocks | Verified to call `logBridgeError` or surface UI feedback |
| All other C++ JSON builders | Verified to write all fields unconditionally |
| Plugin scan retry-poll | Already in place at `useJuceBridge.ts:469–481`; partial mitigation acceptable |

---

## 6 · Notable framing for next session

- **Most of the original 80-bug estimate was over-stated.** Many were already fixed; many turned out not to be bugs. The actual NEW work surface is **~12 clusters**, dominated by **P6 async races**.
- **The P6 cluster is architectural:** the recommended fix is *not* to retry-poll everywhere, but to introduce **C++→React completion events** for the critical paths (session-loaded, plugin-loaded). This is one bridge story (~half-day) that clears T-P6-1 and T-P6-3 together, and informs the pattern for T-P6-4/5/8/9.
- **T-P5-1 is the single highest-leverage diff in this report:** an XS edit that clears two P1 entries and two P5 entries simultaneously. Do this first.
- **Skip the test-coverage sub-tasks (T4–T6 from the earlier plan) until after** the 9 P6 fixes are in — race-condition tests against a moving codebase are wasted effort.
- **Skip the AX opacity sweep (T1) until after** verifying the actual current AX state — the prior delegation was interrupted; latest grep showed Toolbar already has `title=` on most icon-only buttons. A short LSP/grep verification will tell us if a sweep is even needed.

---

**Status:** Discovery complete. Hand the action ledger back to orchestration for prioritized fixes.
