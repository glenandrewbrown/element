> 🗄️ **ARCHIVED — HISTORICAL. Do NOT execute.** 2026-05-08 per-Block snapshot / bridge-gap design memo (master-fix-plan §4.4). The snapshot/category bridge work it scoped has since shipped/evolved. Live successors: `.omo/audit/g29-busnode-spec.md` + `.omo/audit/records-schema.md` · `.omo/PROJECT-STATE.md`.
> Current state: `.omo/PROJECT-STATE.md` · plans index: `.omo/plans/README.md`. _(Archived 2026-05-30.)_

# Phase F-block-3 — Snapshot Extension + Bridge Gap Design Memo

**Author:** Sisyphus (manual synthesis after oracle 0/2 retries failed — gpt-5.5 generic API error then Gemini 3.1 Pro IAM-denied; no oracle output produced)
**Date:** 2026-05-08
**Branch:** `local-enhancements` @ HEAD `09469b47`
**Scope:** master-fix-plan.md §4.4 — close US-002 + Q-VU-PER-BLOCK + Q-VU-INPUT + wireless bus React UI
**Companion docs:**
- `.sisyphus/plans/master-fix-plan.md` §4.4 (Wave 3 entry point)
- `include/element/web_metering_fifo.hpp` (existing RT-safe SPSC primitive)

---

## Executive verdict (5-bullet)

| # | Pick | One-line |
|---|---|---|
| **D1** | **(a) per-Processor RT timestamp + EWMA** | Wrap `ProcessBufferOp::perform()` at `graphbuilder.cpp:383` with `juce::Time::getHighResolutionTicks()` fence; smooth into per-Processor `std::atomic<float> cpuFraction`. |
| **D2** | **(a) extend graph state JSON** | Replace hard-coded 0 at `element_webview_host.cpp:4185` with `proc->getCpuFraction()`. Cadence unchanged (graph-dirty + on demand). 4 Hz pull via engine snapshot for the "live during steady-state" supplement. |
| **D3** | **(c) NEW push channel `onPerBlockMeters(json)` at 60 Hz timer** | Add per-Processor `std::atomic<MeterFrame>` (peakL,peakR,rmsL,rmsR packed into `uint64_t`); message-thread drain in existing 60 Hz `timerCallback`. Visual smoothness ≥ 30 fps, no audio-thread JSON. |
| **D4** | **(b) NEW push `onInputOutputPeaks(L,R,L,R)` at 60 Hz timer** | The atomic-ready `AudioEngine::LevelMeter::getLevel()` already exists — message thread polls `getLevelMeter(ch, isInput)` for both directions and pushes one combined call. Migrate existing `onMetering(peak)` to deprecated alias for one release. |
| **D5** | **Fire `visual-engineering` NOW in parallel with D1/D2/D3/D4 — INDEPENDENT** | 5 dormant C++ identifiers exist; only 1 wrapped in TS. Sequence: wrap → store action → canvas overlay UI → drag-rewire cable handler. ~3-4h, zero overlap with audio engine work. |

**Implementation sequence (D6):** **Phase 1** (parallel) = D1 RT instrumentation + D3 per-block meter atomic + D4 polled meter wiring + D5 wireless bus React UI. **Phase 2** (sequential after Phase 1) = D2 graph-JSON wiring (just changes one line) + bridge handler additions for the new push channels. **Phase 3** = test extensions to `AudioThreadAllocationTest` covering D1/D3 instrumentation sites.

---

## D1 — US-002 per-Processor CPU%

### Decision: (a) per-Processor RT timestamp + EWMA at the `ProcessBufferOp` boundary

### Rationale

