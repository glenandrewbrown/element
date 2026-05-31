# Element MVP — Cherry-Pick Bake-off Plan (LOCKED 2026-05-30)

> ✅ **STILL LIVE — this is the active UI build method.** Build spec = the 37 locked verdicts in
> `.omo/bakeoff/VERDICTS.md`; objective tracker = `.omo/HORIZON-v3-ui.md`; ADR =
> `docs/adr/ADR-011-ui-cherrypick-bakeoff-method.md`. Pilot component = **Block** (Glen, 2026-05-30).
> Folder index: `.omo/plans/README.md`.

> Companion to `.omo/PROJECT-STATE.md`. Captures decisions grilled out with Glen on
> 2026-05-30 about how the V3 UI gets built using the `mindful-studio` React mockup.
> Where this conflicts with older UI plans, THIS wins for the UI method.
> `mindful-studio` repo: `/Volumes/Projects/Development_Projects/Github_Repos/mindful-studio`

---

## 1. MVP definition (LOCKED, with cuts)

- Started the grill at "MVP = full ship bar" (M0 stabilise + M1 all components), then Glen
  made deliberate cuts. Net MVP = **the Edit-mode building experience, done beautifully** —
  the everyday loop: browse → add → wire → edit → arrange Blocks, on Element's real engine.
- **Deferred out of MVP** (post-v1): **Perform mode** (workshop/stage toggle), the **Module**
  tier, the **rail-tree / SessionTree** navigator. These are real cuts, not omissions.
- Ship gate is still the full stable product; MVP is the first beautiful, wired Edit-mode build.

## 1a. The three Elements + feature-parity requirement (LOCKED 2026-05-30)

There are THREE Element UIs, not two. Glen's hard requirement: the original native app's
features must NOT be lost in the React redesign.

- **A — Original native JUCE Element** (`src/ui/` C++): the mature, feature-rich app
  (graph editor, comment boxes, minimap, node search, QuickAdd, molecules, plugin-usage
  tracker, NavigationPanel, BrowsePanel, InspectorPanel, session mgmt, MIDI mapping, OSC,
  Lua nodes, all plugin formats…). This is the **FEATURE BASELINE** — its look is NOT ported,
  but every user-facing feature must be kept / migrated / explicitly cut (never silently lost).
- **B — Today's React webview** (`webview/`): the in-progress UI migration; wired to the real
  engine; visually weak.
- **C — mindful-studio mockup**: the design target; no engine.

**Goal:** the new UI **looks like C, keeps every feature of A, runs on the engine like B.**

So the bake-off has TWO tracks per piece:
1. **Design bake-off** — best of {B, C}, or build-new where both weak. (A's look is NOT a design
   candidate.)
2. **Feature-parity vs A** — a must-keep column: present / partial / MISSING in the new UI.
   Sourced from `docs/WEBVIEW_PARITY_MATRIX.md`, `ELEMENT_FEATURE_INVENTORY.md`,
   `REACT_UI_AUDIT_2026-05-24.md`, `WEBVIEW_BLUEPRINT_AUDIT_CHECKLIST.md` + the native `src/ui/`
   inventory. Native features missing in B are the at-risk-of-loss set — the highest-priority gaps.

## 2. Method (LOCKED) — cherry-pick best-of-both + mockup foundation + build-new-where-weak

This REPLACES the earlier "hybrid: re-derive everything from the mockup" framing.

1. **Foundation / IA / UX language = the mockup.** Its layout, navigation model, interaction
   feel, visual language are the skeleton everything hangs on.
2. **Per component → bake-off.** For each piece, keep whichever is genuinely better —
   **Element-current OR mockup**. NOT a wholesale rip-out; Element wins several rows.
3. **Build-new where BOTH are weak.** Generate a fresh component using the **mandatory design
   tools — Stitch + ui-ux-pro-max + uiverse + image-gen** — never hand-rolled against tokens.
   (This is the `feedback_explicit_design_tools_mandatory` lesson from the denied Pass-1.)
   **Stitch is NOT retired** — it is repurposed: the generator for build-new + the design-ref
   source attached per story via `@storybook/addon-designs`.
