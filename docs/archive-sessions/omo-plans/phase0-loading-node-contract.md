# Phase 0 — Loading-Node Snapshot Contract

**STATUS: contract spec (Phase 0) — for Phase 2/3/4 implementers**
**Date:** 2026-06-08
**Source plan:** `.omo/plans/wave-3-leanfast-ux-plan-2026-06-08.md` Task 0.1
**Honours:** critic CRITICAL-1 (UUID identity), CRITICAL-2 (loading-node ports), MAJOR-4 (connection retention)
**Scope:** NO CODE. This is the snapshot contract for an async-loading Block. Phase 4 (Task 4.1/4.2) implements it; Phases 2/3 build against it so they tolerate `loading` and are not re-coded when Phase 4 lands.

> **Why this doc exists.** Phase 4 introduces a transient node lifecycle state — `loading` — that does not exist today (grep: zero `loadState`/`loading` hits in `webview/src/data/types.ts`, `webview/src/hooks/useJuceBridge.ts`, or `src/ui/element_webview_host.cpp`). A brand-new async-loaded plugin has **NO saved port layout**: `PlaceholderProcessor::setupFor` derives ports from *saved* node data (`src/nodes/placeholder.hpp:43` — `node.getPorts(...)` off the persisted ports ValueTree), which a live-added plugin lacks until `createPluginInstance` returns and `enableAllBuses()` runs. Every snapshot consumer (Block render 2.4, name guard 3.A, inspector routing 3.E, multi-cable 2.2) must tolerate a node that is mid-load. Specifying the shape **once, up front** is the cheap insurance.

---

## 1. The new field — `loadState`

### 1.1 TypeScript additions (exact)

A new optional field is added in **two** TS surfaces. Both are optional and **absent ⇒ `'ready'`** — this is the back-compat rule for every existing node (the host emits nothing today, so every current snapshot decodes as `ready`).

**(a) The snapshot-consumer type** — `webview/src/hooks/useJuceBridge.ts`, `type EngineBlock` (currently lines 37–72; add alongside `collapsed?` at `:60`):

```ts
  /**
   * Transient node lifecycle state (Wave-3 Phase 4 async plugin load).
   * The host emits "loading" while createPluginInstanceAsync is in flight and
   * "ready" once the real processor has swapped into the same ValueTree.
   * ABSENT ⇒ "ready" — every existing/legacy node decodes as ready (back-compat).
   */
  loadState?: "loading" | "ready";
```

**(b) The view-model type** — `webview/src/data/types.ts`, `interface BlockData` (currently lines 14–74; add alongside `collapsed?` at `:62`):

```ts
  /**
   * Transient node lifecycle state. "loading" = the real processor is still
   * being instantiated (Phase 4 async load): the Block shows an honest loading
   * face, exposes NO connectable ports, and renders at the Title-only tier.
   * "ready" = the real processor is live and ports/params are real. Absent ⇒
   * "ready" (back-compat: every node that predates async-load is ready).
   */
  loadState?: "loading" | "ready";
```

### 1.2 Host JSON key (exact)

The host writes the field in the per-Block loop of `buildActiveGraphJson` (`src/ui/element_webview_host.cpp`, the loop that today emits `id`/`name`/`identifier`/`collapsed` at `:6371`/`:6372`/`:6378`/`:6450`). The JSON key is the literal string **`loadState`**, value **`"loading"`** or **`"ready"`**:

```cpp
// Phase 4: transient lifecycle state. Emit "loading" while the async plugin
// instance is in flight; "ready" once the real processor has swapped into THIS
// ValueTree. A node with no transient-load marker is treated as ready by the
// webview (key may be omitted for ready nodes to keep the snapshot minimal).
b->setProperty ("loadState", isNodeLoading (n) ? "loading" : "ready");
```

- **Encoding:** plain JSON string, mirroring how `identifier` is emitted as a string (`:6378`). NOT an int enum on the wire — the consumers branch on the two string literals.
- **Default/omission rule:** the host MAY omit the key entirely for `ready` nodes (cheaper snapshot, byte-identical to today for the steady state — important for the Task 1.2 output-dedupe). The webview MUST treat an absent key as `"ready"`. The mapping in `mapBlock` (`useJuceBridge.ts:246`) is therefore:

```ts
    loadState: b.loadState === "loading" ? "loading" : "ready",
```

  (i.e. only the explicit `"loading"` string flips it; anything else — including absent — is `"ready"`.)

---

## 2. Identity invariant (CRITICAL-1) — keyed by UUID, swap preserves the UUID

This is the single most important rule in the contract. **A Block is keyed by the ValueTree UUID, NOT the engine integer `nodeId`.**

### 2.1 Verified facts

- The graph snapshot emits the Block id from the node **UUID**: `src/ui/element_webview_host.cpp:6371` — `b->setProperty ("id", n.getUuidString())`. (The MIDI-mapping snapshot at `:506` likewise emits `nodeId: objs.node.getUuidString()` — same UUID, different consumer.)
- The webview resolves a node back to the engine by **UUID**: `findNodeByUuidInGraph(g, uuid)` (`:279`/`:284`), iterating `n.getUuidString() == uuid`.
- The engine integer `nodeId` is a **separate, transient** identifier. It may change freely across the swap; the React Block does not see it.

