> 🔴 **DEAD LEDGER — historical only.** Tracks the Pass-1 wave work that was denied + reverted (`8d9575f9`). Current state + plan: `.omo/PROJECT-STATE.md`.

# OMC UI-Redesign — Live Progress Ledger

> Plan: `.omo/plans/ui-redesign-OMC-execution.md` · Surface: `/oh-my-claudecode:team` (single-git-writer) · Baseline SHA `0936d558`
> Scope this run: all waves, **PAUSE at every GATE** for Glen+Chromatic.
> Legend: ✅ done · 🔄 in progress · ⏳ pending · 🚧 blocked-on-decision · ⛔ blocked-on-dep · ⏸️ gate (waits for Glen)
> Last updated: 2026-05-30 (GATE F, pre-commit)

---

## Pre-Flight (§4) — ✅ DONE

- ✅ Dirty tree resolved: `reroutenode.hpp` committed `0936d558`; rest allow-listed (`plan-baseline-allowlist.md`)
- ✅ Baseline SHA `0936d558` · test:all **1058/1058 pass, 0 fail**
- ✅ TMPDIR `.omo/tmp` (3.2 TiB free) · ✅ Canary (sonnet pins 200k)

## WAVE F — Foundation — ✅ DONE · ✅ GATE F PASSED (Glen confirmed; commit `8eed79aa`)

| Lane | What                              | Status | Evidence                                  |
| ---- | --------------------------------- | ------ | ----------------------------------------- |
| F1   | density tokens (index.css)        | ✅      | 15 tokens, color-guard clean, tsc/build 0 |
| F2   | shell+nav IA + F0 shelve          | ✅      | shelve+left-nav, tsc/build 0              |
| F3   | G-29 C++ discovery spec           | ✅      | **verdict: 2-node** + transport fork A/B  |
| F4   | Records audit+freeze              | ✅      | `label` field, catConfig exported, tsc 0  |
| F5   | Tier-2 + G-30 spikes              | ✅      | Tier-2=overlay-only; G-30=**20b**         |
| F6   | demoGraph fixtures + SB/Chromatic | ✅      | 4 fixtures, vitest storybook 170/170      |
| F7   | perf baselines + guard            | ✅      | budgets+re-run cmd (actuals→E1)           |

### ⏸️ GATE F — foundation COMMITTED `8eed79aa` (11 files +683/-30) · awaiting Glen go + decisions

- ✅ Diff review: color-guard clean, no DESIGN.md clobber (new file), 6 code files + fixtures/
- ✅ `tsc -b` 0 · ✅ `npm run build` (= `tsc -b && vite build`) 0 → **production build resolves the dep graph** (key soundness proof) · ✅ `vitest --project storybook` 170/170 (mounts all 170 stories)
- ⚠️ `verify-stories` (dev-server) — environmentally blocked: uniform `504 Outdated Optimize Dep`, persists across warm + double-pass (hypothesis falsified), **zero real throws**. Vite dev-server never stabilizes this session (addon-vitest watchers contend `.vite`). NOT a Wave-F regression — untouched stories (neu-icon, reactbits-blurtext) fail identically → would fail on baseline too.
- 🔄 DURABLE FIX (runs once, becomes the standing gate cmd for ALL waves): verify against a **static storybook build** (`build-storybook` → serve `:6007` → `SB_URL=… verify-stories`) — no Vite optimize churn + covers the ~37 **autodocs** pages that vitest does NOT (the only surface still unverified). Job `bfjuqa887`.
- ⏳ THEN: if static verify green → commit foundation (1 git call) → freeze hot files → **report to Glen w/ 3 decisions**. (If it surfaces a real autodocs throw → fix-lane, no commit.)

### ✅ GATE F DECISIONS — Glen confirmed 2026-05-30
1. **G-29 transport = Package B** (auto-managed hidden arcs; engine untouched). → C1 spec locked.
2. **G-30 = Branch 20b** (serialize real `NodePopupMenu` → new native bridge; stable semantic itemIds). → D4 = hybrid C++ lane.
3. **C3 Tier-2 = acknowledged**: Tier-3 info-card default + optional on-demand single overlay; no N-simultaneous live previews.
4. **Proceed = launch A + B in parallel now**; Wave C (Package B) deferred until after GATE A/B.

---

## WAVE A — pilots — ✅ DONE · committed `74d71389` · ⏸️ GATE A/B awaiting Glen confirm

- ✅ A1 G-01 VirtualKeyboard (f1): black-key fix, velocity-Y, octave, Mod+CC, 8 stories · ✅ A2 G-08 LiveHealth (f2): per-type I/O, honest no-data, engine-idle
- 🔧 A1-fix #15 (f1): VelocityByY story fails STATIC verify only (top-click vel 95, expect <50; passes vitest) — diagnose real-bug-vs-test-fragility, pass both harnesses
- ⏸️ GATE A (soft)

## WAVE B — nav/IA — ✅ DONE · committed `74d71389`

