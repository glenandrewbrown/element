# P1 Bug Class: Faked/Hallucinated Data — Comprehensive Audit

**Date:** 2026-05-08  
**Scope:** webview/src (stores, components, data)  
**Methodology:** Parallel grep + AST inspection for hardcoded values, demo data, and unsubscribed displays  
**Status:** DISCOVERY PHASE — No modifications made

---

## Executive Summary

**Total Instances Found: 28 P1 violations** across 8 files. These fall into 4 categories:

1. **Demo graph hardcoded metrics** (22 instances) — `demoGraph.ts` cpuLoad/latencyMs all hardcoded
2. **BlockEmbed meter defaults** (4 instances) — MeterEmbed component renders fake L/R levels
3. **Toolbar hardcoded display strings** (2 instances) — "4/4" time-sig and "Engine: Live" badge
4. **Placeholder values in stores** (0 critical, but 1 honest empty state) — defaultHealth uses "—" correctly

---

## File-by-File Findings

### 1. `/webview/src/data/demoGraph.ts` — Demo Graph Hardcoded Metrics

**Severity:** P1 (demo data, but visually indistinguishable from live)

| Line | Pattern | What It Fakes | Issue | Proposed Fix |
|------|---------|---------------|-------|--------------|
| 34–35 | `cpuLoad: 0.4, latencyMs: 0.4` | OSC_A processor load | Hardcoded demo value | Use real bridge snapshot or mark as DEMO |
| 56–57 | `cpuLoad: 0.1, latencyMs: 0` | Audio Input load | Hardcoded demo value | Use real bridge snapshot or mark as DEMO |
| 85–86 | `cpuLoad: 4.8, latencyMs: 0` | Kontakt 8 load | Hardcoded demo value | Use real bridge snapshot or mark as DEMO |
| 123–124 | `cpuLoad: 1.4, latencyMs: 1.4` | FILTER_CORE load | Hardcoded demo value | Use real bridge snapshot or mark as DEMO |
| 159–160 | `cpuLoad: 2.1, latencyMs: 0` | ProQ3 load | Hardcoded demo value | Use real bridge snapshot or mark as DEMO |
| 195–196 | `cpuLoad: 1.8, latencyMs: 0` | Reverb load | Hardcoded demo value | Use real bridge snapshot or mark as DEMO |
| 224–225 | `cpuLoad: 12.1, latencyMs: 0` | Wavetable load | Hardcoded demo value | Use real bridge snapshot or mark as DEMO |
| 253–254 | `cpuLoad: 1.9, latencyMs: 0` | Compressor load | Hardcoded demo value | Use real bridge snapshot or mark as DEMO |
| 282–283 | `cpuLoad: 0.3, latencyMs: 0` | Reverb Tail load | Hardcoded demo value | Use real bridge snapshot or mark as DEMO |
| 320–321 | `cpuLoad: 0, latencyMs: 0` | Audio Output load | Hardcoded zero | Use real bridge snapshot or mark as DEMO |
| 342–343 | `cpuLoad: 0.1, latencyMs: 0` | MIDI Output load | Hardcoded zero | Use real bridge snapshot or mark as DEMO |
| **+11 more** | Similar pattern | Similar blocks | Hardcoded demo values | Batch fix: mark demoGraph as DEMO-ONLY or wire real metrics |

**Root Cause:** `demoGraph.ts` is used when `VITE_USE_DEMO_GRAPH=1` is set (dev mode). The values are plausible but not real. When the demo graph is rendered in production (if bridge is unavailable), users see fake CPU/latency.

**Proposed Fix:**
- Option A: Add a `isDemoData: true` flag to all demoGraph blocks so UI can render a "DEMO" badge
- Option B: Ensure demoGraph is ONLY used in dev mode and never in production fallback
- Option C: Wire real per-block CPU/latency from the engine snapshot (separate work)

---

### 2. `/webview/src/components/canvas/BlockEmbed.tsx` — MeterEmbed Hardcoded Defaults

**Severity:** P1 (renders fake live meter data)