The ground-truth wrap site is `ProcessBufferOp::perform()` at [`src/engine/graphbuilder.cpp:200,383`](file:///Volumes/Projects/Development_Projects/Github_Repos/element/src/engine/graphbuilder.cpp#L200) — the ONE place every plugin's `processBlock` is invoked from the graph render path. (Direct path. The sandboxedprocessor IPC path has its own latency story per Phase D and is OUT of scope here.)

Wrapping at `ProcessBufferOp::perform()` gives:
- 100% coverage of all in-process plugin types (AU/VST3/CLAP/internal nodes — all become a `Processor` walked via `renderingOps`)
- Single instrumentation site (one diff)
- Deterministic before/after fence around each plugin's actual work

### Audio-thread sketch (pseudo-C++)

```cpp
// In ProcessBufferOp::perform — graphbuilder.cpp around line 383

void perform (...) override {
    // ── existing prep code unchanged ──

    const int64_t startTicks = juce::Time::getHighResolutionTicks();
    processor->processBlock (buffer, *midiPipe.getWriteBuffer (0));
    const int64_t elapsedTicks = juce::Time::getHighResolutionTicks() - startTicks;

    // Block budget: numSamples / sampleRate (in same ticks units).
    // Fraction = elapsed / budget. Both numerator & denominator pre-computed; no
    // floats on hot path is OK — this is a single double * uint64 + atomic store.
    if (sampleRateHz > 0.0 && numSamples > 0) {
        const double elapsedSec = juce::Time::highResolutionTicksToSeconds (elapsedTicks);
        const double budgetSec  = (double) numSamples / sampleRateHz;
        const float frac = (float) (elapsedSec / budgetSec);
        // EWMA: alpha=0.05 → ~64-block time constant (~33 ms @ 48k/256)
        const float prev = processor->cpuFractionAtomic.load (std::memory_order_relaxed);
        const float next = prev + 0.05f * (frac - prev);
        processor->cpuFractionAtomic.store (next, std::memory_order_relaxed);
    }
}
```

### Phase C invariant proof

- `juce::Time::getHighResolutionTicks()` reads a CPU TSC register (no syscall, no allocation, lock-free).
- `juce::Time::highResolutionTicksToSeconds` is `static inline`, pure arithmetic, no allocation.
- `std::atomic<float>` `load`/`store` with `memory_order_relaxed` is lock-free on aarch64 + x86_64 (single-word).
- No new heap, no FIFO, no mutex. The `cpuFractionAtomic` is added as a new `std::atomic<float> {0.0f}` member on the `Processor` base class (`src/engine/processor.hpp`).
- `AudioThreadAllocationTest.cpp` extension: add a smoke case that runs `GainPassthrough` 100 buffers under `ScopedAudioThread`, asserts `getAllocCount() == 0`, AND asserts `getCpuFraction() > 0.0f` after the run.

### Push surface

Read on message thread via new `Processor::getCpuFraction() const noexcept` returning `cpuFractionAtomic.load(memory_order_relaxed)`. Used by D2.

---

## D2 — CPU push channel

### Decision: (a) extend graph state JSON — replace the hard-coded zero

### Rationale

The graph state JSON push channel **already has the per-block field** at [`element_webview_host.cpp:4185`](file:///Volumes/Projects/Development_Projects/Github_Repos/element/src/ui/element_webview_host.cpp#L4185):

```cpp
double cpuLoadPercent = 0.0;  // FIXME(US-002)
double latencyMs = 0.0;
if (auto* proc = n.getObject()) {
    const int latencySamples = proc->getLatencySamples();
    if (activeSampleRate > 0.0 && latencySamples > 0)
        latencyMs = (double) latencySamples / activeSampleRate * 1000.0;
}
b->setProperty ("cpuLoad", cpuLoadPercent);
b->setProperty ("latencyMs", latencyMs);
```

The fix is one line: `cpuLoadPercent = 100.0 * proc->getCpuFraction();`.

### Cadence analysis

Current trigger: `pushGraphSnapshot()` fires when `graphPushPendingMs <= 0` after a graph mutation. Steady state (no edits) → no push. **For US-002 this is fine** — the InspectorHub + Block.tsx CPU display is a slow-decay readout, 4 Hz refresh is plenty. Pile a 4 Hz pull on top by extending engine snapshot if needed (see below).

### Why NOT extend engine snapshot

Engine snapshot is a single object pulled by the React side at 4 Hz. If we put per-Block CPU there, the JSON balloons O(N nodes). Graph-state JSON is the right place because it's already per-Block-shaped and only refreshes when the graph topology actually changes.

### Optional follow-up (out of P1 scope)

Trigger an additional `pushGraphSnapshot()` from the same 60 Hz timer that drives `onCableLevels` IF more than `graphPushPendingMs` has elapsed AND CPU values changed by >5%. Defer; ship the simple version first.

---

## D3 — Q-VU-PER-BLOCK per-block VU

### Decision: (c) NEW push channel `onPerBlockMeters(json)` driven from the 60 Hz `timerCallback`

### Rationale

Per master plan §4.4: "if 30+ Hz needed for visual smoothness → separate channel". VU bars look broken below ~24 fps; 60 fps is the gold standard. 4 Hz from engine snapshot is unacceptable. Graph-state JSON cadence is graph-dirty-only (worse than 4 Hz at steady state).

The existing 60 Hz `timerCallback` at [`element_webview_host.cpp:3817`](file:///Volumes/Projects/Development_Projects/Github_Repos/element/src/ui/element_webview_host.cpp#L3817) already pushes `onCableLevels(json)` at this exact cadence — match it.

### Audio-thread sketch

```cpp
// New struct on Processor base — 32 bytes, single u64 holds all four for atomic
// load/store. Bit-pack 4× int16 (peak * 32767).
struct MeterFrame {
    uint64_t bits;  // [peakL_q15 | peakR_q15 | rmsL_q15 | rmsR_q15]
    static constexpr float kQ15 = 32767.0f;
    void pack (float pL, float pR, float rL, float rR) {
        const auto q = [] (float v) {
            return (uint16_t) juce::jlimit (0, 32767, (int) (v * kQ15));
        };
        bits = ((uint64_t) q (pL))
             | ((uint64_t) q (pR) << 16)
             | ((uint64_t) q (rL) << 32)
             | ((uint64_t) q (rR) << 48);
    }
    void unpack (float& pL, float& pR, float& rL, float& rR) const {
        pL = (float) ((bits >>  0) & 0xFFFF) / kQ15;
        pR = (float) ((bits >> 16) & 0xFFFF) / kQ15;
        rL = (float) ((bits >> 32) & 0xFFFF) / kQ15;
        rR = (float) ((bits >> 48) & 0xFFFF) / kQ15;
    }
};
// On Processor base:
std::atomic<uint64_t> meterFrameBits { 0 };

// In ProcessBufferOp::perform AFTER processBlock returns:
float pL = 0.f, pR = 0.f, rL = 0.f, rR = 0.f;
const int nch = buffer.getNumChannels();
if (nch >= 1) {
    pL = buffer.getMagnitude (0, 0, numSamples);
    rL = buffer.getRMSLevel  (0, 0, numSamples);
}
if (nch >= 2) {
    pR = buffer.getMagnitude (1, 0, numSamples);
    rR = buffer.getRMSLevel  (1, 0, numSamples);
}
MeterFrame mf;
mf.pack (pL, pR, rL, rR);
processor->meterFrameBits.store (mf.bits, std::memory_order_relaxed);
```

`juce::AudioBuffer::getMagnitude` and `getRMSLevel` are inline, allocation-free, no I/O — verified RT-safe in JUCE source.

### Message-thread drain (60 Hz)

```cpp
// In timerCallback after the existing onCableLevels push:
DynamicObject::Ptr root (new DynamicObject());
Array<var> blocks;
for (each Processor in graph) {
    MeterFrame mf { processor->meterFrameBits.load (std::memory_order_relaxed) };
    float pL,pR,rL,rR; mf.unpack (pL, pR, rL, rR);
    DynamicObject::Ptr b (new DynamicObject());
    b->setProperty ("uuid", processor->getUuidString());
    b->setProperty ("peakL", pL);
    b->setProperty ("peakR", pR);
    b->setProperty ("rmsL", rL);
    b->setProperty ("rmsR", rR);
    blocks.add (var (b.get()));
}
root->setProperty ("blocks", var (blocks));
evalInBrowser ("window.__elementNative && window.__elementNative.onPerBlockMeters("
               + JSON::toString (var (root.get())) + ");");
```

### Phase C invariant proof

- One `std::atomic<uint64_t>` write per ProcessBufferOp call. Lock-free on all our targets (8 bytes ≤ pointer width).
- No JSON construction on audio thread. JSON happens on message thread (60 Hz).
- No FIFO, no AbstractFifo allocation — atomic snapshot model. Latest-wins, fine for VU.
- Bit-packing is 4× `juce::jlimit` + 4× cast + 3× shift + 3× OR; ≤ 50 ns total.

### React side

- `webview/src/bridge/onPerBlockMeters.ts` (new) — handler installed via the same chain pattern as `onMetering`.
- `webview/src/stores/usePerBlockMeterStore.ts` (new) — Zustand store keyed by node UUID, value `{peakL, peakR, rmsL, rmsR}`. Selector: `selectPerBlockMeter(uuid)`.
- `webview/src/components/canvas/BlockEmbed.tsx` — replace defaults at line 205-208 with `usePerBlockMeterStore(selectPerBlockMeter(node.id))` lookup. Empty-state contract preserved (defaults to 0 when no entry).

---

## D4 — Q-VU-INPUT input peak

### Decision: (b) NEW push channel `onIOPeaks(json)` at 60 Hz timer — using the existing `AudioEngine::LevelMeter` infrastructure

### Critical discovery

Element ALREADY has per-channel input AND output level meters at [`audioengine.cpp:583-586`](file:///Volumes/Projects/Development_Projects/Github_Repos/element/src/engine/audioengine.cpp#L583). They are updated on every audio callback at lines 391 (`inMeters[c]->updateLevel(...)`) and 452 (`outMeters[c]->updateLevel(...)`). Atomic-safe accessor: `AudioEngine::getLevelMeter(channel, isInput)` returns `LevelMeterPtr` whose `getLevel()` is a `juce::Atomic<float>` read.

**Q-VU-INPUT is essentially already done in C++ — only the bridge-layer wiring is missing.**

### Message-thread sketch

```cpp
// In timerCallback after the new onPerBlockMeters push:
if (auto e = context.audio()) {
    const int nIn = e->getNumChannels (true);
    const int nOut = e->getNumChannels (false);
    DynamicObject::Ptr io (new DynamicObject());
    if (nIn >= 1) io->setProperty ("inputPeakL",  (double) e->getLevelMeter (0, true)->getLevel());
    if (nIn >= 2) io->setProperty ("inputPeakR",  (double) e->getLevelMeter (1, true)->getLevel());
    if (nOut >= 1) io->setProperty ("outputPeakL", (double) e->getLevelMeter (0, false)->getLevel());
    if (nOut >= 2) io->setProperty ("outputPeakR", (double) e->getLevelMeter (1, false)->getLevel());
    evalInBrowser ("window.__elementNative && window.__elementNative.onIOPeaks("
                   + JSON::toString (var (io.get())) + ");");
}
```

### React side

- `webview/src/bridge/onIOPeaks.ts` (new) — handler chain.
- `webview/src/stores/usePerformStore.ts` — extend `LiveHealth` interface with `inputPeakL/inputPeakR/outputPeakL/outputPeakR` fields. Update `installMeteringChain` at line 213 to additionally install `onIOPeaks`. The legacy `onMetering(peak)` keeps working — chain into both for one release.
- `webview/src/components/layout/LiveHealth.tsx` — line 88-99: remove `opacity-40` + `(n/a)` label; replace `levelToLadderHeights(0)` with `levelToLadderHeights(Math.max(health.inputPeakL ?? 0, health.inputPeakR ?? 0))`.

### Phase C invariant proof

- `LevelMeter::getLevel()` is `juce::Atomic<float>::get()` — single atomic read, lock-free.
- All atomic reads happen on message thread. Audio thread already does its writes (line 391, 452).
- No new audio-thread code AT ALL for this gap.

---

## D5 — Wireless bus React UI

### Decision: Fire `visual-engineering` delegation in PARALLEL with D1/D2/D3/D4

### Independent? Yes

The wireless bus work touches:
- `webview/src/bridge/nativeGraph.ts` (4 new TS wrappers around existing C++ identifiers)
- `webview/src/stores/useBusStore.ts` (already exists — extend with sync action)
- `webview/src/components/canvas/` (overlay component)

Zero overlap with `src/engine/`, `include/element/` modifications, or the snapshot extension surface. Safe to fire NOW.

### 5 dormant C++ identifiers (verified at HEAD 09469b47)

| # | C++ identifier | `element_webview_host.cpp` line | TS wrapper status |
|---|---|---:|---|
| 1 | `elementGraphSetCableBus` | 2462 | ❌ missing |
| 2 | `elementGraphCreateWirelessBus` | 2786 | ❌ missing |
| 3 | `elementGraphGetWirelessBuses` | 2848 | ✅ wrapped |
| 4 | `elementGraphDeleteWirelessBus` | 2883 | ❌ missing |
| 5 | `elementGraphDuplicateNodesWithRewire` | 3133 | ❌ missing |

(Handover doc claimed 6 — actual is 5. Worth recording.)

### Recommended sequence (within D5)

1. Wrap the 4 missing identifiers in `nativeGraph.ts` (~30 min)
2. Add Zustand action to `useBusStore.ts`: `loadFromBridge`, `createBus`, `deleteBus`, `assignCableToBus` (~30 min)
3. Canvas overlay component `WirelessBusOverlay.tsx`: lists active buses, shows colour swatches, allows assigning cables via context menu (~90 min)
4. Drag-rewire-cable: add an `onEdgeDragEnd` to xyflow's edge component, calls `elementGraphSetCableBus` to reroute (~60 min)
5. Test: create bus → drag cable end onto bus → assert bus assignment via `elementGraphGetWirelessBuses`; SIGKILL plugin → assert bus persists (~30 min)

### Acceptance per master plan §4.4

- "Wireless bus visible in topology" → overlay component renders ≥ 1 named bus
- "Drag a wire endpoint → re-routes via `elementBridgeWireRewire`" → drag-rewire UX works
- "`kill -9` plugin doesn't break wireless bus state" → state survives plugin restart (Phase D guarantees)

---

## D6 — Implementation sequencing

### Phase 1 (parallel, ~3-5 days)

| Track | What | Files | Agent |
|---|---|---|---|
| **A** | D1 RT instrumentation primitive | `src/engine/processor.hpp` (+ `cpuFractionAtomic`), `src/engine/graphbuilder.cpp` (ProcessBufferOp wrap) | `category="ultrabrain"` + `oh-my-claudecode:executor` |
| **B** | D3 per-block meter atomic + drain | `src/engine/processor.hpp` (+ `meterFrameBits`), `src/engine/graphbuilder.cpp`, `src/ui/element_webview_host.cpp` (60 Hz drain) | same as A — bundle with A in one PR (shared file) |
| **C** | D4 IO peak wiring | `src/ui/element_webview_host.cpp` only (60 Hz drain — uses existing `AudioEngine::LevelMeter`) | same delegation, separate PR (no engine changes) |
| **D** | D5 wireless bus React UI | `webview/src/bridge/nativeGraph.ts`, `webview/src/stores/useBusStore.ts`, `webview/src/components/canvas/*` | `visual-engineering` + `frontend-ui-ux` skill — parallel from start |

### Phase 2 (after Phase 1, ~1 day)

| What | Files | Agent |
|---|---|---|
| D2 graph-JSON cpuLoad wiring | `src/ui/element_webview_host.cpp:4185` (one-line replacement) | `quick` |
| TS bridge wrappers for `onPerBlockMeters` + `onIOPeaks` + handler chains | `webview/src/bridge/`, `webview/src/stores/`, `webview/src/components/canvas/BlockEmbed.tsx`, `webview/src/components/layout/LiveHealth.tsx` | `oh-my-claudecode:executor` Sonnet |
| `usePerformStore.ts` LiveHealth interface + selectors | same | same |

### Phase 3 (after Phase 2, ~1 day)

| What | Files |
|---|---|
| Extend `AudioThreadAllocationTest` — D1 case (cpuFraction > 0 after run, allocs == 0), D3 case (meterFrameBits non-zero after run, allocs == 0) | `test/realtime/AudioThreadAllocationTest.cpp` |
| Vitest cases for new bridge wrappers + selectors | `webview/src/bridge/__tests__/onPerBlockMeters.test.ts`, `onIOPeaks.test.ts`, `usePerBlockMeterStore.test.ts` |
| Playwright E2E (or Element AX harness) — load plugin, send signal, assert MeterEmbed bars animate | `tools/automation/element_verify.py` |

### PR strategy

- **PR-1**: D1 + D3 atomic primitives + `ProcessBufferOp` wrap (single concern: per-Processor RT measurement)
- **PR-2**: D4 IO peak push (single concern: existing-meter wiring; zero engine touches)
- **PR-3**: D2 graph-JSON cpuLoad wiring (one-line; can be in PR-1 if tight)
- **PR-4**: TS bridge wrappers + store + UI consumption (Phase 2)
- **PR-5**: Test extensions (Phase 3)
- **PR-6**: D5 wireless bus React UI (independent track, can land first or last)

---

## Risk register

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | `juce::Time::getHighResolutionTicks` overhead is non-trivial (~10-50 ns × 2 per ProcessBufferOp invocation × N nodes per buffer × 1000s buffers/sec) — could measurably bias the very metric we're measuring | Medium | Add a CMake option `ELEMENT_DISABLE_CPU_PROFILING=ON` to compile-out the timing fence for users who don't need it. Also: the EWMA includes the timing overhead as part of itself, which is the honest answer (this IS what the audio thread spends per block). |
| 2 | Some plugins return wildly variable per-block CPU (warm-up, file I/O on first block) → noisy initial readouts | High | EWMA smooths this. First 64 blocks give stable steady-state. Document expected warm-up. |
| 3 | 60 Hz `onPerBlockMeters` JSON for graphs with 100+ nodes balloons message-thread CPU | Medium | Skip nodes whose `meterFrameBits == 0` in the drain loop. Cap the node count emitted at 256. Add a "JSON build time" telemetry to detect regressions. |
| 4 | Bit-packed MeterFrame loses precision below -90 dBFS | Low | Q15 covers 0..1.0 in 1/32767 steps ≈ -90 dBFS floor. VU bars need < 1 dB below -60 dBFS in practice. Acceptable. |
| 5 | `getCpuFraction()` reads stale value if graph mutated mid-render (Processor pointer invalidated) | Low | Existing `pushGraphSnapshot()` already iterates the graph under the same constraints; matches the existing pattern. No new race. |

---

## Open questions for Glen (single round)

1. **EWMA alpha** — I chose `0.05` (~33 ms time constant @ 48k/256). Should it be configurable (Inspector preference) or fixed?
2. **Q3 packing precision** — Q15 (16-bit per channel, 4 channels in 64-bit atomic) gives ~-90 dBFS floor. Sufficient, or do we need Q23 (24-bit per channel, 4 channels in 96-bit, requires `std::atomic<__int128>` which is NOT lock-free on x86_64 — falls back to mutex)? My pick: Q15 is fine.
3. **Wireless bus colour swatches** — The 5 C++ identifiers don't expose a colour field. Should I add a `wirelessBusSetColor` 6th identifier as part of D5, or keep it React-state-only for now? My pick: React-only, deferred until C++ wireless bus has colour metadata.
4. **`onMetering(peak)` legacy** — keep-and-deprecate or remove on first release of the new channel? My pick: keep for one release, remove in next.

If no answer, defaults above stand.

---

## Files-touched summary (planning aid)

**C++ writes:**
- `src/engine/processor.hpp` — add `std::atomic<float> cpuFractionAtomic`, `std::atomic<uint64_t> meterFrameBits`, getters
- `src/engine/graphbuilder.cpp` — `ProcessBufferOp::perform` instrumentation (D1 + D3)
- `src/ui/element_webview_host.cpp` — line 4185 (D2), `timerCallback` extension (D3 + D4)

**TS writes:**
- `webview/src/bridge/nativeGraph.ts` — 4 new wireless bus wrappers (D5)
- `webview/src/bridge/onPerBlockMeters.ts` (new), `onIOPeaks.ts` (new)
- `webview/src/stores/usePerBlockMeterStore.ts` (new)
- `webview/src/stores/useBusStore.ts` — extend (D5)
- `webview/src/stores/usePerformStore.ts` — LiveHealth interface
- `webview/src/components/canvas/BlockEmbed.tsx` — wire MeterEmbed (D3)
- `webview/src/components/layout/LiveHealth.tsx` — wire INPUT bars (D4)
- `webview/src/components/canvas/WirelessBusOverlay.tsx` (new, D5)

**Tests:**
- `test/realtime/AudioThreadAllocationTest.cpp` — D1 + D3 RT cases
- `webview/src/bridge/__tests__/` + `webview/src/stores/__tests__/` — vitest coverage

**No changes to:** `src/lua/`, `include/element/*.hpp` public API, JUCE version, audio engine memory budgets, sandbox subsystem (Phase D closed).

---

**End of memo.**