4. **Every winner re-houses on Element's real architecture** — Zustand stores + JUCE bridge +
   React Flow. Architecture is held CONSTANT; the mockup never supplies the architecture.
   Mockup debt (god-component `Index.tsx`, 4 duplicate knobs, name-based nesting) is NOT inherited:
   re-implement clean, copy only pure logic (e.g. `buildPath`/`findDetour`, `getChassisShape`,
   `useSignalFlow`, `arrangeLayout`).

## 3. Sequencing (LOCKED) — parallel lanes

- **Lane A (C++ stabilise):** CF1 fix → 28-bug reconcile → perf re-verify → tests green.
- **Lane B (frontend UI):** the bake-off + re-house + build-new.
- Lanes touch disjoint files (`src/*.cpp` vs `webview/*.tsx`) → run in parallel.
- **CF1 (Element-AU crashes Logic Pro) stays a HARD SHIP GATE** — host crash = data loss —
  but it is NOT a start gate. Both lanes must be green before ship.

## 4. Information-architecture decisions (LOCKED — mockup-vs-ratified conflicts resolved)

| Surface | Decision | Note |
|---|---|---|
| **Inspector** | **Docked tabbed panel** (mockup) | Overrides the ratified "contextual floating" direction. Reuse mockup's Block/Bus/Cable/Health tabs. |
| **Add-flow** | **QuickAdd (right-click @cursor) primary** (ratified G-30) + **Cmd+K palette secondary** | Harvest the mockup's polished 4-mode palette UX into the secondary Cmd+K. |
| **Navigation** | **Breadcrumb-only** (mockup): top pills + double-click dive / double-click-empty pop | Prunes rail-tree + SessionTree + Module tier from MVP. Container/Portal **dive** stays. |

## 5. Scope in / out

**IN (MVP):** App shell (mockup layout) · Board/canvas (Element React Flow, harvest mockup
routing/pulses/silhouettes) · Block · Cable · Plugin Browser · docked Inspector · QuickAdd +
context menus · Cmd+K palette · breadcrumb nav · Container/Portal dive · neu primitives ·
comment frames · minimap · transport/toolbar/status chrome · VirtualKeyboard · Prefs/About modals.

**OUT (post-v1):** Perform mode · Module tier · rail-tree/SessionTree · Dashboard/Macro/Scene
(stay shelved per D3).

