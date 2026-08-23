# pizmidi Native Nodes — P0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the on-block live-parameter framework (`InlineParamControl` C++ interface → snapshot → `atomicKnob` webview face → write-back bridge) and prove it end-to-end by wiring 4 existing MIDI nodes to live-editable on-block knobs, then an expert-designed Transform archetype face.

**Architecture:** Built-in `element::Processor` MIDI nodes already exist with atomic params. We add a tiny `InlineParamControl` interface so the webview host can enumerate+write a node's named params generically (one `dynamic_cast` in the host, not one-per-node). The 60 Hz graph snapshot emits each node's `inlineParams` (engine = source of truth for value+range, nothing-fake). A new webview `atomicKnob` inline-face entry-kind renders those values via the existing `InlineMicroKnob` and writes back through a new `elementNodeSetParam` native function. `Block.tsx` is never touched — the existing `InlineFace` mount already handles non-AudioProcessor faces.

**Tech Stack:** C++20 / JUCE 8 (`element::Processor`, `juce::MidiBuffer`, `juce::var`/`DynamicObject`), Boost.Test (ctest), React/TypeScript (Zustand, `@xyflow/react`), Vitest, Storybook, the `window.__JUCE__` bridge.

**Spec:** `.omo/plans/pizmidi-native-nodes-design-2026-06-09.md`

**Merge-safety:** Touch only `src/nodes/*` (new/edit), `src/engine/nodefactory.cpp` (already lists these), one new C++ header, `src/ui/element_webview_host.cpp` + `include/element/ui/element_webview_host.hpp` (O(1) additive), `webview/src/data/types.ts`, `webview/src/bridge/nativeGraph.ts`, `webview/src/components/canvas/inline/*`, `webview/src/components/canvas/inlineParams.ts`, `test/*`. **Never** `Block.tsx` / `GraphCanvas.tsx` / `useAppStore.ts` / `Cable.tsx`. Commit per task (stage + commit in ONE shell call — repo hook unstages between calls).

**Build dirs:** `build-merged` (dev). Webview: run from `webview/`.

---

## Task 1: `InlineParamControl` C++ interface

**Files:**
- Create: `include/element/inlineparamcontrol.hpp`

- [ ] **Step 1: Create the interface header**

```cpp
// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <juce_core/juce_core.h>

namespace element {

/** One engine-described inline parameter for a built-in node whose controls
    render directly on the Block face. The engine is the source of truth for the
    current value AND its range (nothing-fake): the webview renders exactly what
    the node reports, never a fabricated control. */
struct InlineParamInfo
{
    juce::String key;   ///< stable id, matches the webview registry entry's `key`
    juce::String label; ///< human caption (webview may override)
    double value;       ///< current raw value (NOT normalised)
    double min;
    double max;
    double step;        ///< 0 = continuous; >0 = snap increment
};

/** Mixin implemented by built-in MIDI-FX nodes (the pizmidi-native family) so the
    webview host can enumerate + write their parameters generically — one
    `dynamic_cast<InlineParamControl*>` in the host serves every such node, so
    adding nodes never re-touches element_webview_host.cpp.

    Threading: setInlineParam is called on the MESSAGE thread; implementations MUST
    store into atomics the audio thread reads (relaxed). getInlineParams is called
    on the message thread (snapshot builder) and reads those atomics. */
struct InlineParamControl
{
    virtual ~InlineParamControl() = default;

    /** Apply a raw value to the named parameter. Returns false for an unknown key.
        Implementations clamp to their own range. */
    virtual bool setInlineParam (const juce::String& key, double value) = 0;

    /** Append this node's current inline parameters (value + range). */
    virtual void getInlineParams (juce::Array<InlineParamInfo>& out) const = 0;
};

} // namespace element
```

- [ ] **Step 2: Commit**

```bash
git add include/element/inlineparamcontrol.hpp
git commit -m "feat(nodes): add InlineParamControl interface for on-block params"
```

---

## Task 2: `MidiTransposeNode` implements `InlineParamControl` (+ atomic fix)

**Files:**
- Modify: `src/nodes/miditranspose.hpp`
- Test: `test/MidiTransposeInlineTests.cpp` (create)

- [ ] **Step 1: Write the failing test**

Create `test/MidiTransposeInlineTests.cpp`:

```cpp
// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>

#include <element/context.hpp>
#include <element/processor.hpp>
#include <element/inlineparamcontrol.hpp>

#include "nodes/miditranspose.hpp"
#include "engine/graphnode.hpp"

using namespace element;
using namespace juce;

BOOST_AUTO_TEST_SUITE (MidiTransposeInlineTests)

BOOST_AUTO_TEST_CASE (SetInlineParamShiftsNotesAndReports)
{
    Context context;
    GraphNode graph (context);
    ProcessorPtr node = graph.addNode (new MidiTransposeNode());

    auto* ip = dynamic_cast<InlineParamControl*> (node.get());
    BOOST_REQUIRE (ip != nullptr);

    // unknown key rejected
    BOOST_REQUIRE (! ip->setInlineParam ("nope", 5.0));

    // set +12 semitones via the inline surface
    BOOST_REQUIRE (ip->setInlineParam ("semitones", 12.0));

    Array<InlineParamInfo> infos;
    ip->getInlineParams (infos);
    BOOST_REQUIRE_EQUAL (infos.size(), 1);
    BOOST_REQUIRE (infos[0].key == "semitones");
    BOOST_REQUIRE_EQUAL ((int) infos[0].value, 12);
    BOOST_REQUIRE_EQUAL ((int) infos[0].min, -48);
    BOOST_REQUIRE_EQUAL ((int) infos[0].max, 48);

    // render a note → it is transposed up an octave (parity preserved)
    MidiBuffer midi;
    AudioSampleBuffer audio, cv;
    audio.setSize (2, 256, false, true, false);
    midi.addEvent (MidiMessage::noteOn (1, 60, (uint8) 100), 0);
    RenderContext rc (audio, cv, midi, audio.getNumSamples());
    node->render (rc);

    bool sawTransposed = false;
    for (auto m : midi)
        if (m.getMessage().isNoteOn() && m.getMessage().getNoteNumber() == 72)
            sawTransposed = true;
    BOOST_REQUIRE (sawTransposed);

    node = nullptr;
    graph.clear();
}

BOOST_AUTO_TEST_SUITE_END()
```

