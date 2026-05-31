# Selector Repro Audit — Verdict per Derived Selector

**Plan item:** 3 (Wave-1 investigation). **Branch:** `local-enhancements`.
**Scope:** Zustand v5 derived-selector loop risk ("Maximum update depth exceeded" / "getSnapshot should be cached").
**Mode:** INVESTIGATION ONLY — no production source or test was modified.

## TL;DR

| Outcome | Count |
|---------|-------|
| Selectors flagged for investigation | 8 consumer groups (11 underlying selectors) |
| **reproduced-loop → must be fixed in item 8** | **0** |
| safe (evidence-backed, no loop) | 11 |
| suspected-only → document + defer | 0 |
| Synthetic harness CONTROLS that DID loop (prove harness sensitivity) | 2 |

**Bottom line for item 8: there is NOTHING to fix.** No production selector — exported or inline, in any store — reproduces the Zustand v5 update-depth / getSnapshot loop. Every flagged selector returns either a raw store-field reference or the result of `.find()` (an existing element ref or `undefined`); none allocates a fresh array/object/Set in the selector body. The single already-fixed `useShallow` template (`BlockEmbed.tsx`) is the correct pattern and was confirmed loop-free.

The only loops in the captured run were two **synthetic control selectors** the harness deliberately injected (`selectScenesMap` returning a fresh `.map` array; an object-literal selector). They loop exactly as designed, which proves the harness can detect a real loop — and by contrast proves the real selectors do not have one.

---

## Why these selectors are structurally safe (the mechanism)

The Zustand v5 + React `useSyncExternalStore` loop fires only when a selector returns a **newly-allocated** value (`Object.is` always false) on each call: fresh `.map`/`.filter`/`.slice`/`.concat`/`.reduce` result, array literal `[...]`, object literal `{...}`, spread, `new Array/Set/Map`, or `Object.keys/values/entries`. React then re-renders → re-runs the selector → gets another fresh value → re-renders, forever.

A selector is **safe** when it returns:
- a **raw store field reference** (`s.x`) — identity stable until the store actually replaces it; or
- a **primitive** (number/string/boolean) — compared by value; or
- the result of **`.find()` / `.findIndex()`** — returns an *existing* element reference (or `undefined`), never a new container.

All 11 flagged selectors fall into one of those three buckets. Allocation that does happen (e.g. `allNodes.filter(...)`, `nativePlugins.map(...)`, `lines.slice(-300)`) occurs in the **component body or a `useMemo`** *after* the selector has returned a stable ref — it does not feed back into the store subscription's equality check, so it cannot drive the loop.

---

## Verdict table

`file:line` = definition site for exported selectors, consumer call-site for inline selectors. "Derived shape" = what the selector callback returns. Populated / empty = `loop_signature_present` in the captured Playwright console for that store state.