| Line | Pattern | What It Fakes | Issue | Proposed Fix |
|------|---------|---------------|-------|--------------|
| 202 | `leftLevel = 0.62` | Left channel audio level | Hardcoded default | Subscribe to real meter data or show empty state |
| 203 | `rightLevel = 0.58` | Right channel audio level | Hardcoded default | Subscribe to real meter data or show empty state |
| 204 | `leftPeak = 0.78` | Left channel peak hold | Hardcoded default | Subscribe to real meter data or show empty state |
| 205 | `rightPeak = 0.74` | Right channel peak hold | Hardcoded default | Subscribe to real meter data or show empty state |

**Context:** `MeterEmbed` is rendered inside `BlockEmbed` when a plugin editor is embedded. The component accepts optional meter props but defaults to hardcoded values if not provided. These defaults are never overridden by real data.

**Root Cause:** No bridge subscription for per-block meter data. The C++ side does not emit per-block L/R metering; only aggregate output peak is available via `onMetering`.

**Proposed Fix:**
- Option A: Remove MeterEmbed from BlockEmbed until per-block metering is available from C++
- Option B: Show empty/zero state instead of fake defaults
- Option C: Wire the aggregate output peak (from `usePerformStore.liveHealth.outputPeak`) to both L/R channels as a placeholder

---

### 3. `/webview/src/components/layout/Toolbar.tsx` — Hardcoded Display Strings

**Severity:** P1 (renders fake live state)

| Line | Pattern | What It Fakes | Issue | Proposed Fix |
|------|---------|---------------|-------|--------------|
| 263 | `<span>4/4</span>` | Time signature | Hardcoded string | Subscribe to real time-sig from engine snapshot |
| 546 | `Engine: Live` | Engine status badge | Hardcoded string | Already fixed in StatusBar; Toolbar should mirror it |

**Context:**
- Line 263: Rendered in the PERFORM mode header. Should display the actual time signature from the session/engine.
- Line 546: Rendered in the EDIT mode right-side status. Should reflect actual engine state (RUNNING/STOPPED).

**Root Cause:**
- Time signature is not yet exposed by the C++ bridge (no `timeSig` field in engine snapshot)
- Engine status is available via `useEngineSnapshotStore(selectEngineRunning)` but Toolbar doesn't use it

**Proposed Fix:**
- Line 263: Add `timeSig` to engine snapshot (C++ work) or show "—" placeholder
- Line 546: Replace hardcoded "Engine: Live" with `engineRunning ? "Engine: Running" : "Engine: Stopped"` (mirror StatusBar logic)

---

### 4. `/webview/src/stores/usePerformStore.ts` — Default Health State

**Severity:** P0 (honest empty state, not fake)

| Line | Pattern | What It Shows | Status | Notes |
|------|---------|---------------|--------|-------|
| 62–73 | `defaultHealth` object | "—" placeholders | CORRECT | Uses honest "—" for unavailable data, not fake numbers |

**Finding:** This is NOT a P1 violation. The store correctly initializes with "—" (em-dash) for unavailable fields, which is the honest empty state pattern.

---

### 5. `/webview/src/components/layout/LiveHealth.tsx` — I/O Meter Bars

**Severity:** P1 (renders fake input meter)

| Line | Pattern | What It Fakes | Issue | Proposed Fix |
|------|---------|---------------|-------|--------------|
| 93 | `levelToLadderHeights(0)` | Input peak meter | Hardcoded zero | Bridge does not emit input peak; show empty state |

**Context:** The INPUT meter bar is hardcoded to render with `level=0` because the C++ bridge does not yet emit an input peak value. The comment at line 91–92 acknowledges this: "TODO Q-VU-INPUT: bridge does not yet emit an input peak."

**Root Cause:** C++ bridge only emits aggregate output peak via `onMetering`, not input peak.

**Proposed Fix:**
- Option A: Wait for C++ to emit input peak (Q-VU-INPUT work)
- Option B: Show empty/disabled state for INPUT meter until data is available
- Option C: Render INPUT meter as a mirror of OUTPUT (not ideal but better than hardcoded zero)

---

### 6. `/webview/src/components/layout/MacroDashboard.tsx` — VU Meter

**Severity:** P0 (correctly uses real data)

**Finding:** The `VuMeter` component at line 36–45 correctly receives `level` prop from `health.outputPeak` (line 52). No hardcoded values found. This is CORRECT.

---

### 7. `/webview/src/components/canvas/Block.tsx` — Per-Block CPU/Latency Display

**Severity:** P1 (renders demo data as live)

