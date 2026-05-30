# G-29 — Bus Send/Receive C++ node — DISCOVERY spec

**Lane:** Wave-0.5 / Task 5 (F3). **Status:** read-only discovery, no code written.
**Author:** worker-spike. **Date:** 2026-05-30.
**Consumes →** Task 14 (C++ impl), Task 15 (build/evidence), Task 16 (BlockEmbed info-card), Task 13 (SessionTree terminology), Task 17 (Cable bus repr).

---

## 0. Verdicts up front

> **PRIMARY verdict — TRANSPORT (this is the consequential call):**
> Recommend **Package B — auto-managed hidden arcs ("reskinned wireless")** for v1.
> Engine untouched; reuses proven routing, latency-comp and feedback handling.
> The heavier **Package A — engine bus-buffer broadcast** is the principled "true
> teleport" alternative but adds net-new *audio-thread* code (ordering, cycle guard,
> lock-free handoff). **Glen decision required** (see §9) — A vs B changes the answers
> to (e)/(f)/(g)/(h), so it must be settled before Task 14 starts.

> **SECONDARY verdict — NODE SHAPE:** **2-node** (`BusSendNode` + `BusReceiveNode`),
> NOT single-node-with-mix. Rationale in §8. This holds under *both* transport packages.

> **Hard coherence rule (the trap to avoid):** an Arc runs *(srcNode, **output** port) →
> (dstNode, **input** port)* — confirmed by the snapshot reader at
> `src/ui/element_webview_host.cpp:4334-4346` (`tags::sourceNode/sourcePort`,
> signal typed from `srcNode.getPort(spi)`). Therefore **port profile is dictated by
> transport**, they cannot be chosen independently:
> - **Package B (hidden arc):** Send = **in + out**, Receive = **in + out** (a real arc
>   must leave Send's output and enter Receive's input).
> - **Package A (bus buffer):** Send = **inputs only**, Receive = **outputs only** (no arc,
>   so no output port needed on Send).

---

## 1. Baseline — what "wireless bus" actually is today (b)

The current "Wireless" cable (G-29 target) is **NOT a separate transport**. It is an
**ordinary graph Arc whose visual curve is suppressed and replaced by a named-bus badge.**
The engine connection is a normal point-to-point Arc; "wireless" is purely a render
convention. Evidence:

| Concern | Where | Note |
|---|---|---|
| Front-end source of truth | `webview/src/stores/useBusStore.ts:27-71` | `cableBus: Record<cableId, busName>`; `setBusForCable`, `renameBus`, `clearAll`. |
| Bus list / endpoints derivation | `webview/src/stores/useBusStore.ts:108-135` (`deriveBuses`) | endpoints carry `{blockId, portId, direction:"source"|"target"}`. |
| Default-name helper | `webview/src/stores/useBusStore.ts:141-149` (`suggestBusName` → "Bus 1"…). |
| Bridge call (JS→C++) | `webview/src/bridge/nativeGraph.ts:106-115` (`nativeGraphSetCableBus(cableId, busName)`). |
| C++ handler | `src/ui/element_webview_host.cpp:2551-2617` (`elementGraphSetCableBus`) | parses `cable_<srcUuid>_<srcPort>_<dstUuid>_<dstPort>_<arcIdx>`, finds the matching Arc, sets/removes `busName` **on the Arc ValueTree** (`:2605-2608`). |
| Persistence (round-trip) | Arc property `busName` (`:2608`) re-emitted in snapshot at `src/ui/element_webview_host.cpp:4359-4361`. Re-seeded into `useBusStore` on hydrate: `webview/src/stores/useGraphStore.ts:269-278`. |
| Visual consumer | `BusInspector` (`webview/src/components/layout/BusInspector.stories.tsx:7-18`) + Cable "wireless ghost" render (per plan §Grounded arch: `Cable.tsx:138-159`). |

**What removing wireless breaks (and how to contain it):**
- `useBusStore` + `nativeGraphSetCableBus` + the Arc `busName` property become **obsolete
  for authoring** but can stay readable (back-compat, §7/§10). G-05 **BusInspector must be
  re-pointed** from the `cableBus` map to *bus nodes* (the new source of truth).
- The Cable "wireless ghost" render path (`Cable.tsx`) loses its trigger; Task 17 (cable
  owner) handles removing/repurposing it.
- No **engine** breakage: the underlying Arcs were always real, so deleting the wireless
  *render convention* does not change audio routing.

---

## 2. NodeFactory registration pattern + exact site (a)