| # | Selector | file:line | Derived shape | Populated store | Empty store | Verdict | Repro / evidence path |
|---|----------|-----------|---------------|-----------------|-------------|---------|------------------------|
| 1 | `usePerformStore.selectActiveScene` | `webview/src/stores/usePerformStore.ts:246` | `s.scenes.find(sc => sc.active)` → existing element ref \| `undefined` (no alloc) | no loop (renders=2) | no loop (renders=2) | **safe** | `.omo/evidence/task-3-selectActiveScene-console.txt` / `-empty.txt`; vitest line 3 |
| 2 | `usePerformStore.selectAlerts` | `webview/src/stores/usePerformStore.ts:252` | `s.liveHealth.alerts` → raw array ref (no alloc) | no loop (renders=2) | no loop (renders=2) | **safe** | `.omo/evidence/task-3-selectAlerts-console.txt` / `-empty.txt`; vitest line 4 |
| 3 | `usePerformStore.selectMappedParameters` | `webview/src/stores/usePerformStore.ts:244` | `s.mappedParameters` → raw `Set` ref (no alloc) | no loop (renders=2) | no loop (renders=2) | **safe** | `.omo/evidence/task-3-selectMappedParameters-console.txt` / `-empty.txt`; vitest line 5 |
| 4 | `useGraphStore.selectSelectedNode` | `webview/src/stores/useGraphStore.ts:432` | `s.selectedNodeId ? s.nodes.find(...) : undefined` → existing ref \| `undefined` (no alloc) | no loop (renders=2) | no loop (renders=2) | **safe** | `.omo/evidence/task-3-selectSelectedNode-console.txt` / `-empty.txt`; vitest line 6 |
| 5 | `useGraphStore.selectSelectedEdge` | `webview/src/stores/useGraphStore.ts:435` | `s.selectedEdgeId ? s.edges.find(...) : undefined` → existing ref \| `undefined` (no alloc) | no loop (renders=2)¹ | no loop (renders=2) | **safe** | `.omo/evidence/task-3-selectSelectedEdge-console.txt` / `-empty.txt`; vitest line 7 |
| 6 | `useDashboardStore.selectWidgets` | `webview/src/stores/useDashboardStore.ts:154` | `s.widgets` → raw array ref (no alloc) | no loop (renders=2) | no loop (renders=2) | **safe** | `.omo/evidence/task-3-selectWidgets-console.txt` / `-empty.txt`; vitest line 8 |
| 7 | `usePluginBrowserStore` — `s.plugins` (inline) | `webview/src/components/canvas/QuickAddPopup.tsx:122` | `s.plugins` → raw array ref (no alloc); `.map` is in a downstream `useMemo` at L130–131 | no loop (renders=2) | no loop (renders=2) | **safe** | `.omo/evidence/task-3-pluginBrowser-arrays-console.txt` / `-empty.txt`; vitest line 9 |
| 8 | `usePluginBrowserStore` — `s.favoriteIdentifiers` (inline) | `webview/src/components/canvas/QuickAddPopup.tsx:123` | `s.favoriteIdentifiers` → raw `Set` ref (no alloc) | no loop (renders=2) | no loop (renders=2) | **safe** | vitest line 10; story consumer `layout-toolpalette--*` (pluginBrowser-arrays evidence) |
| 9 | `usePluginBrowserStore` — `s.recentIdentifiers` (inline) | `webview/src/components/canvas/CommandPalette.tsx:102` | `s.recentIdentifiers` → raw array ref (no alloc); the `.map`/`new Map` is in downstream `useMemo` (`orderedPlugins`, CommandPalette L120–122) | no loop (renders=2) | no loop (renders=2) | **safe** | vitest line 11 |
| 10 | `useHostExtrasStore` — `s.molecules` (inline) | `webview/src/stores/useHostExtrasStore.ts` field (consumed inline) | raw array ref (no alloc) | no loop (renders=2) | no loop (renders=2) | **safe** | vitest line 12 |
| 11 | `useHostExtrasStore` — `s.logLines` (inline) | `webview/src/components/layout/InspectorHub.tsx:504` | `s.logLines` → raw array ref (no alloc); `.slice(-300)` is in component body at L505, not in selector | no loop (renders=2) | no loop (renders=2) | **safe** | vitest line 13; structural-sweep §B |
| T | `BlockEmbed` (already-fixed `useShallow` template) | `webview/src/components/canvas/BlockEmbed.tsx:122` | `useShallow((st) => {...})` element-compares & caches | no loop | no loop | **safe (reference template)** | `.omo/evidence/task-3-BlockEmbed-FIXEDtemplate-console.txt` / `-empty.txt` |

### Additional inline brace-body selector found during re-verification (not in original 8, swept to closure)

| # | Selector | file:line | Derived shape | Verdict | Evidence |
|---|----------|-----------|---------------|---------|----------|
| 12 | `useGraphStore` — `fanOffset` (inline brace body) | `webview/src/components/canvas/Cable.tsx:86` | block body computes via `.find`/`.filter`/`.findIndex` but **returns a NUMBER** (`0` or float); transient arrays are NOT returned → primitive, `Object.is`-stable | **safe** | `.omo/evidence/task-3-exhaustiveness-reverify.txt` §C; source `Cable.tsx:86–96` |

> **¹ Branch-coverage note (row 5, `selectSelectedEdge`).** The populated story used by the harness (`layout-inspectorhub--bypassed-block-selected`, `InspectorHub.stories.tsx:181–190`) sets `selectedNodeId: "sel-byp"` but does **not** set `selectedEdgeId`. So at runtime this selector exercises only the `selectedEdgeId ? … : undefined` short-circuit (returns `undefined`), not the `s.edges.find(...)` branch. The "no loop" verdict for the edge-selected branch therefore rests on **static no-allocation analysis** (`.find()` returns an existing element ref or `undefined` — no allocation in either branch), which is conclusive regardless of branch. By contrast, row 4 (`selectSelectedNode`) *is* fully runtime-exercised: its populated story `layout-inspectorhub--generator-selected` sets `selectedNodeId`, so the `s.nodes.find(...)` branch actually runs and still shows no loop.

---

## Synthetic CONTROLS (prove the harness is sensitive — NOT production code, NOT to be "fixed")

| Control selector | Derived shape | Populated | Empty | Note |
|------------------|---------------|-----------|-------|------|
| `selectScenesMap` (CTRL) | fresh `s.scenes.map(...)` array each call | **LOOP** (renders=109) | **LOOP** (renders=109) | injected to prove a real loop is detectable |
| obj-literal (CTRL) | `{ ... }` fresh object each call | **LOOP** (renders=109) | (empty) | injected to prove object-identity loop detectable |