### 2.2 The invariant

1. **The placeholder node carries its FINAL UUID from creation.** The instant the user adds a plugin, the placeholder node is created with the UUID it will keep forever. The first snapshot frame therefore already emits the stable `id`, so the React Block mounts once and never re-keys.
2. **The `loading → ready` swap writes into the SAME ValueTree.** When `createPluginInstanceAsync` returns, the real processor is swapped into the *existing* node tree — swap `tags::object` / `tags::type` / ports — **keeping `tags::uuid`**. It is NOT add-a-new-node-then-remove-the-old.
3. **Engine integer `nodeId` may change.** Nothing in the webview depends on it; only the UUID must be stable.

### 2.3 Anti-pattern — DO NOT route the swap through `EngineService::replace` / `ReplaceNodeMessage`

There is an existing node-replacement path an executor **will** find, and it is the **wrong tool**:

- `EngineService::replace(node, desc)` (`src/services/engineservice.cpp:1490`) does add-new → rewire-connections → remove-old.
- It is wired from the webview as `elementGraphReplacePlugin` (`src/ui/element_webview_host.cpp:2387`) → `context.services().postMessage(new ReplaceNodeMessage(n, *desc, true))` (`:2404`).
- The add-new step uses the desc-overload `ctl->addNode(&desc, x, y)` (`src/engine/graphmanager.cpp:438`), which builds a fresh `ValueTree(types::Node)` that does **not** copy `tags::uuid` → a **new** UUID is minted (`node.cpp:278`, `Uuid().toString()`).

**Consequence if misused:** wiring the `loading→ready` swap through `replace` mints a new UUID → the React Block that the user just dropped **detaches the instant the real plugin loads** — the exact "the plugin I just added vanished" symptom. The Phase-4 spec MUST call this out so nobody reaches for `replace`.

> **Open question for the Phase-4 implementer (cheap to prove):** confirm empirically that `EngineService::replace` changes a node's UUID — a one-node replace with a UUID-before/after assert. High-confidence from the source above; verify before relying on the anti-pattern claim in a code comment.

---

## 3. Cable-targetability while loading (CRITICAL-2 / MAJOR-4) — NOT targetable

**RULE: a `loading` node is NOT cable-targetable. Its React Flow handles are disabled until `loadState === 'ready'`.**

### 3.1 Rationale

A brand-new async-loaded plugin has no port layout until load completes (`PlaceholderProcessor::setupFor` needs saved port data a live-added plugin lacks — `placeholder.hpp:43`). Therefore:

- There are **no real ports** to connect to while loading.
- Forbidding connection sidesteps **CRITICAL-2** (no guessed/placeholder ports presented as connectable) AND **MAJOR-4** (no cables to re-bind on ready → the lossy `getPortForChannel` remap in `engineservice.cpp:1509–1534`, which silently drops cables on a port-index mismatch, is never exercised).
- If a future product decision wants connect-while-loading, the retention rule must be specified separately and tested with an **engine-connection** assertion (not just a React-edge assertion). The Phase-0 default is **forbid-until-ready.**

### 3.2 How the webview disables handles for a loading node

The Block component (`webview/src/components/canvas/Block.tsx`) renders React Flow `<Handle>`s per port. For a node where `data.loadState === 'loading'`:

- **Preferred:** render **zero** port handles (the loading face has no real ports to show — §4). With no handles present there is nothing to start or end a connection on. This is the cleanest expression of "nothing fake": no handle exists because no real port exists.
- **If any handle is rendered at all** (e.g. a generic edge stub for layout), it MUST set React Flow's `isConnectable={false}` so neither `onConnectStart` nor a connection-end can target it.
- The node itself SHOULD set `connectable: false` on the React Flow node object when `loadState === 'loading'`, so React Flow refuses connect-start/connect-end at the node level regardless of per-handle props.

Because §3.1 forbids connection entirely, the simplest conformant implementation is: **loading node ⇒ no handles + `connectable: false`.** When the snapshot flips to `ready`, the next render produces the real handles (real ports now exist) and `connectable` returns to its normal per-port value — no special re-bind step is needed (there were no cables).

---

## 4. Face contents while loading (nothing-fake)

The loading face MUST show, and MUST NOT show:

| Show | Do NOT show |
|---|---|
| The Block **name** (the catalog `PluginDescription.name` — see §5) | ANY meter / VU / activity bar (no signal exists yet) |
| An honest **"loading…"** indicator (text and/or a neutral spinner/shimmer; neumorphic, no glass) | ANY port handle that is not a real engine port (no fake/guessed ports) |
| The category accent (already known from the add request) is acceptable | ANY parameter row / control deck (no params exist yet) |
|  | A `cpuLoad` / `latencyMs` value > 0 (emit 0; the existing `mapBlock` already coerces absent/negative to 0) |

