# Phase 0 — Collapse-Tier Persisted-State Contract

**STATUS: contract spec (Phase 0) — for Phase 2/3/4 implementers**
**Date:** 2026-06-08
**Source plan:** `.omo/plans/wave-3-leanfast-ux-plan-2026-06-08.md` Task 0.2 (implemented as Task 2.0)
**Honours:** architect P4/S3, critic CRITICAL-3 (dual-sided migration; lands before BOTH Task 2.4 render and Task 3.E pin-to-face)
**Scope:** NO CODE. This is the dual-sided persisted-state schema change for the Block collapse tier. Reviewed ONCE here so the migration is settled before Task 2.4 (render) and Task 3.E (pin-to-face) consume it.

> **Why this is a contract, not a JS enum widening.** Widening `collapsed: boolean → collapseTier` is a **dual-sided persisted-state schema change** that crosses the C++/JS boundary AND existing `.els` files on disk:
> - The host **READS** `collapsed` into the snapshot — `src/ui/element_webview_host.cpp:6450` (`b->setProperty ("collapsed", (bool) n.getProperty (Identifier ("collapsed"), false))`).
> - The bridge `elementNodeSetCollapsed` **WRITES** a bool — `src/ui/element_webview_host.cpp:2904` (`n.setProperty (Identifier ("collapsed"), (bool) args[1])`); JS wrapper `webview/src/bridge/nativeGraph.ts:475` (`nativeGraphSetNodeCollapsed(nodeId, collapsed)`).
> - Existing `.els` files carry the old boolean on the Node ValueTree.
>
> All four surfaces (host read, host write/bridge, JS store, on-disk `.els`) must move together.

---

## 1. The enum

### 1.1 Decision — STRING enum, not numeric

**`collapseTier: 'title' | 'macro' | 'expanded'`** (a string union). **Default = `'macro'`** (the lean default — governed density, not a beginner wall; plan Principle 2).

**Justification for string over numeric:**
- The existing persisted field (`collapsed`) is a JSON **boolean**, and the whole snapshot pipeline already passes string literals for sibling fields (`identifier`, `loadState` per the loading-node contract). A string union is consistent with the codebase's wire conventions and is self-describing in the `.els` XML (`collapseTier="title"` reads better than `collapseTier="0"` for a human inspecting a project file).
- Ordinal arithmetic (`tier + 1` to cycle) is a non-feature: the double-click cycle (Task 2.4) is a 3-way switch over named cases, equally clean with strings.
- Forward-compat (§4) is easier to reason about with named values an old build can pattern-match or fall through.

### 1.2 Tier semantics (for Task 2.4 render)

| Tier | Meaning |
|---|---|
| `'title'` | Title-only — header (name + chrome) only. Also the tier a **loading** node renders at (see loading-node contract §4). |
| `'macro'` | **Lean default** — header + a curated Macro row (pinned params / activity well). The default for a newly-added ready Block. |
| `'expanded'` | Full — header + full control deck / all params. |

---

## 2. TypeScript type change (`webview/src/data/types.ts`)

Replace the current `collapsed?: boolean` (`types.ts:62`) on `interface BlockData` with the tier:

```ts
  /**
   * Persisted collapse TIER (Wave-3 Task 2.0; widens the legacy `collapsed`
   * boolean). 'title' = header only · 'macro' = header + curated Macro row
   * (lean default) · 'expanded' = full control deck. Persisted in the Node
   * ValueTree as the "collapseTier" string property (see contract). Double-click
   * title cycles (Task 2.4). A loading node is pinned to 'title'.
   * ABSENT ⇒ 'macro' (the lean default) — and a legacy node that only carried
   * the old boolean is migrated: collapsed=true → 'title', false → 'macro'.
   */
  collapseTier?: "title" | "macro" | "expanded";
```

The snapshot-consumer type `EngineBlock` (`webview/src/hooks/useJuceBridge.ts:60`, currently `collapsed?: boolean`) is widened the same way:

```ts
  /** Persisted collapse tier (ValueTree "collapseTier"; Task 2.0). Host may
   *  still emit a legacy "collapsed" boolean from an old .els — see migration. */
  collapseTier?: "title" | "macro" | "expanded";
  /** Legacy boolean (pre-Wave-3). Read for back-compat migration only. */
  collapsed?: boolean;
```

> **Keep the legacy `collapsed?: boolean` on `EngineBlock`** (not on `BlockData`) so the JS read path can detect and migrate an old-shape snapshot (see §3.2). `BlockData` carries only the new `collapseTier`.

---

## 3. ValueTree key + dual-sided migration