- **Registration site:** `src/engine/nodefactory.cpp:117-149` — the `NodeFactory()`
  constructor. Each internal node is one line:
  ```cpp
  add (new SingleNodeProvider<RerouteNode> (EL_NODE_ID_REROUTE));   // :128
  ```
  `SingleNodeProvider<NT>` is defined at `src/engine/nodefactory.cpp:75-96` (templated,
  `create()` does `this->ID == nodeId ? new NT() : nullptr`).
- **Header include** for the new node goes at the top alongside `#include "nodes/reroutenode.hpp"`
  (`src/engine/nodefactory.cpp:17`).
- **ID + UID constants** live in `include/element/node.h`:
  - String IDs block `:34-49` (e.g. `EL_NODE_ID_REROUTE "element.reroute"` `:47`).
  - Numeric UIDs block `:52-82` — **highest in use is `EL_NODE_UID_MIDI_REROUTE 1031`
    (`:82`)**, so the next free UIDs are **1032 / 1033**.
  - Add e.g. `EL_NODE_ID_BUS_SEND "element.busSend"`, `EL_NODE_ID_BUS_RECEIVE "element.busReceive"`,
    `EL_NODE_UID_BUS_SEND 1032`, `EL_NODE_UID_BUS_RECEIVE 1033`.
- **Visibility:** internal nodes are visible by default (only `el.MCU` is `hideType`'d in
  release, `src/engine/nodefactory.cpp:131-134`). No hide needed.
- **GLOB_RECURSE:** new `.hpp`/`.cpp` require a CMake **reconfigure** before build
  (`.claude/skills/add-node/SKILL.md:92-99`). Task 15 owns this.

---

## 3. Closest existing analogs to copy (c)

| Need | Copy from | Why |
|---|---|---|
| **Pure pass-through endpoint** (Package B Send/Receive — render does nothing, signal carried by graph routing) | `src/nodes/reroutenode.hpp:15-126` (`RerouteNode`) | Header-only, `render()` is a **no-op** (`:40-60`), ports declared in `refreshPorts()` (`:88-110`), tiny state = a `Mode` enum (`:62-71`). RT-trivially-safe. The Audio/Midi/Both `Mode` split (`:18-23`) is the exact pattern for Bus audio-vs-midi variants. |
| **Sub-classing one base into named variants** | `AudioRerouteNode` / `MidiRerouteNode` (`src/nodes/reroutenode.hpp:128-164`) | Shows the "one base, override `getPluginDescription`" idiom — reuse for `BusSendNode`/`BusReceiveNode` sharing a `BusNodeBase`. |
| **ValueTree state + mix/matrix + programs** (only if Package A or a mix knob is needed) | `src/nodes/audiorouter.{hpp,cpp}` | `prepareToRender` pre-allocates `tempAudio` (`audiorouter.hpp:20-26`); channel-count guard (`audiorouter.cpp:180-185`); `getState/setState` via `MatrixState` ValueTree (`audiorouter.cpp:298-333`). **CAUTION:** AudioRouter takes a `ScopedLock` *inside* `render()` (`audiorouter.cpp:191, 286`) — a pre-existing exception, **do NOT copy it** into a new node (see §11). |
| **Multi-MIDI-output buffering** (if Receive fans MIDI) | `src/nodes/midirouter.hpp:103-104` (`OwnedArray<MidiBuffer> midiOuts`). |

For **v1 / Package B**, the Bus nodes are essentially Reroute-with-identity → copy `RerouteNode`.

---

## 4. Send ↔ Receive identity model (d)

- **Today's model is name-keyed free text** (`useBusStore` keys on a display string like
  "Reverb Send A"; `suggestBusName` produces "Bus 1", "Bus 2"… `useBusStore.ts:141-149`).
- **Recommendation:** keep **name-keyed identity** for the nodes (consistency with the
  existing UX + BusInspector endpoint model), stored in **node state** via
  `getState/setState` (pattern: `reroutenode.hpp:62-71`). A node editor dropdown picks an
  existing bus name or creates a new one.
- **Fan-out is the core use case** (one reverb Send → many Receive taps) — the identity is
  therefore **1 Send name → N Receives** (broadcast). Decide whether **N Sends → 1 bus** is
  *summed* or *rejected*; recommend **summed** (matches aux-bus mental model, and the engine
  mix path already sums multiple inputs into a port — `graphbuilder.cpp:738-792`).
- **Hazard:** name collisions / renames. `useBusStore.renameBus` (`:57-66`) already does a
  bulk rename; the node model needs the equivalent (rename a bus → update all nodes carrying
  that name). A stable integer/uuid bus-id + a separate display name is the more robust
  alternative — flag as a design nicety, not required for v1.
