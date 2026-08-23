# HANDOFF CONTEXT — 2026-05-08 (day 2 — UI/UX polish + classic-UI rescue)

**For the next session.** Phase D shipped + Gate 1.5 closed earlier today. This second session was a hard pivot to user-visible classic-UI polish after Glen reported: (1) plugin scanner crashes, (2) "completely broken" React UI, (3) "appalling" classic-UI nav icons, (4) tiny unusable buttons. All Glen-reported symptoms either fixed or root-caused. One hang regression I introduced was diagnosed and reverted within the same session.

**Predecessors:**
- [`.sisyphus/HANDOVER_2026-05-08.md`](file:///Volumes/Projects/Development_Projects/Github_Repos/element/.sisyphus/HANDOVER_2026-05-08.md) — original morning session (Wave 1 close-out, master-plan v3 rewrite)
- [`.sisyphus/HANDOVER_2026-05-08-phase-d.md`](file:///Volumes/Projects/Development_Projects/Github_Repos/element/.sisyphus/HANDOVER_2026-05-08-phase-d.md) — Phase D mid-flight handover
- [`.sisyphus/handoffs/handoff-20260508-1523-gate-1.5-closed.md`](file:///Volumes/Projects/Development_Projects/Github_Repos/element/.sisyphus/handoffs/handoff-20260508-1523-gate-1.5-closed.md) — Gate 1.5 closure
- [`.sisyphus/plans/master-fix-plan.md`](file:///Volumes/Projects/Development_Projects/Github_Repos/element/.sisyphus/plans/master-fix-plan.md) v3 — still authoritative
- [`.sisyphus/plans/snapshot-extension-design.md`](file:///Volumes/Projects/Development_Projects/Github_Repos/element/.sisyphus/plans/snapshot-extension-design.md) — F-block-3 design memo (paused per Glen)
- [`docs/ELEMENT_V3_DESIGN_TOKENS_REFERENCE.md`](file:///Volumes/Projects/Development_Projects/Github_Repos/element/docs/ELEMENT_V3_DESIGN_TOKENS_REFERENCE.md) — extracted V3 tokens (NEW)

---

## 1 · Repo state at handoff

| Field | Value |
|---|---|
| Branch | `local-enhancements` |
| HEAD | `5f2f576b feat(webview): install Storybook 10 + add 3 example stories` |
| Commits this session | **12** (all in `0e67448b..HEAD` along with the 9 Phase D commits) |
| Total since prior session HEAD `0e67448b` | **21** |
| ctest (Release) | **71 / 71** (post volatile-patch fix to `GuardCountsWhenArmed`) |
| vitest | **189 / 189** (no regressions; H-coverage Tier-1 baseline preserved) |
| tsc | **clean** |
| Webview build | unchanged from prior session — main 213 kB / gzip 53 kB |
| Latest installer | [`Element-2.2.0.16.dmg`](file:///Volumes/Projects/Development_Projects/Github_Repos/element/installer/output/Element-2.2.0.16.dmg) — 89 MB, built 22:52, ad-hoc signed, x86_64 |
| Working tree | clean of tracked changes |

---

## 2 · The 12 commits this session (chronological)

### Wave-2 close-out (5 commits)

| HEAD | Subject | Summary |
|---|---|---|
| `0b3d3538` | docs(repo): hierarchical AGENTS.md (root index + 7 children) | Per-subsystem AGENTS.md drill-down (`src/`, `src/engine/`, `src/nodes/`, `src/ui/`, `include/element/`, `webview/`, `test/`) + root index with code-map and anti-patterns |
| `86dc121b` | test(webview): mockJuceBridge helper | Reusable bridge mock used by all 10 H-cov-2 bridge tests |
| `5b70011a` | test(webview): H-cov-1 store tests +45 | 5 stores: useAppStore, useGraphStore, useSessionStore, useDashboardStore, sceneActivation, markParameterMapped |
| `76209438` | test(webview): H-cov-2 bridge wrapper tests +87 | 10 bridge modules (bridgeError, juceBackend, nativeApp, nativeEngineSnapshot, nativeGraph, nativeKeyboard, nativePerform, nativePluginEditor, nativePrefs, nativeSession) |
| `09469b47` | test(webview): H-cov-3..5 hooks + stale-fetch + empty-state +11 | useJuceBridge tests + PresetStrip stale-fetch + 3 empty-state tests + `PHASE_H_COVERAGE_AUDIT.md` |

After these: vitest 46 → 189 (+143 tests vs +24 master-plan target = 595% over-delivery). H-coverage Tier-1 PASS.

### Plugin-scanner stability + UX (1 commit)

| HEAD | Subject | Summary |
|---|---|---|
| `4b43590a` | fix(plugins): re-enable Phase D sandbox + crash-aware scan dialog | Glen reported scanner crashes on AU plugins. Root cause = AU plugins crashing in their own constructors during JUCE OOP scan (Antares, UAD, iZotope, PSP — 18 in `~/Library/Application Support/Kushview/Element/scanner/crashed.txt`). Sandbox isolation was DISABLED in `Settings::shouldSandboxPlugin` (left over from before Phase D). Fixed by reading user preference + bumping default to 2 (ProblematicOnly = AUs sandboxed). Plus rewrote `PluginListComponent::scanFinished` dialog to surface the truth ("plug-ins crashed in their OWN constructor, not Element") and point to Quick Scan (`ae848351`) workaround. |

### V3 design system port to classic UI (3 commits)

| HEAD | Subject | Summary |
|---|---|---|
| `7eaf07a5` | feat(ui): port V3 colour palette into classic LookAndFeel_E1 | Replaced `LookAndFeel_E1` defaults with V3 tokens: canvas `#1e1e22`, panel `#222226`, surface `#252529`, text `#e5e5ea`, teal accent `#2bc4c4`. Major fix: `PopupMenu::backgroundColourId` was light-grey `#fff0f0f0` on a dark host — now matches theme. Plus `docs/ELEMENT_V3_DESIGN_TOKENS_REFERENCE.md` (451 lines) extracted from `webview/src/index.css` as the porting reference. |
| `0dd06d5a` | feat(ui): V3 button polish + Release-build alloc-test fix | `drawButtonBackground` rewritten with 4px corners + neumorphic-style 1px highlight/shadow strokes (no expensive blur). Plus 1-line `volatile`/`juce::ignoreUnused` fix for `AudioThreadAllocationTests/GuardCountsWhenArmed` which was failing in Release builds because `-O3` dead-code-eliminated the synthetic `new int(42); delete` probe. Test suite went 70/71 → 71/71. |
| `12c85c82` | fix(ui): plugin tree by manufacturer + bump toolbar/nav/scale density | (a) Replaced `KnownPluginList::createTree(sortByCategory)` (which produced "Fx\|Delay\|Modulation\|Pitch Shift" garbage paths) with `buildElementPluginTree()` that emits a clean two-level tree (Effect/Instrument/MIDI Effect/Other → manufacturer → plugin name). (b) Density bumps: `toolBarSize 32→40`, `statusBarSize 22→28`, tempo bar `152×24→220×32`, font `18→22pt`, nav strip `iconStripWidth 24→36 / iconCellSize 24→36 / iconDrawSize 14→20` + V3 colours (active=teal). (c) `Settings::getDesktopScale` default `1.0 → 1.15` (universal 15% scale-up). |

### Sandbox regression revert (1 commit)

| HEAD | Subject | Summary |
|---|---|---|
| `e7ba5c97` | fix(plugins): default sandbox mode 2->0 (Phase D not safe with real AUs) | Glen reported "(not responding)" hang. Root cause: my `4b43590a` default-mode-2 change made auto-scan-on-start route AU plugins through the Phase D sandbox during initial enumeration. Phase D's Gate 1.5 stress test only used the in-tree `TestEchoPluginInstance` — real third-party AUs at initial-load triggered an unrecovered handshake hang. Reverted default to 0 (Disabled). Sandbox stays available via Preferences → Plugins → Sandbox Mode dropdown for users who want crash isolation. **Phase D sandbox is built but NOT validated against real AUs end-to-end.** This is a known gap. |

### Classic-UI nav-icon redesign (1 commit)

| HEAD | Subject | Summary |
|---|---|---|
| `d0bad1ee` | fix(ui): redesign nav icons (folder/search/sliders/pencil) on 24x24 viewbox | Replaced 4 crude 12px-viewbox JUCE Path icons (stair-step rectangles + rotated rectangle handles) with cleaner lucide-style 24×24 paths: Folder for Sessions, smoothly stroked magnifier for Browse, 3 stroked tracks + offset knobs for Inspector, proper pencil with eraser band for Editor. |

### Storybook foundation (1 commit)

| HEAD | Subject | Summary |
|---|---|---|
| `5f2f576b` | feat(webview): install Storybook 10 + add 3 example stories | Storybook 10.3.6 + `@storybook/react-vite` + `@storybook/addon-themes` + `@storybook/addon-a11y`. Compatible with project's React 19 / Vite 8 / Tailwind 4 / TypeScript 5.9 stack. `.storybook/main.ts` + `.storybook/preview.ts` with V3 dark backgrounds. 3 example stories shipped (NeuButton, NeuKnob, EmptyState — 14 total story variants). `npm run storybook` (port 6006) + `npm run build-storybook`. Note: Storybook only applies to React webview, NOT classic JUCE C++ UI — pushed back on this part of Glen's request explicitly. |

---

## 3 · Glen-reported issues — disposition

| Reported | Root cause | Disposition |
|---|---|---|
| "Element crashes when I scan for plugins" | 18 specific AU plugins crash in their own constructors (Antares, UAD, iZotope, etc.). JUCE's OOP scanner blacklists each via crashed.txt. User perceives serial scanner-subprocess crashes as Element crashing. | **Fixed**: `4b43590a` enriches the post-scan dialog to explain the truth + point to Quick Scan. Manual workaround: Options menu → "Quick Scan (no validation)". |
| "completely broken React UI" | Process runs, registers as foreground app, but headless query reports 0 windows. Could not pin root cause via headless investigation — testing methodology may itself be unreliable for JUCE webview windows. | **Investigated, not fixed**. Needs Glen at the keyboard. Specific symptom needed: blank window? shell renders no content? frozen splash? |
| Element shows "(not responding)" | My `4b43590a` re-enabled sandbox at default mode 2 → auto-scan-on-start tried to spawn sandbox subprocesses for every AU, hung on first plugin handshake. | **Fixed**: `e7ba5c97` reverted default to 0. Existing user conf with `pluginSandboxMode=0` written by my earlier conf-edit ALSO bypasses this. |
| "Plugin browser sub-folders are shit" | JUCE's `KnownPluginList::createTree(sortByCategory)` emits concatenated category paths like "Fx\|Delay\|Modulation\|Pitch Shift" | **Fixed**: `12c85c82` custom `buildElementPluginTree()` produces 2-level Effect/Instrument/MIDI Effect/Other → Manufacturer → Plugin tree. |
| "Left-side icon menu buttons unusable / appalling" | JUCE Path icons drawn on 12px viewbox with stair-step rectangle geometry. Strip width was 24px. Active colour was old `#33aaf9`. | **Fixed**: `12c85c82` bumped strip to 36px + V3 colours (active=teal `#2bc4c4`). `d0bad1ee` redrew the 4 icons on 24×24 viewbox with proper folder/magnifier/sliders/pencil geometry. |
| "Buttons too small" | `toolBarSize=32`, `statusBarSize=22`, transport bar height 16px, tempo font 18pt, nav icons 14px draw size. | **Fixed**: `12c85c82` density bumps + `1.0→1.15` desktop scale default. Cumulative ~40-70% larger for daily-use chrome. |

---

## 4 · Outstanding / paused work

### React UI breakage (HIGH priority for next session)

- **Symptom**: Process registers, no window appears
- **What we don't know**: Is this a real Element bug, a Glen-machine specific issue, or a testing-methodology artifact?
- **Next-session approach**:
  1. Glen launches latest DMG via Dock/Finder (NOT terminal)
  2. Reports specific visible symptom: blank window vs shell-renders-empty vs runtime error vs frozen splash
  3. With that signal, target the right fix path:
     - Blank window → asset/dist sync issue or webview init race
     - Shell renders + empty content → bridge handler init order or state hydration race
     - Console error → JS runtime issue (open WebKit DevTools or check stderr capture)
- **Useful prior context**: `bg_c36b28e4` explore was inconclusive but confirmed: `webview/dist/` is built, bridge handlers register, recent commits include race-condition fixes (T-P6-1..T-P6-9 in `master-fix-plan.md` §2.7)

### Phase D sandbox real-world validation (MEDIUM)

- **Status**: Built + Gate 1.5 ratified for `TestEchoPluginInstance`; UNVERIFIED against real third-party plugins
- **Known gap**: Initial-load handshake hangs for some AU plugins (this session, Glen's BRASS_4Horns workflow)
- **Proposed approach**: Add a `SandboxRealAUTest` that spawns the sandbox with a known AU (use `juce::AudioPluginFormat::scanForPluginsOnDisk` to find one) and asserts handshake completes within 10s. Run against 3-5 known-good AUs (auval-passing, modern Apple Silicon-compatible) in CI. If they all complete, document the pass/fail ratio and consider re-enabling default mode 2.
- **Don't re-enable default mode 2** without that validation.

### F-block-3 bridge gaps (PAUSED per Glen)

- Design memo at [`.sisyphus/plans/snapshot-extension-design.md`](file:///Volumes/Projects/Development_Projects/Github_Repos/element/.sisyphus/plans/snapshot-extension-design.md) is ready to execute when React UI is functional
- 6 design picks (D1 CPU instrumentation strategy, D2 push channel, D3 per-block VU, D4 input peak, D5 wireless bus, D6 sequencing) all decided
- 4 open questions for Glen (EWMA alpha, Q15 vs Q23 packing, wireless bus colour scope, onMetering legacy deprecation policy) — defaults baked in, not blocking
- D5 wireless bus React UI is independent of D1-D4 and could land first — but only if React UI is rendering at all

### Storybook expansion (LOW — foundation laid)

- 3 example stories shipped — NeuButton (5 variants), NeuKnob (5 variants), EmptyState (4 variants)
- Whole-suite stories worth writing as React UI work resumes:
  - `webview/src/components/canvas/BlockEmbed.tsx` (audio-in/out/plugin/midi node variants)
  - `webview/src/components/layout/LiveHealth.tsx` (CPU 0%/50%/100% + meter states)
  - `webview/src/components/layout/PresetStrip.tsx` (empty + populated)
  - `webview/src/components/layout/Toolbar.tsx`
  - 7 more `neu/` primitives (NeuFader, NeuToggle, NeuBadge, NeuDisplay, NeuInput, etc.)
- Mock the `__JUCE__` bridge in `.storybook/preview.ts` using existing `webview/src/test/mockJuceBridge.ts`

### AI infrastructure issues encountered this session

- **Oracle 0/2**: gpt-5.5 generic API error then Gemini 3.1 Pro `cloudaicompanion.companions.generateChat` IAM denied
- **Momus 0/3**: same pattern + an `anthropic/claude-opus-4.7` "model not found" attempt
- **Critic 1/1**: `oh-my-claudecode:critic` (Opus) was reachable when used; Glen later cancelled it as priorities shifted
- **Librarian 0/3**: similar fallback chain with `gpt-5.4-nano` returning empty in 1 second
- **Net effect**: had to manually synthesise the F-block-3 design memo (worked out fine — design is sound and grounded in code reads)
- **For next session**: if oracle/momus/librarian needed, expect failures and have a fallback (manual synthesis or `oh-my-claudecode:critic`)

---

## 5 · Verification commands

```bash
cd /Volumes/Projects/Development_Projects/Github_Repos/element

# Source freshness
git log --oneline 0e67448b..HEAD              # 21 commits
git status --short                             # tracked clean

# C++ tests (Release)
cd build-release
ctest -E "DeviceServiceController|SessionServiceFileOps"
# Expected: 71 / 71 passed (~62s)

# Webview tests
cd ../webview
npx vitest run --reporter=default
# Expected: 189 passed / 27 files

# TypeScript
npx tsc --noEmit
# Expected: clean

# Storybook
npm run storybook                              # dev on :6006
npm run build-storybook                        # static build to storybook-static/
# Expected: builds, 3 stories visible (Neu/Button, Neu/Knob, Neu/EmptyState)

# Re-package (if needed after edits)
cd ..
cmake --build build-release -j8
for b in $(find build-release -maxdepth 5 \( -name "Element.app" -o -name "*.component" -o -name "*.vst3" -o -name "*.clap" \) -type d); do
  codesign --force --deep --sign - "$b"
done
rm -f installer/output/Element-2.2.0.16.*
./installer/build_pkg.sh 2.2.0 build-release installer/output
# Expected: Element-2.2.0.16.{pkg,dmg} ~88-89 MB
```

---

## 6 · Routing constraints (carried forward)

- Glen's 2026-05-08 routing rule: **Claude-only across Phase D dispatches**. With Phase D closed, this can be relaxed for non-sandbox work — but Oracle/Momus/Librarian have been intermittently unreachable this session (see §4 AI infra notes).
- `oh-my-claudecode:critic` and `oh-my-claudecode:executor` agents have been working reliably as substitutes when needed.

---

## 7 · Hard "do not regress" list

These are accepted as ground-truth and changes that contradict them need explicit justification:

1. **Phase D Gate 1.5 acceptance preserved**: 696/1000 SIGKILL recovery, 0 host crashes (tested with `TestEchoPluginInstance` — see Gate 1.5 evidence file).
2. **`AudioThreadAllocationTests/GuardCountsWhenArmed` requires `volatile` + `juce::ignoreUnused`** in Release. Don't simplify.
3. **`Settings::shouldSandboxPlugin` default = 0** until real-AU validation passes. Don't bump without test evidence.
4. **`KnownPluginList::createTree(sortByCategory)` MUST NOT return** to the plugin browser. The custom `buildElementPluginTree()` exists for a Glen-visible reason; deleting it as "duplicate of JUCE" silently restores the unusable category-path tree.
5. **PopupMenu must be dark** (`#222226` background + `#e5e5ea` text + teal `#2bc4c4` highlight). Don't revert to JUCE defaults — they're light-grey on dark and look broken.
6. **Webview tests 189/189 + ctest 71/71** — these are passing baselines. Anything that breaks them is a regression.

---

## 8 · Files-touched manifest (this session)

**C++ source:**
- `src/settings.cpp` (sandbox default + desktop scale default)
- `src/pluginmanager.cpp` (createSandboxedGraphNode early-return removed)
- `src/ui/pluginspanelview.cpp` (custom plugin tree builder)
- `src/ui/pluginmanagercomponent.cpp` (crash-aware scan-finished dialog)
- `src/ui/style_v1.cpp` (V3 colour palette + button polish)
- `src/ui/content.cpp` (toolbar + status bar size bumps)
- `src/ui/tempoandmeterbar.hpp` (tempo bar size bump)
- `src/ui/navigation.cpp` (nav icons redesign + size + V3 colours)

**Headers:**
- `include/element/ui/style.hpp` (DefaultColorCodes V3 values)
- `include/element/AGENTS.md` + `src/AGENTS.md` + `src/engine/AGENTS.md` + `src/nodes/AGENTS.md` + `src/ui/AGENTS.md` + `webview/AGENTS.md` + `test/AGENTS.md` (NEW — hierarchical drill-down)

**Tests:**
- `test/realtime/AudioThreadAllocationTest.cpp` (volatile patch)
- `webview/src/test/mockJuceBridge.ts` (NEW)
- `webview/src/stores/__tests__/*` (5 NEW files, 45 tests)
- `webview/src/bridge/__tests__/*` (10 NEW files, 87 tests)
- `webview/src/hooks/__tests__/useJuceBridge.test.tsx` (NEW)
- `webview/src/components/canvas/__tests__/MeterEmbed.emptystate.test.tsx` (NEW)
- `webview/src/components/layout/__tests__/{LiveHealth,PresetStrip,Toolbar}.{stale,emptystate}.test.tsx` (3 NEW)

**Webview/Storybook:**
- `webview/package.json` + `webview/package-lock.json` (Storybook deps + scripts)
- `webview/.gitignore` (added `storybook-static`)
- `webview/.storybook/main.ts` + `webview/.storybook/preview.ts` (NEW)
- `webview/src/components/neu/{NeuButton,NeuKnob,EmptyState}.stories.tsx` (3 NEW)

**Docs:**
- `AGENTS.md` (root index + hierarchical map)
- `docs/ELEMENT_V3_DESIGN_TOKENS_REFERENCE.md` (NEW, 451 lines)
- `PHASE_H_COVERAGE_AUDIT.md` (Metis audit, root-level)
- `.sisyphus/plans/snapshot-extension-design.md` (NEW — F-block-3 design memo)
- `.sisyphus/HANDOVER_2026-05-08-day2.md` (THIS file)

**Installer:**
- `installer/output/Element-2.2.0.16.{pkg,dmg}` rebuilt 22:52 with all 12 commits baked in

---

**End of handover.** Pick up at `5f2f576b` on `local-enhancements`. Start by asking Glen: "Did the new DMG render the nav icons correctly? What does the React UI window show when you launch without `ELEMENT_STANDARD_CONTENT=1`?"