| Line | Pattern | What It Displays | Issue | Proposed Fix |
|------|---------|------------------|-------|--------------|
| 495–501 | `{d.latencyMs}ms` | Per-block latency | Comes from demoGraph (hardcoded) | Wire real latency from engine snapshot |
| 505–511 | `{d.cpuLoad.toFixed(1)}ms` | Per-block CPU | Comes from demoGraph (hardcoded) | Wire real CPU from engine snapshot |

**Context:** Block.tsx displays `d.latencyMs` and `d.cpuLoad` from the BlockData object. When the graph is seeded from demoGraph, these are hardcoded demo values. When the graph is loaded from the engine snapshot, these should be real values — but the engine snapshot does not yet include per-block CPU/latency.

**Root Cause:** Engine snapshot does not include per-block metrics; only aggregate CPU is available.

**Proposed Fix:**
- Option A: Add per-block CPU/latency to engine snapshot (C++ work)
- Option B: Show "—" instead of hardcoded zero when data is unavailable
- Option C: Mark demo blocks with a DEMO badge so users know the values are not real

---

### 8. `/webview/src/components/canvas/Cable.tsx` — Per-Cable Meter Visualization

**Severity:** P1 (renders zero when bridge unavailable)

| Line | Pattern | What It Displays | Issue | Proposed Fix |
|------|---------|------------------|-------|--------------|
| 59 | `const level = useCableMeterStore((s) => s.levels[id] ?? 0)` | Cable signal level | Defaults to 0 if bridge unavailable | Honest default, but could be more explicit |

**Context:** Cable visualization uses `useCableMeterStore` to fetch per-cable signal levels. If the bridge does not emit meter data, the store remains empty and all cables render with `level=0` (no glow/animation).

**Root Cause:** Bridge subscription in `useJuceBridge.ts` (line 432) calls `setCableLevels` only when data arrives. If the bridge is unavailable, the store stays empty.

**Proposed Fix:**
- This is acceptable as-is (honest zero), but could add a visual indicator (e.g., "OFFLINE" badge) when the bridge is unavailable

---

## Summary Table

| File | Category | Count | Severity | Status |
|------|----------|-------|----------|--------|
| `demoGraph.ts` | Demo metrics | 22 | P1 | NEEDS FIX |
| `BlockEmbed.tsx` | Meter defaults | 4 | P1 | NEEDS FIX |
| `Toolbar.tsx` | Display strings | 2 | P1 | NEEDS FIX |
| `LiveHealth.tsx` | Input meter | 1 | P1 | NEEDS FIX |
| `Block.tsx` | Per-block metrics | 2 | P1 | NEEDS FIX |
| `usePerformStore.ts` | Default state | 0 | P0 | CORRECT |
| `MacroDashboard.tsx` | VU meter | 0 | P0 | CORRECT |
| `Cable.tsx` | Cable meter | 0 | P0 | ACCEPTABLE |
| **TOTAL** | | **28** | **P1** | **6 files need fixes** |

---

## Downstream Actions

### Immediate (Next Session)

1. **BlockEmbed MeterEmbed** — Remove hardcoded defaults or show empty state
2. **Toolbar time-sig** — Replace "4/4" with "—" or real value from snapshot
3. **Toolbar engine badge** — Replace "Engine: Live" with real state from `useEngineSnapshotStore`
4. **LiveHealth input meter** — Show empty state instead of hardcoded zero

### Medium-term (C++ Bridge Work)

1. **Per-block CPU/latency** — Add to engine snapshot
2. **Input peak metering** — Add to `onMetering` callback (Q-VU-INPUT)
3. **Time signature** — Add to engine snapshot

### Long-term (Architecture)

1. **Demo graph flag** — Add `isDemoData: true` to all demoGraph blocks
2. **Honest empty states** — Audit all components for "—" vs hardcoded fallbacks
3. **Bridge subscription audit** — Ensure all live displays have real subscriptions

---

## Cross-Reference

- **Already Fixed:** Toolbar onClick handlers (commits `350407fc`, `b106a3ed`, `04e1fe14`)
- **Already Fixed:** Engine running state (commit `f653b167`, C-2 hoist)
- **Related:** `.sisyphus/qa/deep-review.md` (Class 1 — 17 instances, now updated to 28)