- **Package B linkage:** the bridge matches Send↔Receive **by bus name** and auto-creates/
  destroys the hidden Arc(s) between `BusSend.busOutputPort` → each `BusReceive.busInputPort`
  on name add/rename/delete (this arc-lifecycle code is **net-new, message-thread, owned by
  Task 14** — see §9/B).
- **Package A linkage:** the bus name keys a shared **bus-buffer registry**; Send writes,
  matching Receives read. No arc.

---

## 5. Cycle / feedback handling (e)

**Finding:** the engine **already degrades feedback loops gracefully** at graph-build time —
when a source buffer is unavailable because of a cycle, the builder substitutes a *read-only
empty* buffer (audio) or clears it (MIDI), so there is no crash and no infinite loop; the
back-edge simply reads silence (one-block break):
- Single-input path: `src/engine/graphbuilder.cpp:694-699` — `bufIndex < 0` →
  `getReadOnlyEmptyBuffer()` with comment *"if not found, this is probably a feedback loop"*.
- Mixed-input path: `src/engine/graphbuilder.cpp:777-785` — `srcIndex < 0` →
  `ClearChannelOp` (audio) / `ClearMidiBufferOp` (MIDI), same comment.

**Consequence per package:**
- **Package B (hidden arc):** cycle safety is **FREE** — Send→Receive→…→Send forms a normal
  arc cycle and the builder handles it exactly as above. **No new code.**
- **Package A (bus buffer):** the builder never sees an arc, so this guard **does NOT fire**.
  A Receive that reads a bus written *later* in the same block gets stale/one-block-delayed or
  silent data, and a Send↔Receive cycle has no protection. Task 14 would have to **rebuild an
  equivalent guard** + define a deterministic ordering rule. This is the single biggest reason
  to prefer B for v1.

---

## 6. Channel-count / mismatch behaviour (f)

- **Reroute** uses a **fixed profile**: stereo audio in/out + MIDI in/out, declared in
  `reroutenode.hpp:88-110`. **Recommend the same fixed profile** for Bus nodes (stereo audio
  + MIDI), gated by an audio/midi/both `Mode` like Reroute.
- **AudioRouter** demonstrates the **mismatch guard**: `if (numSources > numChannels || numDestinations > numChannels) { rc.audio.clear(); rc.midi.clear(); return; }` (`audiorouter.cpp:180-185`).
- **Recommended behaviour:** a Send and its matching Receive **should share the same channel
  layout**. On mismatch (e.g. mono bus into a stereo Receive), missing channels read **empty**
  via the engine's `ClearChannelOp` for unconnected ports — degrade to silence on the missing
  channel, **never crash**. Document this as the contract; do not attempt auto-up/down-mix in v1.
- Under **Package B** this is automatic (the hidden arc + standard buffer routing handles it).
  Under **Package A** the bus-buffer registry must define a fixed channel width per bus and
  the Send/Receive copy loops must bounds-check against it.

---

## 7. Bridge surface for node runtime data (g)

**Where node metadata is emitted:** the block snapshot loop in
`src/ui/element_webview_host.cpp:4247-4327` (inside `buildGraphSnapshotJson`). Per block it
already emits: `id` (uuid `:4251`), `name` (`:4252`), `format` (`:4258`), `category` (`:4271`),
`x/y` (`:4275-4276`), `bypassed/muted/muteInput` (`:4277-4279`), `isContainer` (`:4280`),
`color` (`:4286`), `note` (`:4287`), `cpuLoad` (`:4308`), `latencyMs` (`:4309`), and `ports[]`
(`:4311-4324`).

To surface Bus-node runtime data to the webview Block / BlockEmbed info-card (Task 16):

1. **Bus identity / role** — add `b->setProperty("busId", …)` and `b->setProperty("busRole", "send"|"receive")`
   near `:4287`, read from node state. (Or encode in `name`, but a structured field is cleaner.)
2. **Category** — `mapBlockCategory(n, pluginCategory)` (`:4271`) delegates to
   `mapBlockCategoryFromStrings` (`src/ui/blockcategory.hpp:27-62`). **GAP:** a node named
   *"Bus Send"/"Bus Receive"* matches **no keyword** (`:32-58`) and falls through to the
   `"audiofx"` default (`:62`, orange ◆). Per the ratified 4-cat taxonomy, Bus nodes are
   **routing utilities → `"modulator"`** (purple ⬡, "routing logic"). **Task 14 must add a
   keyword** (e.g. `haystack.contains("bus")` → `modulator`) to `blockcategory.hpp`, ordered
   **after** the `midi` check (so a hypothetical "MIDI Bus" still lands in midifx) and with a
   Boost.Test asserting the mapping (mirrors the Wave-2 `mapBlockCategory` test).
