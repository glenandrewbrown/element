# Worker 1 — C1/C2 Verification Verdict (2026-06-06)

## C1 — render-op swap use-after-free: **REAL**

Two-thread trace at HEAD (`chromatic-ui-review`):

**Audio thread** (`AudioEngine::Private::renderGraphs`, src/engine/audioengine.cpp):
- :155 takes `graph->getPropertyLock()` for the duration of the render call
- :162 `graph->render (rc)` → src/engine/graphnode.cpp:590
  `activeRenderingOps.load (memory_order_acquire)` → :593-597 iterates the array,
  calling `op->perform(...)` on each GraphOp. Iteration spans the whole block render
  (every node in the graph).

**Message thread** (`GraphNode::buildRenderingSequence`, src/engine/graphnode.cpp):
- :433-449 takes the property lock ONLY around the buffer-pool `setSize` block,
  then **releases it**
- :451-453 `activeRenderingOps.exchange (published, acq_rel)` — **outside any lock**
- :455-459 `deleteRenderOpArray (*oldOps); delete oldOps;` — **immediate free**

**Race window:** after the message thread releases the property lock at :449 and
before/while it executes :453-:458, the audio thread can acquire the property lock,
enter `render()`, acquire-load the OLD pointer at :590 and begin iterating. The
message thread then exchanges and immediately frees that exact array + every GraphOp
in it → the audio thread calls `op->perform()` through freed memory. Use-after-free.

The property lock does NOT serialize these: the swap+delete sits outside its scope.
Even moving it inside would not cover **nested GraphNodes** (Containers): a child
graph's `render()` runs inside the parent's `ProcessBufferOp::perform`
(src/engine/graphbuilder.cpp:302+) WITHOUT the child's property lock held, while the
child's own `buildRenderingSequence()` (triggered by `addConnection`/`addNode` async
updates) swaps/frees on the message thread.

Same immediate-free hazard in `clearRenderingSequence()` (graphnode.cpp:366-373),
reachable from `prepareToRender` (:507).

`GraphNodeLockFreeTest.cpp` only proves pointer-swap atomicity on toy structs; it
never frees the swapped-out array — codex is right that it does not test lifetime.

**Fix applied:** deferred reclamation per brief — swapped-out arrays are *retired*
with the render-generation observed at swap; the audio thread increments
`renderGeneration` (release) at render exit; retirees are freed on a LATER
rebuild/clear only once the generation has advanced past their swap (proving the
render pass that could hold the stale pointer exited). Renders of one GraphNode are
serialized on the audio thread, so generation-advance ⇒ no stale reference. No locks,
no audio-thread frees. Destructor/`releaseResources` force-reclaim (no render can be
in flight there — same assumption the existing `setSize(1,1)` already makes).

## C2 — 4096-sample pool hard cap vs live numSamples: **REAL**

- graphnode.cpp:434 `renderingBuffers.setSize (numRenderingBuffersNeeded, 4096)`
- graphnode.cpp:441 `cvRenderingBuffers.setSize (jmax (1, numCvBuffersNeeded), 4096)`
- graphnode.cpp:552 `numSamples = rc.audio.getNumSamples()` (live host value)
- graphnode.cpp:596 passes it into `op->perform (renderingBuffers, cvRenderingBuffers, …, numSamples)`
- graphbuilder.cpp ops write pools for the full count: :55/:75/:95 (audio
  clear/copy/add), :117/:133/:149 (CV) → **heap overflow** for any host block > 4096
  (offline bounce / freeze paths).

**Fix applied:** pools sized `jmax (4096, getBlockSize())` at rebuild (negotiated max
known at prepare time via `setRenderDetails`); defensive clamp of the sample count
passed to ops at render entry (`jmin` + `jassert`, no allocation). Out-of-contract
hosts get truncated-but-safe ops instead of memory corruption.

(Noted, out of scope: `currentAudioOutputBuffer.setSize(..., avoidReallocating=true)`
at :555 can still allocate on the audio thread if a host exceeds its prepared block —
pre-existing, separate from the pool OOB; flagged for a future wave.)
