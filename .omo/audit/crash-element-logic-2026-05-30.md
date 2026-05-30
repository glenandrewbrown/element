# Crash Report — Logic Pro took down (Element/KV-Element AU loaded) — 2026-05-30

> Investigation only (READ-ONLY, no source edited). Author: debugger agent.
> Evidence files copied to `/tmp/logic_crash.ips` (source: `~/Library/Logs/DiagnosticReports/Logic Pro-2026-05-30-102744.ips`).

## TL;DR Verdict

| Question | Answer |
| --- | --- |
| **Which binary crashed?** | **Logic Pro 12.2 (build 6644)** — NOT Element. The DEV standalone (`build-merged`, pid 55904) is **still alive** and has **zero crash reports**. |
| **Exception** | `EXC_BAD_ACCESS (SIGSEGV)` · `KERN_INVALID_ADDRESS at 0x7f8bd99270e` (wild/unmapped pointer, "not in any region") · faulting thread **0 = main thread**. |
| **Where** | AppKit **Accessibility** incoming-message path: `CFRunLoopDoSource1` → `_AXXMIGCopyAttributeValue` → `NSAccessibilityPerformEntryPointBOOL` → `objc_opt_respondsToSelector` on a freed/garbage object. |
| **Root cause (CONFIRMED)** | A macOS accessibility query (Mach IPC from a system AX agent) hit a freed Accessibility peer on Logic's main thread, ~0.2 s after JUCE plugin editor windows were closing. Use-after-free of an `NSAccessibilityElement`. |
| **Root cause (HYPOTHESIS, NOT proven)** | The freed AX peer belonged to **Element's** JUCE editor. Plausible but **unproven** — see "Attribution caveat". |
| **Blocks the UI-redesign waves?** | **No.** Independent / pre-existing. See "Relation to redesign". |
| **Severity** | **HIGH** — a plugin crashing its host loses the user's unsaved DAW session, regardless of which binary's fault address it is. |

---

## 1. Which binary — evidence

- **Standalone DEV build** `build-merged/element_app_artefacts/Element.app/.../Element` — **pid 55904 ALIVE** (`pgrep -x Element` → 55904; `ps` shows it running since 10:28am, 0:32 CPU). Binary mtime **May 30 04:15:39**. **No `Element-*.ips` crash report exists** in `~/Library/Logs/DiagnosticReports/` (grep over all 45 reports = 0 hits). → The standalone did **not** crash.
- **Installed plugin** loaded into Logic: **`KV-Element`** AU at `/Library/Audio/Plug-Ins/Components/KV-Element.component` (also `-FX`, `-MFX`, `.vst3`), all **CFBundleShortVersionString = 2.2.0**, `CFBundleIdentifier = net.kushview.plugins.Element`, installed (root) **May 30 05:10:36**. This is this repo's Element fork (repo build_number = 17 → 2.2.0.17 family). It WAS instantiated in the crashed Logic session.
- **Crashed process**: `Logic Pro` pid 43220, `com.apple.logic10`, v12.2/6644, launched **08:15:09**, crashed (captureTime) **10:27:29.5676 +0100**. (System uptime 66000 s is the box, not Logic.)

## 2. Faulting stack (thread 0, `com.apple.main-thread`)

```
 0  libobjc.A.dylib   objc_opt_respondsToSelector
 1  AppKit            __NSAccessibilityEntryPointIsAccessibilityElement_block_invoke
 2  AppKit            NSAccessibilityPerformEntryPointBOOL
 3  AppKit            NSAccessibilityEntryPointIsAccessibilityElement
 4  AppKit            _accessibilityControlViewForCascadeWithObject
 …
 8  AppKit            -[NSObject(NSAccessibilityInternal) _accessibilityValueForAttribute:clientError:]
 9  AppKit            CopyAppKitUIElementAttributeValueNoCatch
10  AppKit            CopyAttributeValue
11  HIServices        _AXXMIGCopyAttributeValue      <-- incoming AX query over Mach IPC
12  HIServices        _XCopyAttributeValue
13  HIServices        mshMIGPerform
14  CoreFoundation    __CFRUNLOOP_IS_CALLING_OUT_TO_A_SOURCE1_PERFORM_FUNCTION__
15-17 CoreFoundation  __CFRunLoopDoSource1 / __CFRunLoopRun / CFRunLoopRunSpecific
18-22 HIToolbox/AppKit RunCurrentEventLoop … _DPSNextEvent
23  Logic Pro         (+28641597)
24  AppKit            -[NSApplication run]
25  AppKit            NSApplicationMain
27  dyld              start
```