### 3.1 The ValueTree key

- **New key:** `collapseTier` (a `juce::Identifier`), value = the string `"title"` / `"macro"` / `"expanded"`.
- **Legacy key:** `collapsed` (boolean) — retained for read-migration; see §4 for whether it is also written.

**Host READ path** — `src/ui/element_webview_host.cpp:6450` changes from emitting the bool to emitting the tier, coercing a legacy value:

```cpp
// Persisted collapse tier (Task 2.0; widens the legacy "collapsed" bool).
// Migration on read: if the node has "collapseTier", emit it. Else if it has a
// legacy "collapsed" bool, coerce true→"title", false→"macro". Else default
// "macro" (the lean default). Round-trips save/load with the tree.
b->setProperty ("collapseTier", readCollapseTier (n));   // helper does the coercion below
```

where `readCollapseTier(n)` is:
- if `n.hasProperty("collapseTier")` → return that string (validated to one of the three; unknown → `"macro"`);
- else if `n.hasProperty("collapsed")` → `(bool) → "title" : "macro"`;
- else → `"macro"`.

**Host WRITE path / bridge** — see §3.3.

### 3.2 JS migration (the second side)

`mapBlock` in `webview/src/hooks/useJuceBridge.ts:281` currently maps `collapsed: b.collapsed === true`. It changes to emit `collapseTier`, coercing both a legacy boolean and an absent value:

```ts
    // Collapse tier (Task 2.0). Prefer the new "collapseTier"; migrate a legacy
    // boolean snapshot (collapsed=true → "title", false → "macro"); default to
    // "macro" (lean) when neither is present.
    collapseTier:
      b.collapseTier === "title" ||
      b.collapseTier === "macro" ||
      b.collapseTier === "expanded"
        ? b.collapseTier
        : b.collapsed === true
          ? "title"
          : "macro",
```

> **Both read paths coerce identically: legacy `collapsed=true → 'title'`, `collapsed=false → 'macro'`, absent → `'macro'`.** The host coercion is defence-in-depth (an old `.els` opened by a new host); the JS coercion handles the same shape if the host ever forwards a legacy boolean. Specifying it on BOTH sides is the critic CRITICAL-3 requirement.

### 3.3 The bridge signature change

The bridge becomes tier-aware on **all three** layers. The existing bool-typed `elementNodeSetCollapsed` is **replaced** by a tier-typed `elementNodeSetCollapseTier`.

**JS wrapper** — `webview/src/bridge/nativeGraph.ts:475` (`nativeGraphSetNodeCollapsed`) becomes:

```ts
export async function nativeGraphSetNodeCollapseTier(
  nodeId: string,
  tier: "title" | "macro" | "expanded",
): Promise<boolean> {
  const r = await invokeElementNative("elementNodeSetCollapseTier", [
    nodeId,
    tier,
  ]);
  return r === true;
}
```

**Store action** — `webview/src/stores/useGraphStore.ts` (`setCollapsed` at `:256` type / `:600` impl) becomes `setCollapseTier(nodeId: string, tier: "title"|"macro"|"expanded") => Promise<void>`, keeping the same optimistic-set-then-revert-on-reject shape it has today (it currently flips `collapsed` optimistically and reverts via `prev` on bridge failure — preserve that pattern with `prevTier`).

**Host handler** — `src/ui/element_webview_host.cpp:2891` (`elementNodeSetCollapsed`) becomes `elementNodeSetCollapseTier`:

```cpp
// args[0] = nodeUuid : String   args[1] = tier : String ("title"|"macro"|"expanded")  → bool
registerFn (Identifier ("elementNodeSetCollapseTier"),
  [this, postCompletion] (const Array<var>& args, auto completion) {
    bool ok = false;
    if (args.size() >= 2)
      if (auto sess = context.session()) {
        const Graph G (currentBoard());
        if (G.isGraph()) {
          Node n = findNodeByUuidInGraph (G, args[0].toString());
          if (n.isValid()) {
            const String tier = validateTier (args[1].toString());   // unknown → "macro"
            n.setProperty (Identifier ("collapseTier"), tier);
            // (see §4) optionally also keep "collapsed" in sync for old-build round-trip
            ok = true;
          }
        }
      }
    if (ok) scheduleGraphPush (40);   // write-on-click; static graph still pushes nothing
    postCompletion (completion, ok);
  });
```

- The handler still resolves the node by **UUID** (`findNodeByUuidInGraph`, `:279`) and still schedules the 40 ms coalesced push — a purely visual per-Block property, no audio/RT path (identical RT profile to the bool version today).
- **Block.tsx callsite** — `webview/src/components/canvas/Block.tsx:1064` (`void setCollapsed(d.id, !collapsed)`) is replaced by the Task 2.4 double-click-title cycle calling `setCollapseTier(d.id, nextTier(current))`.