- ✅ B1 SessionTree (b1): breadcrumb + Container/4-cat badges + routing cue, zero "Graphs" UI label, 6 stories · ✅ B2 ToolPalette (b2): CPU removed, 3-tab + 4-cat filters · ✅ B3 SnippetShelf (b34): vertical left-nav + label + PANIC · ✅ B4 QuickAccess (b34): per-block CPU/latency/badges + LiveHealth-consistent footer · ✅ B5 BusInspector (b5): sender/receiver highlights, drag target, orphan chip
- ⏸️ GATE B / B-C carry-items:
  - 📌 **B1-bridge-category**: `buildGraphOutlineRecursive()` (element_webview_host.cpp:602-618) emits no `category`/routing → SessionTree badges are fixture-only at runtime; C1 bridge work should emit `category` per outline node (G-12 live fidelity).
  - 📌 **B5 live wiring**: BusInspector senders/receivers confirmed at runtime after C2 (Bus node).
- Gate A+B AC: tsc 0 · vitest storybook 176/176 · static verify 212/213 (only VK VelocityByY red → fix #15). Commit A+B after #15 green.

## WAVE C — C++ Bus node → BlockEmbed (pipeline) — 🟢 Package B locked · deferred to post-GATE-A/B

- 🟢 C1 G-29 Bus node C++ = **Package B (hidden arcs)**, 2-node BusSend/BusReceive; also add `"bus"→modulator` (purple ⬡) keyword in blockcategory.hpp → ⛔ C2 build+bundle+evidence → ⛔ C3 G-20-23 BlockEmbed rebuild (Tier-3 default + on-demand overlay)
- ⏸️ GATE B-C (Glen+Chromatic; B5 runtime-confirm after C2)

## WAVE D — cables + canvas — ⏳ pending

- ⏳ D1 G-24/25/26/27/28 Cable (single owner, deps C2) · ⏳ D2 G-31 CommentFrame (F2) → ⛔ D3 G-32 GraphCanvas auto-layout (D2) · 🚧 D4 G-30 CommandPalette (needs 20b confirm, deps F5)
- ⏸️ GATE D

## WAVE E — bug/perf re-verify — ⏳ pending

- ⏳ E1 perf re-run vs F7 baselines · ⏳ E2 28-bug reconciliation + new findings
- ⏸️ GATE E

## WAVE FINAL — review (∥, Claude-only) — ⏳ pending

- ⏳ R1 Must-NOT grep audit · R2 C++ RT-safety · R3 real manual QA · R4 scope-fidelity vs baseline
- ⏸️ GATE B(final) — Glen confirms all → confirmation-log.md · do NOT push

---

## CRASH-FIX (out-of-band)

> Report: `.omo/audit/crash-element-logic-2026-05-30.md` · Investigation 2026-05-30 (READ-ONLY, no source touched).

- 🆕 **CF1 — Logic Pro host crash w/ Element AU loaded** · owner: **debugger→executor** (reproduce+attribute BEFORE coding) · **does NOT block redesign waves** (independent; webview-only changes + reroute qualification are not in the crash path; neither running binary even contains the reroute edit).
  - **Verdict**: Logic Pro 12.2 crashed (`EXC_BAD_ACCESS`/SIGSEGV, wild ptr, main thread) in AppKit **Accessibility** inbound path (`_AXXMIGCopyAttributeValue`→`NSAccessibilityPerformEntryPointBOOL`→`objc_opt_respondsToSelector` on freed obj), ~0.2 s after JUCE plugin editor windows closing. **Element standalone (pid 55904) is ALIVE, zero crash reports — did NOT crash.** Installed plugin = KV-Element 2.2.0 (`net.kushview.plugins.Element`, installed 05:10).
  - **Root cause** — CONFIRMED: use-after-free of an `NSAccessibilityElement` peer during/after JUCE editor teardown while a macOS AX agent (VoiceOver-class) queried over Mach IPC. HYPOTHESIS (unproven): the freed peer was Element's editor (3 distinct JUCE plugins were loaded; closing `JUCEWindow_2b12aff0` not yet attributed to Element).
  - **Severity HIGH** (plugin crashing host = lost DAW session) regardless of fault address ownership.
  - **Proposed fix** (lane, not 1-liner; current `~PluginEditor` C++ order at `plugineditor.cpp:351-380` is already hardened for the *May-24* heap-corruption family — different bug): (1) invalidate JUCE AX peers before native window destroy; (2) consider `setAccessible(false)` on the WebBrowser/graph editor subtree; (3) verify bundled `deps/juce` has upstream macOS AX-lifetime fixes; (4) **gate**: reproduce w/ VoiceOver on + confirm the closing window is Element's before any edit.
  - Prior `Logic Pro-2026-05-24-*.ips` (Context-null-in-setStateInformation, `~Component` heap corruption) = older family, **already mitigated in current source** (`pluginprocessor.cpp:90-94,403-428`).