- **Tier:** the loading node renders at the **Title-only collapse tier** (§ collapse-tier contract `'title'`). Title-only is name + indicator only — exactly the honest minimum, and it has no port lane to populate with fake ports.
- **Principle 3 (nothing-fake) is the governing rule:** every datum on the face must be real. During loading, the only real data are the name (carried from the add request) and the fact that it is loading. Meters, ports, and params are surfaced only on `ready`.

---

## 5. Loading name (ties to Task 3.A name-coherence)

**The node carries the catalog `PluginDescription.name` from the add request, from creation.**

- When the placeholder node is created (Phase 4 Task 4.1), its `name` is set to the `PluginDescription.name` taken from the add request — the SAME field the browser shows and the SAME single-emit rule Task 3.A enforces (prefer `PluginDescription.name`, **never** `descriptiveName`).
- The snapshot already emits `b->setProperty("name", n.getName())` (`element_webview_host.cpp:6372`); for a loading node `n.getName()` is the catalog name set at creation.
- **Why:** the Task 3.A name-coherence guard (`InspectorHub` header text === canvas `Block` title text for the same selected node) must hold **mid-load**, not just on ready. Because the loading node already carries its final catalog name, the guard does not flake when Phase 4 lands. Task 3.A separately defines/asserts the loading-node name so its guard is `loadState`-aware (assert name-coherence for a `ready` node, and assert the loading node shows the catalog name).

---

## 6. On-ready transition

When `createPluginInstanceAsync` completes (callback on the message thread):

1. **Populate real ports/params into the SAME ValueTree** (the one carrying the preserved UUID, §2). The real processor's ports replace the placeholder's (which had none connectable); params become real. `enableAllBuses()` runs here (`pluginmanager.cpp:1091` — perf-diag #8, fold in). The node's `tags::object`/`tags::type` are swapped to the real processor.
2. **Flip `loadState` to `ready`** (or omit the key) on the next snapshot. The next `buildActiveGraphJson` push emits real ports, real `cpuLoad`/`latencyMs`, and `loadState: "ready"` (or omits it). The webview re-renders the Block from Title-only to its normal tier with real handles now `connectable`.
3. **Re-trigger the graph op-republish.** The swap is a **topology change** and must ride the existing whole-graph op-array republish — `GraphNode::buildRenderingSequence()` (`src/engine/graphnode.cpp:427`) → `exchange(acq_rel)` (`:491`), audio thread reads `load(acquire)` (`:633`), driven by `triggerAsyncUpdate`. It MUST **NEVER** write `activeRenderingOps` directly (RT-safety, Principle 4).

> **⚠️ OPEN QUESTION — flag for the Phase-4 implementer to verify/extend (highest engineering uncertainty).** Today only `addNode`/`removeNode` → `changed()` trigger that republish. An **in-place `tags::object` swap on a stable ValueTree may NOT** fire `triggerAsyncUpdate` / `buildRenderingSequence()` as it stands. The implementer MUST verify whether the in-place swap triggers the rebuild, and if not, **extend the trigger** so the in-place swap fires the republish. This is the single highest-uncertainty point of Phase 4; do not assume the existing trigger covers it. (Critic CRITICAL-1 step 3; plan Task 4.1 open-question #2.)

---

## 7. Consumers checklist — what each task must do for a `loading` node

Each Phase 2/3 task must tolerate `loadState === 'loading'` per the rules above. None may be "finished" against an unspecified loading shape (else it gets re-verified/re-coded when Phase 4 lands — critic CRITICAL-3).

- **Block render (Task 2.4)** — render a loading node at the **Title-only tier**: name + "loading…" indicator, **zero meters, zero port handles, zero param rows**. Node is `connectable: false`. The 3-tier cycle (double-click title) does not apply while loading (it is pinned to Title-only until ready).
- **Name guard (Task 3.A)** — assert `InspectorHub` header === `Block` title for a `ready` node; **separately** assert the loading node shows the catalog `PluginDescription.name` (§5). The guard must be `loadState`-aware so it does not flake once Phase 4 emits `loading`.
- **Inspector routing (Task 3.E)** — selecting a `loading` node renders an **honest loading state**: name + "loading…", **no parameter rows, no pin-to-face affordances** (no params exist yet). It must NOT render a Params sub-view with fabricated/empty controls presented as real. On `ready`, the next snapshot drives the normal param view.
- **Multi-cable (Task 2.2)** — a `loading` node is **not a valid connection target or source**. `onConnectStart` must not start a drag from a loading node's (non-existent / non-connectable) handle; a connection-end over a loading node must be refused. The fan-out repro/fix must be validated against `ready` nodes (a loading node legitimately has no ports to fan out of).

### Engine-truth acceptance test (named for Task 4.1)

> A node with `loadState === 'loading'` exposes **NO connectable ports** until `loadState === 'ready'`. Assert at the engine level (the node's port array is empty / no connectable handles), not merely the React-edge level. On the swap: the **UUID is preserved and the webview Block does NOT detach** (NOT "preserves nodeId"), and the in-place swap triggers the op-republish.