---

## 4. On-disk `.els` back-compat (decision to surface — NOT silently assumed)

The owner-facing decision: **does a new `collapseTier` serialize to something an OLD build can still open, or is this a forward-incompatible bump?**

### 4.1 Decision (recommended)

**Forward-tolerant, dual-write.** On write, the host writes BOTH:
- `collapseTier` (the new string) — the source of truth for new builds, and
- `collapsed` (a derived legacy boolean: `tier === 'title' → true`, else `false`).

**Consequences:**
- **New build opens an OLD `.els`** (only `collapsed`): handled by the read-migration in §3.1 (`collapsed=true → 'title'`, `false → 'macro'`). ✅ no data loss.
- **OLD build opens a NEW `.els`** (has both keys): the old build reads `collapsed` and ignores the unknown `collapseTier` property (JUCE `ValueTree` silently retains unknown properties on load and round-trips them on save). So an old build sees the project as collapsed/expanded (degraded from 3 tiers to 2) but does **not** corrupt or drop the file, and `collapseTier` survives a save-by-old-build round-trip. ✅ forward-tolerant, lossy-but-safe.
- **Cost:** one extra derived boolean per collapsed node in the `.els`. Negligible.

### 4.2 Alternative (surface, not chosen)

**Forward-incompatible bump** — write only `collapseTier`, bump the session/format version, and have an old build either refuse or default-all-to-expanded. Rejected for Wave-3: it strands any project saved by a new build from opening cleanly in a shipped older build, for a purely cosmetic field. The dual-write in §4.1 gives the same new-build fidelity with graceful old-build degradation.

> **Owner decision point:** §4.1 (dual-write, forward-tolerant) is the recommendation. If the owner prefers a clean single-key format and is willing to accept old-build incompatibility, take §4.2 and bump the format version. Default to §4.1.

---

## 5. The collapsed-socket rule (engine-truth) — collapsing must NOT drop cables

**RULE: collapsing a Block to the Title-only tier MUST NOT drop any cable. The ENGINE `Arc` survives; only the visual port presentation changes.**

- When a Block is at `'title'` (no visible port lane), cables that terminate on its ports must still render — routed into the **node edge / a port stub** (Blender's collapsed-socket model, plan Task 2.4 / research §B). The cable does not disappear; it docks to the node body.
- This is **purely a webview render concern.** The collapse tier is a visual property (`collapseTier` on the Node ValueTree) that the host writes write-on-click; it does **NOT** touch the engine graph, does **NOT** remove ports, and does **NOT** delete the `Arc`. The engine connection is untouched by collapse.

### Engine-truth assertion (named for Task 2.4)

> Collapsing a connected Block to `'title'` and re-expanding it MUST leave the **engine `Arc` intact** — assert at the engine/connection level (the `Arc` still exists between the same two ports), NOT merely that a React edge is still drawn. A visual stub hiding a severed connection would be a Principle-3 (nothing-fake) violation. (Architect P4-socket / critic MAJOR-? engine-truth.)

---

## 6. Sequencing + acceptance

- **Lands as Task 2.0**, BEFORE both Task 2.4 (Block render of the 3 tiers) and Task 3.E (per-param pin-to-face, which surfaces params on the Macro tier that only exists once this contract lands). Sequence: **2.0 → 2.4 → 3.E** (critic CRITICAL-3).
- **Host edits** (`:2904` write/handler, `:6450` read) are serialized to the single `element_webview_host.cpp` actor (plan HOST-FILE SERIALISATION RULE / critic MAJOR-6 — this file is touched by 5 tasks across 3 phases).

**Acceptance (the contract is settled when all are green):**
1. The tier enum + ValueTree key (`collapseTier`) are fixed and shared by Task 2.4 and Task 3.E.
2. The bridge signature is tier-aware on all three layers (JS wrapper / store / host handler), resolving by UUID, same 40 ms coalesced-push profile.
3. **Dual-sided migration** is specified and tested on BOTH read paths: a `.els`/ValueTree with legacy `collapsed=true` → snapshot/store yields `'title'`; `collapsed=false` → `'macro'`; absent → `'macro'`.
4. **On-disk round-trip** per §4: an old `.els` opens in a new build (migrated); a new `.els` round-trips through an old build without corruption (dual-write).
5. **Collapsed-socket engine-truth:** collapse→expand leaves the engine `Arc` intact (engine-level assertion).