Interpretation: this is an **inbound** accessibility request (Source1 / Mach `_AXXMIGCopyAttributeValue`), not Logic walking its own tree. The system accessibility infrastructure asked "is this an accessibility element?" and AppKit called `respondsToSelector:` on an object whose backing storage had been freed → wild deref at `0x7f8bd99270e`.

## 3. Timeline correlation (system log, `log show` 10:25–10:28)

- `10:27:28.742` Logic closing `LgHUDPluginWindow` (a plugin HUD).
- `10:27:29.335` **`JUCEWindow_2b12aff0f742d9cf` finishing close** (a JUCE plugin editor window).
- `10:27:29.352` a second **`JUCEWindow_2b12aff0f742d9cf` finishing close** + many XPC connections cancelled, FSEvents teardown assertions firing.
- `10:27:29.5676` **CRASH** (AX UAF on main thread).
- Accessibility services were active system-wide at the time (`AXS AccessibilityEnabled: (app ax:1)`; `AXVisualSupportAgent`, `AccessibilityVisualsAgent`, `accessibility.dfrhud` all running).

→ The fault occurs **immediately after JUCE plugin-window teardown**, while an AX agent was live. Classic editor-teardown / AX-peer-lifetime race.

## 4. Attribution caveat (why Element-ownership is HYPOTHESIS, not fact)

Two facts block a confident "Element did it":