3. **Colour** — `n.getColor()` (`:4286`) can carry the bus's signal-type colour (audio blue /
   midi teal / value orange) so the block + its cable read as the same bus.
4. **Activity / signal-present meter** — **NO per-block source exists today.** `cpuLoad` is
   hardcoded `0.0` (`:4300, :4308`, `FIXME(US-002)` `:4294-4299`: per-Processor CPU/activity
   would require touching `src/engine/`). **Out of scope for v1.** If "bus active" indication
   is wanted, the cheaper route is reusing existing cable metering
   (`useCableMeterStore`, per plan §Grounded arch) rather than new engine plumbing — flag for
   Task 16.
5. **Package B caveat:** the **bus-side port** (the one the hidden arc attaches to) WILL appear
   in `ports[]` (`:4311-4324`). It must be **flagged or filtered** (e.g. a port property
   `hidden:true`, or a naming convention the React `mapBlock` skips) so the block keeps the
   clean "wireless" look and users don't manually re-wire it. Task 14 owns the flag; Task 16/17
   consume it.

---

## 8. Node shape — single vs 2-node (SECONDARY verdict + rationale)

**Verdict: 2-node — `BusSendNode` + `BusReceiveNode` (sharing a `BusNodeBase`).**

| Option | Pros | Cons |
|---|---|---|
| **2-node (RECOMMENDED)** | Matches existing **Send/Receive naming** ("Reverb Send A", `BusInspector` already speaks "senders/receivers"; G-05 asks to *"highlight all senders/receivers"*). Distinct, fixed port profiles (simpler than mode-switching). Clean 1→N broadcast. Mirrors the proven `RerouteNode`/`AudioRerouteNode`/`MidiRerouteNode` base+variants idiom (`reroutenode.hpp:128-164`). | Two IDs/UIDs to register + two Boost.Tests. |
| **Single node (in/out + mix)** | One type to maintain. "Insert send w/ wet-dry" fits sidechain-style use. | Ambiguous role (send? receive?); requires a mode flag that **mutates ports at runtime** (heavier `refreshPorts`, like AudioRouter's `rebuildPorts`/`triggerPortReset` dance, `audiorouter.cpp:104-140`); a mix knob implies an *inline insert*, which does **not** match the cross-board **decluttering** goal of G-29 as cleanly as discrete teleport endpoints. |

The "single in/out w/ mix" idea from the G-29 line is better served as a **later optional
"Bus Send (insert/wet-dry)" variant** of the 2-node family, not the primary model.

---

## 9. Glen-facing open question (PRIMARY decision) + recommended default

> **Q: Does v1 need true no-connection "teleport" (a Receive that shares no wire with its
> Send), or is an auto-managed hidden connection acceptable?**

| | **Package B — auto hidden arcs (RECOMMENDED v1)** | **Package A — engine bus-buffer broadcast** |
|---|---|---|
| Ports | Send **in+out**, Receive **in+out** | Send **inputs only**, Receive **outputs only** |
| Transport | bridge creates/destroys real Arcs by bus-name match | engine pre-allocated bus-buffer registry; Send writes, Receives read |
| Engine changes | **none** (reuses routing, latency-comp, feedback) | **net-new audio-thread code** |
| Cycle safety (e) | **free** (`graphbuilder.cpp:694-699/777-785`) | **must rebuild** guard + ordering |
| Channel mismatch (f) | automatic via buffer routing | manual bounds-checks vs fixed bus width |
| New complexity lands in | **message thread**: arc-lifecycle mgmt on add/rename/delete + hide the bus-side port in `ports[]` | **audio thread**: ordering constraints, lock-free handoff, cycle guard |
| RT-safety risk | low (render is a no-op pass-through, `reroutenode.hpp:40-60`) | higher (new buffer handoff on the callback path) |

**Recommendation: ship Package B for v1.** It honours the project's hard RT-safety guardrails
(`.cursor/rules/element-audio-path.mdc`) and the "no premature abstraction" rule, and the
decluttering goal (separate, inspectable Send/Receive blocks with no drawn curve) is fully met
without touching the engine. Package A becomes a fast-follow only if Glen wants a Receive that
is *genuinely* arc-free. **Do not** sell B as "reuses everything" while quietly using A's
inputs-only Send — the two are a package deal (§0 coherence rule).

---

## 10. Back-compat — opening old wireless `.els` sessions

- Old sessions persist wireless as a **`busName` property on the Arc ValueTree**
  (`element_webview_host.cpp:2605-2608`), re-emitted on snapshot (`:4359-4361`) and re-seeded
  into `useBusStore` on hydrate (`useGraphStore.ts:269-278`). **There is no Bus node in old
  sessions** — wireless was never a node.
- **Recommendation: NO migration (aligns with D5 "no persistence/migration code").** On load:
  - The `busName` arc property continues to **read harmlessly**; if the wireless render path is
    removed, those arcs simply **render as ordinary drawn cables** — **no data loss** (the
    engine connection was always a real Arc).
  - New `BusSendNode`/`BusReceiveNode` are an **additive, opt-in authoring path**; their bus-id
    is persisted via **normal node `getState/setState`** (not a migration — standard node
    serialization, pattern `reroutenode.hpp:62-71`).
  - Optionally leave `elementGraphSetCableBus` registered (dead-but-harmless) so very old
    front-ends don't error; or have Task 17 no-op it. Either is safe.
- **Net:** old projects open and play identically; they just lose the *wireless badge* visual
  until/unless the user rebuilds the routing with Bus nodes. No converter required.

---

## 11. RT-safety constraints for the new node's `render()` (h)

Per `.cursor/rules/element-audio-path.mdc:11-19` + `add-node/SKILL.md:116-124` + CLAUDE.md
Real-time Safety:

- **In `render()` (audio thread): NO** `new/delete/malloc/free`, **NO** containers that
  allocate, **NO** `CriticalSection`/`ScopedLock`/`SpinLock`/`unique_lock`, **NO** blocking I/O,
  **NO** `DBG()`/`Logger`.
- **Pre-allocate** everything in `prepareToRender(sampleRate, maxBufferSize)` (pattern:
  `audiorouter.hpp:20-26` pre-sizes `tempAudio`).
- **Package B:** `render()` is a **no-op pass-through** (the graph routing carries the signal),
  exactly like `RerouteNode::render` (`reroutenode.hpp:40-60`) → trivially RT-safe.
- **Package A:** the cross-node bus buffer must be **pre-allocated** in `prepareToRender` and
  use **lock-free atomic handoff** (CLAUDE.md: `std::atomic` pointer swaps / `juce::AbstractFifo`),
  **not** a lock.
- **Explicit anti-pattern:** `AudioRouterNode::render` takes `ScopedLock sl(lock)`
  (`audiorouter.cpp:191, 286`) — a **pre-existing exception**, NOT a template. A new node must
  not introduce a render-path lock; if an exception is ever unavoidable, it requires a
  `// no-rt-check` comment + justification per `.cursor/rules/element-audio-path.mdc:21-23`.
- `getState/setState/prepareToRender/releaseResources` are message-thread/non-RT and may
  allocate (`reroutenode.hpp:33-71`).

---

## 12. Citation spot-check (acceptance)

All file:line claims verified by direct read this session. Spot-checks:
- `src/engine/nodefactory.cpp:128` → `add (new SingleNodeProvider<RerouteNode> (EL_NODE_ID_REROUTE));` OK
- `include/element/node.h:82` → `#define EL_NODE_UID_MIDI_REROUTE 1031` (→ next free 1032/1033) OK
- `src/ui/element_webview_host.cpp:2608` → `a.setProperty ("busName", busName, nullptr);` OK
- `src/engine/graphbuilder.cpp:696` → `// if not found, this is probably a feedback loop` OK
- `src/ui/blockcategory.hpp:62` → `return "audiofx";` (default bucket; "Bus Send" falls here) OK

---

## 13. Task 14 hand-off checklist

1. Settle §9 (B vs A) with Glen **first** — it dictates ports + scope.
2. (B) Add `BusNodeBase` + `BusSendNode`/`BusReceiveNode` headers in `src/nodes/`, modelled on
   `reroutenode.hpp`; render = no-op; fixed stereo+MIDI ports via `Mode`.
3. IDs/UIDs in `include/element/node.h` (1032/1033); register in `nodefactory.cpp:117-149`.
4. Add `"bus"→"modulator"` keyword to `blockcategory.hpp` (after the midi check) + Boost.Test.
5. Emit `busId`/`busRole` + a `hidden` flag on the bus-side port in
   `element_webview_host.cpp:4247-4327`; re-point BusInspector (G-05) at bus nodes.
6. (B) Implement message-thread arc-lifecycle management keyed on bus name (create/rename/delete).
7. CMake **reconfigure** (GLOB_RECURSE) before build — Task 15.
8. NO migration; leave old `busName` arcs reading harmlessly (§10).