- [ ] **Step 2: Reconfigure + run test, verify it FAILS to build/link**

Run:
```bash
cmake -B build-merged -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0 >/dev/null
cmake --build build-merged --target test_element -j8 2>&1 | tail -20
```
Expected: compile error — `MidiTransposeNode` is not an `InlineParamControl` (cast compiles but `dynamic_cast` returns nullptr → test would fail), and `setInlineParam` is not a member. (The test references the interface; the node doesn't implement it yet.)

- [ ] **Step 3: Implement — make `semitones` atomic + add the interface**

In `src/nodes/miditranspose.hpp`:

Add includes after line 7 (`#include <element/processor.hpp>`):
```cpp
#include <element/inlineparamcontrol.hpp>
#include <atomic>
#include <cmath>
```

Change the class declaration (line 14) from:
```cpp
class MidiTransposeNode : public Processor
```
to:
```cpp
class MidiTransposeNode : public Processor, public InlineParamControl
```

Change the render read (line 41) from `const int shift = semitones;` to:
```cpp
        const int shift = semitones.load (std::memory_order_relaxed);
```

Change `getState` (line 75) from `const int val = semitones;` to:
```cpp
        const int val = semitones.load (std::memory_order_relaxed);
```

Change `setState` (line 85) from `semitones = juce::jlimit (-48, 48, val);` to:
```cpp
            semitones.store (juce::jlimit (-48, 48, val), std::memory_order_relaxed);
```

Replace the setter/getter (lines 116-117) with atomic versions + the interface:
```cpp
    /** Set transpose amount in semitones, clamped to [-48, 48]. */
    void setSemitones (int n) noexcept { semitones.store (juce::jlimit (-48, 48, n), std::memory_order_relaxed); }
    int  getSemitones() const noexcept { return semitones.load (std::memory_order_relaxed); }

    // InlineParamControl
    bool setInlineParam (const juce::String& key, double value) override
    {
        if (key == "semitones") { setSemitones ((int) std::lround (value)); return true; }
        return false;
    }
    void getInlineParams (juce::Array<InlineParamInfo>& out) const override
    {
        out.add ({ "semitones", "Semitones", (double) getSemitones(), -48.0, 48.0, 1.0 });
    }
```

Change the member (line 120) from `int semitones { 0 };` to:
```cpp
    std::atomic<int> semitones { 0 };
```

- [ ] **Step 4: Run test, verify it PASSES**

Run:
```bash
cmake --build build-merged --target test_element -j8 2>&1 | tail -5 && (cd build-merged && ctest -R "MidiTransposeInlineTests" --output-on-failure)
```
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/nodes/miditranspose.hpp test/MidiTransposeInlineTests.cpp
git commit -m "feat(nodes): MidiTranspose implements InlineParamControl (atomic semitones)"
```

---

## Task 3: `MidiVelocityAmpNode` implements `InlineParamControl`

**Files:**
- Modify: `src/nodes/midivelocityamp.hpp`
- Test: `test/MidiVelocityAmpInlineTests.cpp` (create)

- [ ] **Step 1: Write the failing test**

Create `test/MidiVelocityAmpInlineTests.cpp`:

```cpp
// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <element/context.hpp>
#include <element/processor.hpp>
#include <element/inlineparamcontrol.hpp>
#include "nodes/midivelocityamp.hpp"
#include "engine/graphnode.hpp"

using namespace element;
using namespace juce;

BOOST_AUTO_TEST_SUITE (MidiVelocityAmpInlineTests)

BOOST_AUTO_TEST_CASE (ScaleAndPowerExposed)
{
    Context context;
    GraphNode graph (context);
    ProcessorPtr node = graph.addNode (new MidiVelocityAmpNode());
    auto* ip = dynamic_cast<InlineParamControl*> (node.get());
    BOOST_REQUIRE (ip != nullptr);

    BOOST_REQUIRE (ip->setInlineParam ("scale", 2.0));
    BOOST_REQUIRE (ip->setInlineParam ("power", 0.5));
    BOOST_REQUIRE (! ip->setInlineParam ("bogus", 1.0));

    Array<InlineParamInfo> infos;
    ip->getInlineParams (infos);
    BOOST_REQUIRE_EQUAL (infos.size(), 2);
    BOOST_REQUIRE (infos[0].key == "scale" && infos[1].key == "power");
    BOOST_REQUIRE_CLOSE (infos[0].value, 2.0, 0.001);
    BOOST_REQUIRE_CLOSE (infos[1].value, 0.5, 0.001);
    BOOST_REQUIRE_CLOSE (infos[0].max, 2.0, 0.001);

    node = nullptr;
    graph.clear();
}

BOOST_AUTO_TEST_SUITE_END()
```

- [ ] **Step 2: Run, verify FAIL**

Run: `cmake --build build-merged --target test_element -j8 2>&1 | tail -20`
Expected: compile error (`setInlineParam` not a member / dynamic_cast nullptr).

- [ ] **Step 3: Implement**

In `src/nodes/midivelocityamp.hpp`: add includes near the existing `#include <element/processor.hpp>`:
```cpp
#include <element/inlineparamcontrol.hpp>
```
Change the class declaration from `class MidiVelocityAmpNode : public Processor` to:
```cpp
class MidiVelocityAmpNode : public Processor, public InlineParamControl
```
After the existing `getPower()` getter (line 135), add:
```cpp
    // InlineParamControl
    bool setInlineParam (const juce::String& key, double value) override
    {
        if (key == "scale") { setScale ((float) value); return true; }
        if (key == "power") { setPower ((float) value); return true; }
        return false;
    }
    void getInlineParams (juce::Array<InlineParamInfo>& out) const override
    {
        out.add ({ "scale", "Scale", (double) getScale(), 0.0, 2.0, 0.01 });
        out.add ({ "power", "Power", (double) getPower(), 0.25, 4.0, 0.01 });
    }
```

- [ ] **Step 4: Run, verify PASS**

Run: `cmake --build build-merged --target test_element -j8 2>&1 | tail -5 && (cd build-merged && ctest -R "MidiVelocityAmpInlineTests" --output-on-failure)`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nodes/midivelocityamp.hpp test/MidiVelocityAmpInlineTests.cpp
git commit -m "feat(nodes): MidiVelocityAmp implements InlineParamControl"
```

---

## Task 4: `PackMidiNode` implements `InlineParamControl`

**Files:**
- Modify: `src/nodes/packmidi.hpp`
- Test: `test/PackMidiInlineTests.cpp` (create)

- [ ] **Step 1: Write the failing test**

Create `test/PackMidiInlineTests.cpp`:

```cpp
// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <element/context.hpp>
#include <element/processor.hpp>
#include <element/inlineparamcontrol.hpp>
#include "nodes/packmidi.hpp"
#include "engine/graphnode.hpp"

using namespace element;
using namespace juce;

BOOST_AUTO_TEST_SUITE (PackMidiInlineTests)

BOOST_AUTO_TEST_CASE (CcAndChannelExposedAndClamped)
{
    Context context;
    GraphNode graph (context);
    ProcessorPtr node = graph.addNode (new PackMidiNode());
    auto* ip = dynamic_cast<InlineParamControl*> (node.get());
    BOOST_REQUIRE (ip != nullptr);

    ip->setInlineParam ("cc", 74.0);
    ip->setInlineParam ("channel", 99.0); // out of range → clamps to 16

    Array<InlineParamInfo> infos;
    ip->getInlineParams (infos);
    BOOST_REQUIRE_EQUAL (infos.size(), 2);
    BOOST_REQUIRE (infos[0].key == "cc" && infos[1].key == "channel");
    BOOST_REQUIRE_EQUAL ((int) infos[0].value, 74);
    BOOST_REQUIRE_EQUAL ((int) infos[1].value, 16);

    node = nullptr;
    graph.clear();
}

BOOST_AUTO_TEST_SUITE_END()
```

- [ ] **Step 2: Run, verify FAIL**

Run: `cmake --build build-merged --target test_element -j8 2>&1 | tail -20`
Expected: compile error.

- [ ] **Step 3: Implement**

In `src/nodes/packmidi.hpp`: add `#include <element/inlineparamcontrol.hpp>` near `#include <element/processor.hpp>`. Change declaration to:
```cpp
class PackMidiNode : public Processor, public InlineParamControl
```
After `getMidiChannel()` (line 130), add:
```cpp
    // InlineParamControl
    bool setInlineParam (const juce::String& key, double value) override
    {
        if (key == "cc")      { setCcNumber ((int) std::lround (value)); return true; }
        if (key == "channel") { setMidiChannel ((int) std::lround (value)); return true; }
        return false;
    }
    void getInlineParams (juce::Array<InlineParamInfo>& out) const override
    {
        out.add ({ "cc",      "CC #",    (double) getCcNumber(),    0.0, 127.0, 1.0 });
        out.add ({ "channel", "Channel", (double) getMidiChannel(), 1.0,  16.0, 1.0 });
    }
```
If `<cmath>` is not already included, add `#include <cmath>` (for `std::lround`).

- [ ] **Step 4: Run, verify PASS**

Run: `cmake --build build-merged --target test_element -j8 2>&1 | tail -5 && (cd build-merged && ctest -R "PackMidiInlineTests" --output-on-failure)`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nodes/packmidi.hpp test/PackMidiInlineTests.cpp
git commit -m "feat(nodes): PackMidi implements InlineParamControl"
```

---

## Task 5: `UnpackMidiNode` implements `InlineParamControl` (+ atomic fix)

**Files:**
- Modify: `src/nodes/unpackmidi.hpp`
- Test: `test/UnpackMidiInlineTests.cpp` (create)

**Note:** `unpackmidi.hpp` currently stores `ccNumber`/`midiChannel` as plain `int` (audio-thread-only). `setInlineParam` writes them from the message thread, so they MUST become atomic.

- [ ] **Step 1: Write the failing test**

Create `test/UnpackMidiInlineTests.cpp`:

```cpp
// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <element/context.hpp>
#include <element/processor.hpp>
#include <element/inlineparamcontrol.hpp>
#include "nodes/unpackmidi.hpp"
#include "engine/graphnode.hpp"

using namespace element;
using namespace juce;

BOOST_AUTO_TEST_SUITE (UnpackMidiInlineTests)

BOOST_AUTO_TEST_CASE (CcAndChannelExposed)
{
    Context context;
    GraphNode graph (context);
    ProcessorPtr node = graph.addNode (new UnpackMidiNode());
    auto* ip = dynamic_cast<InlineParamControl*> (node.get());
    BOOST_REQUIRE (ip != nullptr);

    ip->setInlineParam ("cc", 1.0);
    ip->setInlineParam ("channel", 1.0);

    Array<InlineParamInfo> infos;
    ip->getInlineParams (infos);
    BOOST_REQUIRE_EQUAL (infos.size(), 2);
    BOOST_REQUIRE_EQUAL ((int) infos[0].value, 1);
    BOOST_REQUIRE_EQUAL ((int) infos[1].value, 1);

    node = nullptr;
    graph.clear();
}

BOOST_AUTO_TEST_SUITE_END()
```

- [ ] **Step 2: Run, verify FAIL**

Run: `cmake --build build-merged --target test_element -j8 2>&1 | tail -20`
Expected: compile error.

- [ ] **Step 3: Implement — atomics + interface**

In `src/nodes/unpackmidi.hpp`: add includes `#include <element/inlineparamcontrol.hpp>`, `#include <atomic>`, `#include <cmath>`. Change declaration to:
```cpp
class UnpackMidiNode : public Processor, public InlineParamControl
```
Change the members (lines 129-130) from plain int to atomic:
```cpp
    std::atomic<int> ccNumber    { 0 };
    std::atomic<int> midiChannel { 1 };
```
Change the setters/getters (lines 123-126) to atomic load/store:
```cpp
    void setCcNumber (int cc) noexcept    { ccNumber.store (juce::jlimit (0, 127, cc), std::memory_order_relaxed); }
    int  getCcNumber() const noexcept     { return ccNumber.load (std::memory_order_relaxed); }
    void setMidiChannel (int ch) noexcept { midiChannel.store (juce::jlimit (1, 16, ch), std::memory_order_relaxed); }
    int  getMidiChannel() const noexcept  { return midiChannel.load (std::memory_order_relaxed); }
```
In `render()`, ensure the two params are read via the getters `getCcNumber()` / `getMidiChannel()` (which now do the atomic load). If `render()` reads the raw members `ccNumber` / `midiChannel` directly, replace those reads with the getter calls. (Open the file and confirm; the bodies in `getState`/`setState` likewise should route through the getters/setters or `.load`/`.store`.)
Add the interface after `getMidiChannel()`:
```cpp
    // InlineParamControl
    bool setInlineParam (const juce::String& key, double value) override
    {
        if (key == "cc")      { setCcNumber ((int) std::lround (value)); return true; }
        if (key == "channel") { setMidiChannel ((int) std::lround (value)); return true; }
        return false;
    }
    void getInlineParams (juce::Array<InlineParamInfo>& out) const override
    {
        out.add ({ "cc",      "CC #",    (double) getCcNumber(),    0.0, 127.0, 1.0 });
        out.add ({ "channel", "Channel", (double) getMidiChannel(), 1.0,  16.0, 1.0 });
    }
```

- [ ] **Step 4: Run, verify PASS (+ no regression on existing unpack tests)**

Run: `cmake --build build-merged --target test_element -j8 2>&1 | tail -5 && (cd build-merged && ctest -R "UnpackMidi" --output-on-failure)`
Expected: PASS (the new suite + any existing UnpackMidi suite).

- [ ] **Step 5: Commit**

```bash
git add src/nodes/unpackmidi.hpp test/UnpackMidiInlineTests.cpp
git commit -m "feat(nodes): UnpackMidi implements InlineParamControl (atomic cc/channel)"
```

---

## Task 6: C++ write bridge — `setInlineNodeParam` + `elementNodeSetParam`

**Files:**
- Modify: `include/element/ui/element_webview_host.hpp` (declaration after line 230)
- Modify: `src/ui/element_webview_host.cpp` (include; native fn after line 1395; method after line 7485)

- [ ] **Step 1: Add the header declaration**

In `include/element/ui/element_webview_host.hpp`, immediately after the `setNodeIntMode` declaration (line 230):
```cpp
    /** Set a named inline parameter on a built-in node implementing
        InlineParamControl (the MIDI-FX node family). Resolves uuid → Node →
        Processor, cross-casts to InlineParamControl, calls setInlineParam(key,
        value) (thread-safe relaxed store). Returns true when applied. */
    bool setInlineNodeParam (const juce::String& nodeUuid, const juce::String& key, double value);
```

- [ ] **Step 2: Add the include + implement the method**

In `src/ui/element_webview_host.cpp`, add near the other `#include <element/...>` headers at the top:
```cpp
#include <element/inlineparamcontrol.hpp>
```
After `setNodeIntMode`'s closing brace (after line 7485, before `#endif // JUCE_WEB_BROWSER`):
```cpp
bool ElementWebViewHost::setInlineNodeParam (const String& nodeUuid, const String& key, double value)
{
    auto sess = context.session();
    if (sess == nullptr || nodeUuid.isEmpty())
        return false;

    const Graph G (currentBoard());
    if (! G.isGraph())
        return false;

    const Node n = findNodeByUuidInGraph (G, nodeUuid);
    if (! n.isValid())
        return false;

    if (auto* proc = n.getObject())
        if (auto* ip = dynamic_cast<InlineParamControl*> (proc))
            return ip->setInlineParam (key, value);

    return false;
}
```

- [ ] **Step 3: Register the native function**

In `src/ui/element_webview_host.cpp`, immediately after the `elementNodeSetIntMode` registration block (after line 1395):
```cpp
    // P0-pizmidi — set a named inline parameter on a MIDI-FX node (InlineParamControl).
    //   Input:  args[0]=nodeUuid:String, args[1]=key:String, args[2]=value:number (raw)
    //   Output: bool — true when the node implements InlineParamControl and applied it.
    // On success, schedule a snapshot push so the UI reflects engine truth.
    registerFn (
        Identifier ("elementNodeSetParam"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 3)
            {
                const String uuid (args[0].toString());
                const String key (args[1].toString());
                const double value = (double) args[2];
                ok = setInlineNodeParam (uuid, key, value);
                if (ok)
                    scheduleGraphPush (40);
            }
            postCompletion (completion, ok);
        });
```

- [ ] **Step 4: Build the app library, verify it compiles**

Run:
```bash
cmake --build build-merged --target element -j8 2>&1 | tail -15
```
Expected: builds with no errors (warnings ok).

- [ ] **Step 5: Commit**

```bash
git add include/element/ui/element_webview_host.hpp src/ui/element_webview_host.cpp
git commit -m "feat(webview-host): elementNodeSetParam write bridge for InlineParamControl nodes"
```

---

## Task 7: C++ snapshot emit — `inlineParams` in `buildActiveGraphJson`

**Files:**
- Modify: `src/ui/element_webview_host.cpp` (in `buildActiveGraphJson`, after the `intMode` block at line 6651)

- [ ] **Step 1: Add the generic emit loop**

In `src/ui/element_webview_host.cpp`, inside the node loop of `buildActiveGraphJson`, immediately after the `else if (nodeIdentifier == "element.logic") { ... }` block (after line 6651) and before the `// Block plugin format` comment (line 6653):
```cpp
        // P0-pizmidi — emit inline parameters for any built-in node implementing
        // InlineParamControl (the MIDI-FX family). Generic: ONE loop serves every
        // such node, so adding nodes never re-touches this file. Engine is the
        // source of truth for value + range (nothing-fake). Cast-miss → key omitted.
        if (auto* proc = n.getObject())
            if (auto* ip = dynamic_cast<InlineParamControl*> (proc))
            {
                juce::Array<InlineParamInfo> infos;
                ip->getInlineParams (infos);
                Array<var> arr;
                for (const auto& pi : infos)
                {
                    DynamicObject::Ptr o (new DynamicObject());
                    o->setProperty ("key",   pi.key);
                    o->setProperty ("label", pi.label);
                    o->setProperty ("value", pi.value);
                    o->setProperty ("min",   pi.min);
                    o->setProperty ("max",   pi.max);
                    o->setProperty ("step",  pi.step);
                    arr.add (var (o.get()));
                }
                b->setProperty ("inlineParams", arr);
            }
```

- [ ] **Step 2: Build, verify compiles**

Run: `cmake --build build-merged --target element -j8 2>&1 | tail -15`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/element_webview_host.cpp
git commit -m "feat(webview-host): emit inlineParams in graph snapshot for MIDI-FX nodes"
```

---

## Task 8: Webview types — `InlineParamRow` + `BlockData.inlineParams`

**Files:**
- Modify: `webview/src/data/types.ts`

- [ ] **Step 1: Add the row type + the BlockData field**

In `webview/src/data/types.ts`, after the `BlockData` interface closes (after line 103), add:
```ts
/**
 * One engine-described inline parameter for a built-in MIDI-FX node implementing
 * InlineParamControl (pizmidi-native family). Emitted in the 60Hz graph snapshot;
 * the engine is the source of truth for value + range (nothing-fake).
 */
export interface InlineParamRow {
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
}
```
Inside `BlockData`, immediately after the `intMode?: number;` field (line 102), add:
```ts
  /**
   * Engine-described inline parameters for built-in MIDI-FX nodes that implement
   * InlineParamControl (pizmidi-native family). Drives the on-block `atomicKnob`
   * face. Absent for nodes that don't implement it (no fake controls).
   */
  inlineParams?: InlineParamRow[];
```

- [ ] **Step 2: Typecheck**

Run: `cd webview && npx tsc -b 2>&1 | tail -15`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add webview/src/data/types.ts
git commit -m "feat(webview): InlineParamRow type + BlockData.inlineParams"
```

---

## Task 9: Webview bridge — `nativeNodeSetParam`

**Files:**
- Modify: `webview/src/bridge/nativeGraph.ts` (after `nativeNodeSetIntMode`, line 672)

- [ ] **Step 1: Add the wrapper**

In `webview/src/bridge/nativeGraph.ts`, after the `nativeNodeSetIntMode` function (after line 672):
```ts
/**
 * Set a named inline parameter on a built-in MIDI-FX node implementing
 * InlineParamControl (pizmidi-native family). `value` is the RAW engine value
 * (not normalised) — the engine clamps to its own range. Returns true when the
 * host found the node, applied it, and pushed a fresh snapshot.
 */
export async function nativeNodeSetParam(
  nodeId: string,
  key: string,
  value: number,
): Promise<boolean> {
  const r = await invokeElementNative("elementNodeSetParam", [
    nodeId,
    key,
    value,
  ]);
  return r === true;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd webview && npx tsc -b 2>&1 | tail -15`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add webview/src/bridge/nativeGraph.ts
git commit -m "feat(webview): nativeNodeSetParam bridge wrapper"
```

---

## Task 10: `InlineAtomicKnob` component (+ pure quantize helper + tests)

**Files:**
- Create: `webview/src/components/canvas/inline/InlineAtomicKnob.tsx`
- Create: `webview/src/components/canvas/inline/InlineAtomicKnob.test.ts`
- Create: `webview/src/components/canvas/inline/InlineAtomicKnob.stories.tsx`

- [ ] **Step 1: Write the failing unit test for the pure quantizer**

Create `webview/src/components/canvas/inline/InlineAtomicKnob.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { knobRawFromNorm } from "./InlineAtomicKnob";
import type { InlineParamRow } from "../../../data/types";

const row = (over: Partial<InlineParamRow>): InlineParamRow => ({
  key: "k", label: "K", value: 0, min: -48, max: 48, step: 1, ...over,
});

describe("knobRawFromNorm", () => {
  it("maps normalised 0..1 onto [min,max] and snaps to step", () => {
    expect(knobRawFromNorm(0, row({}))).toBe(-48);
    expect(knobRawFromNorm(1, row({}))).toBe(48);
    expect(knobRawFromNorm(0.5, row({}))).toBe(0);
  });
  it("snaps to a coarse step and clamps", () => {
    const r = row({ min: 0, max: 127, step: 1 });
    expect(knobRawFromNorm(0.5, r)).toBe(64); // 63.5 → round → 64
    expect(knobRawFromNorm(2, r)).toBe(127); // clamp
    expect(knobRawFromNorm(-1, r)).toBe(0); // clamp
  });
  it("supports continuous (step 0)", () => {
    const r = row({ min: 0, max: 1, step: 0 });
    expect(knobRawFromNorm(0.33, r)).toBeCloseTo(0.33, 5);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `cd webview && npx vitest run --project unit InlineAtomicKnob 2>&1 | tail -15`
Expected: FAIL — `knobRawFromNorm` not exported / module missing.

- [ ] **Step 3: Implement the component + helper**

Create `webview/src/components/canvas/inline/InlineAtomicKnob.tsx`:
```tsx
/**
 * InlineAtomicKnob — on-block knob for a built-in MIDI-FX node parameter exposed
 * via InlineParamControl. Reads the engine-truth value/range from the graph
 * snapshot's `inlineParams` row and writes the RAW value via `nativeNodeSetParam`.
 * Unlike InlineMicroKnob's AudioProcessor-param path there is NO useParameterStore
 * here — the snapshot IS the source of truth. A short optimistic override keeps the
 * knob live during a drag until the next 60Hz snapshot echoes the committed value.
 */
import { useEffect, useRef, useState } from "react";
import type { InlineParamRow } from "../../../data/types";
import { InlineMicroKnob } from "./InlineMicroKnob";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Pure: normalised 0..1 → raw engine value, snapped to step and clamped. */
export function knobRawFromNorm(n: number, row: InlineParamRow): number {
  let raw = row.min + n * (row.max - row.min);
  if (row.step > 0) raw = Math.round(raw / row.step) * row.step;
  return clamp(raw, row.min, row.max);
}

const normFromRaw = (raw: number, row: InlineParamRow) =>
  row.max > row.min ? (raw - row.min) / (row.max - row.min) : 0;

interface InlineAtomicKnobProps {
  nodeId: string;
  row: InlineParamRow;
  label?: string;
  color?: "blue" | "orange" | "teal" | "purple";
  /** Write the RAW (un-normalised) value to the engine. */
  onWrite: (key: string, rawValue: number) => void;
}

export function InlineAtomicKnob({
  row,
  label,
  color = "teal",
  onWrite,
}: InlineAtomicKnobProps) {
  const [optimistic, setOptimistic] = useState<number | null>(null);
  const settleRef = useRef<number | null>(null);

  // Drop the optimistic override once the snapshot echoes our committed value.
  useEffect(() => {
    if (optimistic == null) return;
    if (Math.abs(row.value - optimistic) <= row.step / 2 + 1e-6) setOptimistic(null);
  }, [row.value, row.step, optimistic]);

  const rawShown = optimistic ?? row.value;
  const steps = row.step > 0 ? Math.max(1, Math.round((row.max - row.min) / row.step)) : undefined;

  const handleChange = (n: number) => {
    const raw = knobRawFromNorm(n, row);
    setOptimistic(raw);
    if (settleRef.current != null) window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(() => setOptimistic(null), 500);
    onWrite(row.key, raw);
  };

  return (
    <InlineMicroKnob
      value={normFromRaw(rawShown, row)}
      defaultValue={normFromRaw(row.value, row)}
      label={label ?? row.label}
      color={color}
      steps={steps}
      onChange={handleChange}
    />
  );
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `cd webview && npx vitest run --project unit InlineAtomicKnob 2>&1 | tail -15`
Expected: PASS (3 tests).

- [ ] **Step 5: Add a Storybook story**

Create `webview/src/components/canvas/inline/InlineAtomicKnob.stories.tsx`:
```tsx
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { InlineAtomicKnob } from "./InlineAtomicKnob";
import type { InlineParamRow } from "../../../data/types";

function Demo({ initial }: { initial: InlineParamRow }) {
  const [row, setRow] = useState(initial);
  return (
    <div style={{ width: 120, padding: 24, background: "#222226" }}>
      <InlineAtomicKnob
        nodeId="demo"
        row={row}
        onWrite={(key, value) => setRow((r) => ({ ...r, value }))}
      />
    </div>
  );
}

const meta = {
  title: "Canvas/Inline/InlineAtomicKnob",
  component: InlineAtomicKnob,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof InlineAtomicKnob>;
export default meta;
type Story = StoryObj<typeof InlineAtomicKnob>;

export const Semitones: Story = {
  render: () => (
    <Demo initial={{ key: "semitones", label: "Semitones", value: 0, min: -48, max: 48, step: 1 }} />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("Semitones")).toBeInTheDocument();
  },
};
```

- [ ] **Step 6: Commit**

```bash
git add webview/src/components/canvas/inline/InlineAtomicKnob.tsx webview/src/components/canvas/inline/InlineAtomicKnob.test.ts webview/src/components/canvas/inline/InlineAtomicKnob.stories.tsx
git commit -m "feat(webview): InlineAtomicKnob for engine-described node params"
```

---

## Task 11: Wire `atomicKnob` kind + `componentKey` faces + 4 registry entries

**Files:**
- Modify: `webview/src/components/canvas/inlineParams.ts` (union + spec field + 4 entries)
- Modify: `webview/src/components/canvas/inline/InlineFace.tsx` (render atomicKnob + componentKey)
- Modify (test): `webview/src/components/canvas/inlineParams.test.ts` (assert new entries valid)

- [ ] **Step 1: Write the failing test**

Append to `webview/src/components/canvas/inlineParams.test.ts` (create the file if absent, mirroring the import style of `inlineParams.ts`):
```ts
import { describe, it, expect } from "vitest";
import { getInlineFaceSpec, validateInlineFace } from "./inlineParams";

describe("pizmidi atomicKnob faces", () => {
  it("registers the 4 P0 MIDI-FX nodes", () => {
    for (const id of [
      "element.midiTranspose",
      "element.midiVelocityAmp",
      "element.packMidi",
      "element.unpackMidi",
    ]) {
      expect(getInlineFaceSpec(id)).toBeDefined();
    }
  });

  it("atomicKnob faces validate WITHOUT AudioProcessor param metadata", () => {
    const spec = getInlineFaceSpec("element.midiTranspose")!;
    // empty params array must NOT reject an atomicKnob-only face (it reads the
    // snapshot inlineParams, not the AudioProcessor param store).
    expect(validateInlineFace(spec, [])).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `cd webview && npx vitest run --project unit inlineParams 2>&1 | tail -15`
Expected: FAIL — specs undefined.

- [ ] **Step 3: Extend the union + spec + registry**

In `webview/src/components/canvas/inlineParams.ts`:

Add to the `InlineFaceEntry` union (after the `midiActivity` member, line 73):
```ts
  | {
      kind: "atomicKnob";
      /** InlineParamControl key; matches a row in the node's snapshot inlineParams. */
      key: string;
      label?: string;
      color?: "blue" | "orange" | "teal" | "purple";
    }
```
Add an optional field to `InlineFaceSpec` (after `entries`, around line 89):
```ts
  /**
   * Bespoke designed face. When set, InlineFace renders the mapped component
   * (resolved via FACE_COMPONENTS) and ignores `entries`. Used by expert-designed
   * archetype faces. A string key (not a component) keeps this module render-free.
   */
  componentKey?: string;
```
Add the 4 entries to `INLINE_FACE_REGISTRY` (after the `element.logic` entry, line 154):
```ts
  "element.midiTranspose": {
    entries: [{ kind: "atomicKnob", key: "semitones", color: "teal" }],
  },
  "element.midiVelocityAmp": {
    entries: [
      { kind: "atomicKnob", key: "scale", color: "teal" },
      { kind: "atomicKnob", key: "power", color: "teal" },
    ],
  },
  "element.packMidi": {
    entries: [
      { kind: "atomicKnob", key: "cc", color: "purple" },
      { kind: "atomicKnob", key: "channel", color: "purple" },
    ],
  },
  "element.unpackMidi": {
    entries: [
      { kind: "atomicKnob", key: "cc", color: "purple" },
      { kind: "atomicKnob", key: "channel", color: "purple" },
    ],
  },
```
**No change to `validateInlineFace` or `faceNeedsParamMeta`** — both already `continue`/skip on any kind that is not `"knob"`/`"toggle"`, so `atomicKnob` faces validate with empty params and trigger no AudioProcessor metadata fetch. (This is what keeps `Block.tsx` untouched.)

- [ ] **Step 4: Render the new kinds in InlineFace**

In `webview/src/components/canvas/inline/InlineFace.tsx`:

Add imports (after line 32):
```tsx
import { InlineAtomicKnob } from "./InlineAtomicKnob";
import { nativeNodeSetParam } from "../../../bridge/nativeGraph";
import { TransformFace } from "./faces/TransformFace"; // added in Task 13; see note
```
**Note:** `TransformFace` does not exist until Task 13. For Tasks 11–12, OMIT that import and the `FACE_COMPONENTS` map below; add them in Task 13. Implement the `atomicKnob` branch now.

At the very start of the `InlineFace` function body (after line 78's map setup, before the return — simplest is right after `const writeParam = ...` at line 109), add the component-face short-circuit (Task 13 only):
```tsx
  // Bespoke designed face (Task 13+). Resolved from a string key so inlineParams.ts
  // stays render-free. Reads engine truth from d.inlineParams itself.
  if (spec.componentKey) {
    const FaceComp = FACE_COMPONENTS[spec.componentKey];
    if (FaceComp) return <FaceComp d={d} />;
  }
```
And define the map near the top of the file (module scope, after imports) — Task 13 only:
```tsx
const FACE_COMPONENTS: Record<string, React.FC<{ d: BlockData }>> = {
  transform: TransformFace,
};
```
Inside the `spec.entries.map(...)` callback, after the `midiActivity` branch (line 132) and before the `// knob / toggle` comment (line 134), add:
```tsx
        if (entry.kind === "atomicKnob") {
          const row = d.inlineParams?.find((r) => r.key === entry.key);
          if (!row) return null; // honest skip: engine reports no such param
          return (
            <InlineAtomicKnob
              key={i}
              nodeId={d.id}
              row={row}
              label={entry.label}
              color={entry.color ?? "teal"}
              onWrite={(k, v) => void nativeNodeSetParam(d.id, k, v)}
            />
          );
        }
```

- [ ] **Step 5: Run vitest + typecheck, verify PASS**

Run:
```bash
cd webview && npx vitest run --project unit inlineParams 2>&1 | tail -15 && npx tsc -b 2>&1 | tail -10
```
Expected: vitest PASS; tsc clean. (For this task `FACE_COMPONENTS`/`TransformFace`/the `componentKey` short-circuit are NOT yet added — only the `atomicKnob` branch.)

- [ ] **Step 6: Commit**

```bash
git add webview/src/components/canvas/inlineParams.ts webview/src/components/canvas/inline/InlineFace.tsx webview/src/components/canvas/inlineParams.test.ts
git commit -m "feat(webview): atomicKnob inline faces wired for 4 MIDI-FX nodes"
```

---

## Task 12: Full build + integration gates + live smoke

**Files:** none (verification only)

- [ ] **Step 1: Reconfigure (new test .cpp files) + full build**

Run:
```bash
cmake -B build-merged -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0 >/dev/null && cmake --build build-merged -j8 2>&1 | tail -20
```
Expected: 0 errors.

- [ ] **Step 2: Run all new ctest suites + a regression sweep**

Run:
```bash
cd build-merged && ctest -R "Inline|MidiTranspose|MidiVelocityAmp|PackMidi|UnpackMidi" --output-on-failure
```
Expected: all PASS. (Read the summary line — do NOT trust a piped exit code.)

- [ ] **Step 3: Webview full gate**

Run:
```bash
cd webview && npx tsc -b 2>&1 | tail -5 && npm run test 2>&1 | tail -20
```
Expected: tsc clean; vitest all green (read the pass/fail summary).

- [ ] **Step 4: Build the webview bundle into the app + install**

Run:
```bash
cd webview && npm run build 2>&1 | tail -5
# force the dist→bundle copy (webview-only changes can leave the embedded bundle stale)
cd .. && cmake --build build-merged --target element_app -j8 2>&1 | tail -8
```
Expected: bundle rebuilt; note the new `index-*.js` marker.

- [ ] **Step 5: Live smoke — drive the engine path headlessly**

Run (from repo root):
```bash
cd agent-harness && cli-anything-element --json app launch --fresh
cli-anything-element --json verify assert --alive --no-crash
```
Then in the running app (Glen or scripted): add a **MIDI Transpose** block, confirm its on-block knob shows, drag it, and confirm transposed MIDI at the output (the parity ctest already proves the engine transform; this confirms the live UI→engine write path). Tear down:
```bash
cli-anything-element --json app kill
```
Expected: app alive, no crash; knob visible and editable.

- [ ] **Step 6: Commit (evidence note only — no code)**

If any evidence files are produced under `.omo/evidence/`, commit them; otherwise skip. No source changes in this task.

---

## Task 13: Transform archetype — expert design + Review-wizard gate

**Files:**
- Create: `webview/src/components/canvas/inline/faces/TransformFace.tsx` (design output)
- Create: `webview/src/components/canvas/inline/faces/TransformFace.stories.tsx`
- Modify: `webview/src/components/canvas/inline/InlineFace.tsx` (add `FACE_COMPONENTS` + `componentKey` short-circuit from Task 11 Step 4)
- Modify: `webview/src/components/canvas/inlineParams.ts` (swap transpose + velocityAmp to `componentKey: "transform"`)

**This is a DESIGN gate, not a red-green task.** It produces a bespoke designed face and routes through Glen.

- [ ] **Step 1: Run the expert design pass**

Dispatch the `oh-my-claudecode:designer` agent (model opus) with the named toolbelt — `ui-ux-pro-max`, `neumorphism-generator` (locked dark tokens in `webview/src/index.css`), `uiverse-galaxy`, `reactbits` — to design the **Transform archetype** on-block face. Hard constraints to pass to the agent:
  - Data contract: render from `d.inlineParams` rows (`{key,label,value,min,max,step}`); write via `nativeNodeSetParam(d.id, key, raw)`. Reuse/`compose` `InlineAtomicKnob`. No AudioProcessor params.
  - Covers `midiTranspose` (1 param: semitones) and `midiVelocityAmp` (2 params: scale, power) from one component that adapts to the rows present.
  - Neumorphic, signal-typed (MIDI teal `#2BC4C4`), adaptive density (face vs expand), judged on interaction (drag feel), never fakes a value.
  - Output: `webview/src/components/canvas/inline/faces/TransformFace.tsx` exporting `TransformFace: React.FC<{ d: BlockData }>`, plus a Storybook story with an interaction `play` test.

- [ ] **Step 2: Author the story + run story tests**

Run (Storybook MCP / CLI): author `TransformFace.stories.tsx`, then validate:
```bash
cd webview && npx vitest run --project unit faces/TransformFace 2>&1 | tail -15
```
Expected: PASS.

- [ ] **Step 3: Review-wizard gate (Glen)**

Present the Transform face via the Storybook Review wizard (side-by-side) for Glen's ACCEPT / revise verdict. Iterate until ACCEPT. Log to `.omo/audit/ui-comments.jsonl`. **Do not proceed without ACCEPT.**

- [ ] **Step 4: Wire the component face**

In `webview/src/components/canvas/inline/InlineFace.tsx`, add the `TransformFace` import, the `FACE_COMPONENTS` map, and the `componentKey` short-circuit (the code shown in Task 11 Step 4 that was deferred).
In `webview/src/components/canvas/inlineParams.ts`, change the `element.midiTranspose` and `element.midiVelocityAmp` registry entries to use the designed face:
```ts
  "element.midiTranspose": { componentKey: "transform", entries: [] },
  "element.midiVelocityAmp": { componentKey: "transform", entries: [] },
```
(`packMidi`/`unpackMidi` keep their generic `atomicKnob` entries until their own archetype pass.)

- [ ] **Step 5: Re-verify gates**

Run:
```bash
cd webview && npx tsc -b 2>&1 | tail -5 && npm run test 2>&1 | tail -15
```
Expected: tsc clean, vitest green.

- [ ] **Step 6: Commit**

```bash
git add webview/src/components/canvas/inline/faces/TransformFace.tsx webview/src/components/canvas/inline/faces/TransformFace.stories.tsx webview/src/components/canvas/inline/InlineFace.tsx webview/src/components/canvas/inlineParams.ts
git commit -m "feat(webview): expert-designed Transform archetype face (Review-wizard ACCEPT)"
```

---

## Self-Review

**Spec coverage (vs `pizmidi-native-nodes-design-2026-06-09.md`):**
- §5.2 `InlineParamControl` O(1) bridge → Tasks 1, 6, 7. ✓
- §5.1 node model / atomic params → Tasks 2–5. ✓
- §5.3 adaptive face / new entry-kinds → Tasks 10, 11 (atomicKnob; toggle/stepper/miniGrid deferred to P1/P2 when first needed — YAGNI). ✓
- §5.3 bespoke `component:` face → Task 11 (`componentKey`) + Task 13. ✓
- §6 expert design lane (toolbelt + archetype + Review-wizard gate) → Task 13. ✓
- §8 per-node MIDI parity tests + nothing-fake → Tasks 2–5 (render assertions); honest skip when engine reports no row (Task 11 Step 4). ✓
- §10 merge-safety (no Block.tsx) → confirmed: `validateInlineFace`/`faceNeedsParamMeta` skip `atomicKnob`; `componentKey` faces have empty `entries` → validate true, no meta fetch. ✓
- §11 P0 done = round-trip + drag→MIDI + gates + Transform ACCEPT → Task 12 + Task 13. ✓
- **Gap (intentional):** `channelFilter` (5th existing node) is excluded from P0 — its 16-bit mask is a Filter/Gate-archetype grid, designed in P1. Spec §11 said "5 existing nodes"; this plan wires 4 and defers the bitmask node with rationale. Flag for Glen at execution start.

**Placeholder scan:** No "TBD"/"add error handling"/"similar to". The only forward-reference is `TransformFace` (Task 13), explicitly gated with a note in Task 11 Step 4. ✓

**Type consistency:** `InlineParamInfo` field order `{key,label,value,min,max,step}` is used identically in Tasks 1, 2–5 (aggregate init), 7 (emit). Webview `InlineParamRow` mirrors it (Task 8) and is consumed by `knobRawFromNorm`/`InlineAtomicKnob` (Task 10) and the `atomicKnob` branch (Task 11). `nativeNodeSetParam(nodeId,key,value)` signature consistent across Tasks 6 (C++ args), 9 (wrapper), 10/11 (callers). ✓

---

## Execution Handoff

After Glen picks an execution mode, implement Tasks 1–12 as the testable foundation, then Task 13 (design gate). Verify each task's gate before moving on. Rebase onto the wave-3 tip whenever the parallel session commits.