Source: `.omo/evidence/task-3-vitest-results.txt` lines 1–2. These confirm the harness's `renders` instrumentation jumps from the stable baseline of **2** to **109** when (and only when) a selector truly allocates. Every real selector held at **renders=2**.

---

## Structural sweep — inventory completeness (attached proof)

Two sweeps were run; the second (this audit's re-verification) supersedes and confirms the first.

**Original sweep:** `.omo/evidence/task-3-structural-sweep.txt`
**Re-verification sweep (this audit):** `.omo/evidence/task-3-exhaustiveness-reverify.txt`

Re-verification findings (verbatim categories):

- **All store files enumerated** (11 stores): `useAppStore`(10), `useBusStore`(3), `useCableMeterStore`(0), `useDashboardStore`(4), `useEngineSnapshotStore`(14), `useGraphStore`(10), `useHostExtrasStore`(0), `useParameterStore`(1), `usePerformStore`(15), `usePluginBrowserStore`(0), `useSessionStore`(1).
- **§B — exported selectors that allocate in body, across ALL stores:** **NONE.** (PCRE2 scan for `=> [` / `=> {` returning a literal, `.map(`/`.filter(`/`.slice(`/`.concat(`/`.reduce(`, `new Array/Set/Map`, `Object.keys/values/entries/assign` within the selector definition.)
- **§C — inline brace-body store selectors `useXxxStore((s) => { ... })`:** exactly **one** — `Cable.tsx:86` — and it returns a primitive number (safe, item 12 above).
- **§D — inline selectors returning an array/object literal directly `useXxxStore((s) => [` or `{`:** **NONE.**
- **§E — `useShallow` occurrences (the applied fix pattern):** only `BlockEmbed.tsx` (the reference template).
- **§F — named-function selector args `useXxxStore(identifier)` (not inline arrow):** every such call-site passes one of the exported `select*` functions (e.g. `useGraphStore(selectNodes)`, `usePerformStore(selectActiveScene)`, `useEngineSnapshotStore(selectTransportPlaying)`, …). There are **no** anonymous/local non-`select`-prefixed selector functions. Because §B already proved **zero** exported selectors allocate, every named-function call-site is therefore safe by transitivity. (Scan: `rg --pcre2 'use[A-Z][A-Za-z]*Store\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*[,)]' src` → all hits resolve to exported `select*`.)

This is exhaustive: the loop requires an allocation **returned from the selector callback**. §B rules it out for every exported selector; §C+§D rule it out for every inline arrow selector; §F rules it out for every named-function call-site. The three selector-passing forms (exported `select*`, inline arrow, named-function arg) are the only ways to feed Zustand a selector — so the pattern space is literally closed, not merely inferred.

> Note on `useEngineSnapshotStore` (14 selectors) and `useAppStore` (10): although outside the original 8-item flagged set, the §B exhaustive scan covered them too and found zero allocating selectors, so they carry no loop risk and need no fix.

---

## Methodology / evidence provenance

- **Runtime repro:** Storybook (`:6006`) + Playwright headless, capturing `console` + `pageerror` and asserting absence of `"Maximum update depth exceeded"` / `"getSnapshot should be cached"`. Harness: `.omo/evidence/task3-playwright-runner.mjs`. Each flagged consumer was visited in a POPULATED and an EMPTY store state; per-selector console transcripts are the `task-3-<selector>-console.txt` / `-empty.txt` files cited above. All show `loop_signature_present: false`.
- **Render-count instrumentation:** `.omo/evidence/task-3-vitest-results.txt` — baseline `renders=2` for every real selector vs `renders=109` for the synthetic loop controls.
- **Static exhaustiveness:** `rg --pcre2` sweeps over `webview/src/**` (excluding `*.test.*` / `*.stories.*`), captured in `.omo/evidence/task-3-exhaustiveness-reverify.txt`.
- **Source confirmation of derived shapes:** read directly from `usePerformStore.ts:243–261`, `useGraphStore.ts:429–436`, `useDashboardStore.ts:154`, `Cable.tsx:86–96`, `MacroDashboard.tsx:55–57`, `QuickAddPopup.tsx:122–131`, `InspectorHub.tsx:504–505`.

## Hand-off to item 8 (fix wave)

**Fix list: empty.** No selector reproduces a loop, so item 8 has no selector to convert to `useShallow` or memoise. Any selector churn here would be speculative and is explicitly out of scope per the plan's "ONLY selectors with a REPRODUCED loop get a fix."

Keep `BlockEmbed.tsx`'s `useShallow` as the canonical template **if** a future selector is ever introduced that must return a fresh array/object — but none exists today.
