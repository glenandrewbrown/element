# Pass 2 — Stitch-driven UI Redesign (the PROPER method)

> Supersedes the denied Pass-1 hand-authored work (shelved branch `shelved/denied-ui-redesign-pass1`).
> Design system source of truth: **Element Instrument V3** (Stitch, created from `.stitch/DESIGN.md` — 4-cat + #A87FE0, locked surfaces, no-glass, ui-ux-pro-max-reviewed). Stitch project: **"Element - Design Mode"** (id 6302247051961702472).

## Two phases (Glen's framing)

### Phase 1 — IDEATION (divergent component concepts) ← in progress
Generate genuinely DIFFERENT component/nav UI-UX concepts (NOT variant reskins). Glen picks per component.
- **Round 1 (Edit-canvas base+4 variants) — REJECTED by Glen:** `generate_variants` produced same-y reskins of one layout, not divergent ideas. Lesson: use separate concept prompts via `generate_screen_from_text`, not `generate_variants`, for divergence.
- **Glen's liked elements** (from his own refs `.stitch/designs/glendesigns/design_01.png`, `design_02.png` — items in them are "wrong" but the language is right):
  1. Plugin browser shows **real plugin-GUI thumbnails**, icon-mode, multi-tag filterable (design_01).
  2. **On-block direct controls** — logic/MIDI/simple nodes render their UI ON the block, no popup (both).
  3. **Expandable left icon rail** (Search/Plugins/Favs/Recent/Config) opening into browsing (design_02).
  4. Sleek dark neu; Portal (dashed external sync) + nested Container (design_02).
- **Round 2 (in progress):** FRESH project "Element V3 - Component Studio" + V3 DS + **8 divergent component concepts** (2 each: Browser, Block-on-canvas, Inspector, Nav) baking in the liked elements. Glen reviews + picks per component.
- Later: Perform mode + remaining views.

### Phase 1 — DIRECTION PICKS (Glen, 2026-05-30, from the 8 v3b concepts)
- **Browser** → **palette** direction, but MUST be **streamlined / sleeker** (the generated one is too big). Purpose = **search the component LIBRARY (plugins available to add)**, NOT runtime/loaded/active plugins (active plugins belong to QuickAccess/SessionTree, a separate surface). → needs a Stitch refinement pass.
- **Block** → **tiered** (collapsed/standard/expanded + Container + Portal). ✓
- **Inspector** → **contextual floating** (anchored beside selected Block, max canvas). ✓
- **Navigation (general/holistic)** → **rail-tree** (expandable rail + Project tree: Board/Module/Container/Portal). ✓
- **Command palette** → NOT general nav. Repurpose as the **QuickAdd (right-click-at-cursor) + right-click context-menu** blueprint (maps to G-30 native-menu mirror + QuickAdd). ✓
- Screens: project 5588354666030058264, DS `assets/3cf5097be5ab4a9f9aeab1d164ca9c53`; screenshots `.stitch/designs/v3b-*.png`.

### Phase 2 — IMPLEMENT (the actual task) — component by component
For the chosen direction, implement into the real app **one component at a time**:
1. Take the chosen Stitch screen/section → convert to React via the `stitch-build:react-components` pipeline (modular, hooks, theme-mapped Tailwind to the locked neu tokens).
2. Wire to the REAL stores / `window.__JUCE__` bridge (not mock-only) — actual behaviour, not a static skin.
3. Storybook story with `addon-designs` `parameters.design` pointing at the **real Stitch screen export** (image/URL), and cite the Stitch screen/variant ID it came from (proof-of-source).
4. Verify: `tsc -b` + `vitest --project storybook` + static-build `verify-stories` + Storybook MCP run-story-tests.
5. **Per-component Glen gate** (Storybook 💬 + runtime) → sign-off → next component.
6. **PILOT ONE component end-to-end first**, get method sign-off, THEN proceed through the rest.

## Non-negotiable method guardrails (from the Pass-1 failure)
- Premium design tools are MANDATORY and used+verified: Stitch (mockups/variants), ui-ux-pro-max, uiverse-galaxy, image-gen where apt. Never dropped for "scope".
- Structural/direction/design-system decisions are GLEN's — surfaced, never assumed at scale.
- Each converted component cites its Stitch source ID; addon-designs ref = the real Stitch export, not a docs/ text link.
- Locked tokens (surfaces #1E1E22…, 4-cat incl #A87FE0, no glass/blur) never weakened.
- Pilot → sign-off → scale. No N-lane blast on an unproven method.

## Component/view worklist (Phase 2, order TBD after direction pick)
Shell/chassis + nav · Block (4-cat header + embedded viz) · Cable system · Inspector Hub · Tool Palette/Browser · SessionTree · SnippetShelf · QuickAccess · LiveHealth · VirtualKeyboard · BusInspector · Perform-mode stage. (Maps to the same G-items; now via Stitch conversion, not hand-authoring.)