**Native build-new (from parity audit §9 of the matrix / task #8) — node-editor cut-line LOCKED (Glen 2026-05-30, "must-haves only, rest later"):**
- **IN MVP:** plugin scan + paths + format toggles (non-negotiable — no app without it); MIDI-mapping editor; ONE strong **generic** param editor that works for every node.
- **DEFERRED to tracked backlog (NOT dropped):** the ~10 specialised node editors (AudioRouter patch-grid, graphical EQ, compressor, MidiProgramMap table, MidiSetList, OSC, IO/volume); graph mixer (fader view); meter bridge; Lua console/REPL; preset/controller file UIs; inspector LOG tab; user-set node colour; compact/small block modes; align/distribute; keymap editor; MIDI clock; keyboard splits.

**Multi-instance/Mirror: IN MVP** (Glen 2026-05-30) via **Branch A** — in-process registry (~days C++) + re-house the mockup's InstanceSwitcher/InstancesPanel/MirrorPanel on real snapshot data; common hosts (Logic + most VST3); "mirror unavailable" on AUv3/sandboxed. **No open scope items remain.**

## 6. Multi-instance / MirrorPanel verdict (from C++ probe)

The mockup's standout (InstanceSwitcher + InstancesPanel + MirrorPanel) is a fake fixture today;
Element has zero supporting engine. Probe verdict (`accf7fed96227eda2`, 2026-05-30):

- **Branch A — same-process hosts (Logic AU, most VST3: Reaper/Cubase/Studio One/Ableton): ~DAYS.**
  Add a process-global `static std::vector<PluginProcessor*>` registry + stable id/name + one
  bridge method reusing the EXISTING `buildGraphSnapshotJson`. Low risk. Mockup `instanceRegistry.ts`
  maps ~1:1 onto its output.
- **Branch B — separate-process (AUv3 / sandboxed hosts): ~WEEKS** + App-Group entitlement +
  AUv3 packaging Element lacks. High risk.
- **Recommended posture:** ship Branch A; degrade gracefully ("mirror unavailable in this host")
  for separate-process. **DECISION (Glen 2026-05-30): IN MVP via Branch A** — build the in-process
  registry + re-house the 3 mockup panels on real snapshot data; degrade gracefully on AUv3/sandboxed.
  This adds a small, low-risk C++ feature to the stabilise lane (reuses `buildGraphSnapshotJson`).

## 7. Bake-off harness (Storybook) — the rig for §2 step 2

- **element Storybook (:6006) = the hub** — already best-practice (SB 10.4.1 react-vite; addons:
  chromatic, docs, themes, a11y, vitest, **designs**, **mcp**, **pseudo-states**, **coverage**;
  react-docgen props; `MiniFlow` decorator wraps node/edge comps in a real RF context; in-SB
  comment sink → `.omo/audit/ui-comments.jsonl`).
- **mindful Storybook → addon + preview parity** (add themes/designs/pseudo-states/coverage;
  backgrounds, autodocs, dark theme, storySort) and **move to port 6007**.
- **Composition**: element `main.ts` has `refs: { mockup: { url: http://localhost:6008 } }`
  (6007 was taken by a Python server). **VERIFIED 2026-05-30**: hub MCP `list-all-documentation`
  returns BOTH sources (`local` + `mockup`), scoped by `storybookId`. One forensic surface ✓.
  **Rig gotchas:** (1) `preview-stories`/`run-story-tests` are LOCAL-only — preview mockup stories
  via direct `:6008` URLs (e.g. `http://localhost:6008/?path=/docs/<id>--docs`); (2) the hub's
  composed-ref index is point-in-time — newly-authored mockup stories appear in the hub MCP only
  after a hub restart (query :6008 directly meanwhile); (3) **the :6008 ref must be removed/env-gated
  before any merge** (task #9) — it would break element's Storybook for anyone without the mockup server up.
- mindful catalogue today = **10 neu stories only**; the 10 neu pairs are scorable immediately.
  Non-neu mockup components are unstoried (god-component-coupled → real per-component work).

## 8. Bake-off rubric (CORRECTED)

Score Element-version vs mockup-version per component on DESIGN/UX only — architecture is held
constant (§2.4), so **do NOT score "wired vs mock"** (it would make Element win every row and
contradict the premise). Axes:

1. Paradigm fit (neumorphism, density, dark, Instrument-V3)
2. Accessibility (addon-a11y violation count)
3. Interaction quality
4. Information density
5. Feature value / uniqueness

→ Verdict per component: **Element wins · Mockup wins · Merge (best of both) · Build-new**.
Re-housing cost is recorded as a **separate effort flag**, NOT a quality score.

**Authoring discipline (advisor):** pre-fill the matrix with provisional verdicts from the two
deep inventories; author an isolated mockup story ONLY for genuinely close calls where eyes-on
could flip the verdict. Compare the rest against the running mockup app. Gate authoring on "does
isolation change the verdict," not "every component."

## 9. OPEN questions — ALL RESOLVED (2026-05-30)

- ~~Multi-instance in/out of MVP?~~ **RESOLVED: IN MVP via Branch A** (common hosts; degrade gracefully).
- ~~Pilot / first component?~~ **RESOLVED: Block** (Glen) — pulls the bridge `category` emit forward as its one C++ prereq. See `.omo/HORIZON-v3-ui.md` m1.1.
- ~~The per-component verdicts?~~ **RESOLVED: locked** — all 37 verdicts are in `.omo/bakeoff/VERDICTS.md`.

## 10. References

- Inventories (this session): mockup deep-dive `aa39ced271b49f1b1`; Element webview `adc109323e7d430ab`;
  multi-instance C++ probe `accf7fed96227eda2`.
- `.omo/PROJECT-STATE.md`, `docs/ELEMENT_UNIFIED_BLUEPRINT.md`, `.stitch/DESIGN.md`,
  `docs/adr/ADR-011-ui-cherrypick-bakeoff-method.md`.