1. **Multiple JUCE plugins were loaded.** Logic logged **three distinct `JUCEWindow_` hashes** this session: `1899f39e2294800e` (92), `2b12aff0f742d9cf` (117, the one closing at crash time), `a7d92b6717b05cda` (20). The loaded-image set also includes other JUCE plugins (Gullfoss, RC-20 Retro Color, etc.). The closing `2b12aff0…` window is **assumed** to be Element's but is not established — JUCE window-name hashes derive from the window class and can be shared across JUCE-8 plugins.
2. **The AX-Source1 UAF-on-`respondsToSelector` signature is a known generic macOS/AppKit pattern.** Scan result: it appears in **exactly one** of the 45 reports (today's Logic crash) and in **no** other app and **no** Retired report — so it is not a recurring everything-crashes signature here, but with n=1 this neither confirms nor excludes Element ownership.

**What IS proven:** Element/KV-Element was loaded and its editor was open (thread 111 = `juce::Timer::TimerThread` waiting — the benign 60 Hz value-tree timer; Element appears in **no** other thread and **not** in the faulting stack). A JUCE editor window closed ~0.2 s before the fault. The fault is AX-UAF on the main thread.

**Discriminating follow-up (not run here, needs runtime):** confirm whether `2b12aff0f742d9cf` is Element's window class hash vs. another loaded JUCE plugin; reproduce by toggling VoiceOver / an AX client on while opening+closing the Element editor in Logic.

## 5. CLAUDE.md gotchas — which match

- **PluginEditor teardown / heap corruption** (CLAUDE.md "Close plugin windows and clear content BEFORE removing from JUCE component hierarchy") — **directly adjacent**. Today's crash is one layer below the C++ object graph: the macOS **AX peer** of the JUCE views, not the `Component` itself. Current `PluginEditor::~PluginEditor()` (`src/plugineditor.cpp:351-380`) is already hardened for the C++ ordering (closes windows, clears content while parent chain intact) — that ordering does NOT cover AX-peer lifetime vs. in-flight Mach AX queries.
- **PluginProcessor init in ctor** (`src/pluginprocessor.cpp:90-94`) — matches the **older May-24** crashes, not today's (see below). Already mitigated in current source.
- **Audio-thread RT-safety / sandbox** — **not implicated** (fault is main thread, AppKit AX; no audio-thread or sandbox frame).

### Prior crashes (same Logic, May 24) — context, ALREADY mitigated in source
- `Logic Pro-2026-05-24-191147.ips`: EXC_BAD_ACCESS @ null in `element::Context::session()` ← `PluginProcessor::setStateInformation` ← `JuceAU::RestoreState` ← `AUMethodSetProperty`. = the "Context-in-ctor / state-restore-before-init" gotcha. Current source defends this (`pluginprocessor.cpp:90-94, 403-428`: defers init, AsyncStateRestore off message thread).
- `Logic Pro-2026-05-24-200259.ips` & `-201051.ips`: `abort()` from `malloc_report` (heap corruption) in `juce::Component::~Component()`. = the teardown heap-corruption gotcha. Current `~PluginEditor` ordering (`plugineditor.cpp:368-377`) defends this.

These three are a **different bug family** from today's AX-UAF, and the current tree already addresses them. Whether the **installed 2.2.0 (05:10) plugin** contains those fixes is unverified (installed binary may lag HEAD).

## 6. Relation to the UI-redesign work — INDEPENDENT (does not block)

- Recent work was **webview-only** (Waves F/A/B: TS/CSS/stories, commits `8eed79aa` + `74d71389`) plus a trivial `juce::` qualification in `reroutenode.hpp` (`0936d558`).
- The **installed plugin** (05:10) predates the `reroutenode.hpp` edit (source mtime **05:19**) and the standalone binary (04:15) also predates it → **neither running binary even contains** that change.
- The crash path is native **AppKit AX + window teardown** — untouched by webview TypeScript/CSS or the reroute qualification.
- **No causal link to launching the DEV standalone**: the standalone launched 10:28 (a *separate* process, still alive, no crash report); Logic crashed 10:27:29. Near-simultaneous in wall-clock, but process-isolated — launching the dev build did not take Logic down.

→ Pre-existing / environmental. **Does NOT block the redesign waves.**

## 7. Recommended fix (investigation lane, not a one-line edit)

This is a JUCE **accessibility-peer lifetime** issue, not the already-hardened C++ teardown order. Do NOT "fix" by editing the `~PluginEditor` order again. Lanes to investigate (owner: debugger → executor once localized):

1. **AX teardown before window close**: ensure JUCE `AccessibilityHandler`/`NSAccessibilityElement` peers for the editor subtree are invalidated *before* the window/native peer is destroyed, so an in-flight Mach AX query cannot deref a freed peer. Files: `src/plugineditor.cpp` (`~PluginEditor`, `src/plugineditor.hpp`).
2. **Consider `setAccessible(false)`** on the heavy WebBrowser/graph editor subtree if AX exposure is not needed for the plugin editor — removes the peer surface the AX agent can race against.
3. **JUCE version check**: confirm the bundled JUCE (`deps/juce`) carries upstream macOS AX-lifetime fixes; this AX-on-respondsToSelector UAF has had JUCE-side patches.
4. **Reproduce + attribute first** (gate before coding): enable VoiceOver/an AX client, open the Element editor in Logic, close it repeatedly; confirm `2b12aff0…` is Element's window. If it's another JUCE plugin's window, re-route the lane.

**Verification when fixed**: with VoiceOver active, open/close the Element editor in Logic ≥20× and via project save/close with the editor open — no AX-UAF crash; `log show` shows AX agent queries returning cleanly during teardown.

---

### Evidence index
- `~/Library/Logs/DiagnosticReports/Logic Pro-2026-05-30-102744.ips` (faulting report) → `/tmp/logic_crash.ips`
- `~/Library/Logs/DiagnosticReports/Logic Pro-2026-05-24-{191147,200259,201051}.ips` (prior, different family, mitigated)
- `src/plugineditor.cpp:351-380` (editor teardown — current hardened ordering)
- `src/pluginprocessor.cpp:90-94, 321-353, 397-428, 535` (deferred init, createEditor, async state restore)
- `ps`/`pgrep`: standalone pid 55904 alive; `defaults read` KV-Element 2.2.0 net.kushview.plugins.Element
