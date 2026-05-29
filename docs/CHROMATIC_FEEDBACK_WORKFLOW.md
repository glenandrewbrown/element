# UI Feedback Workflow — Chromatic + Storybook + Stitch

How Glen gives targeted, per-component visual/UX feedback across the whole Element Web UI, and
how that feedback ties into design-asset creation (Stitch / image tools).

---

## TL;DR loop

```
  Storybook (161 component states)  ──published──▶  Chromatic (cloud, review + comment)
        ▲  addon-designs embeds a            │
        │  Stitch/Figma/image ref            │  Glen browses + comments per component
   Stitch MCP (make/modify                   ▼
   the design asset)  ◀───────  "this component should look like X"  ───────  Claude implements
                                                                              → re-publish → diff
```

---

## 0. The agentic feedback system (design)

Three layers form a closed loop so the agent builds against real context, you steer per-component,
and every change is auto-verified:

```
            ┌─────────────────────────── CONTEXT IN (no hallucination) ───────────────────────────┐
            │  Storybook MCP  (@storybook/addon-mcp @ http://localhost:6006/mcp)                    │
            │  • list-all-documentation / get-documentation  → real components + props              │
            │  • get-storybook-story-instructions            → how to write stories here           │
            │  • run-story-tests                             → interaction + a11y, self-healing     │
            └──────────────────────────────────────────────────────────────────────────────────────┘
                         │  agent reuses real components, writes/fixes, self-tests
                         ▼
   DESIGN INTENT ──▶  Component + story  ──▶  Chromatic publish  ──▶  UI Review (PR)  ──▶  YOU comment
   (Stitch via                                  (canonical context)     per component         per element
    addon-designs)            ▲                                                                  │
                              └──────────────── agent resolves comment, re-tests, re-publishes ──┘
```

- **Storybook MCP** = the agent's eyes/hands on the real UI: it reads the actual component catalog &
  props (so it can't invent components), gets project story conventions, and runs real browser tests
  (interaction + accessibility) — iterating until green before anything reaches you. *(Verified live:
  the endpoint answers MCP `initialize`. React-only, preview API. Requires `npm run storybook` up.)*
- **Chromatic** = the canonical published UI + your per-component **UI Review** comment surface, and
  the visual-diff governance gate.
- **addon-designs + Stitch MCP** = design intent: a `parameters.design` reference (Figma / Stitch
  export / image) sits beside each component; Stitch MCP generates/edits those assets on demand.

**The loop in practice:** you comment on a component in Chromatic UI Review → the agent pulls that
component's real props/docs via the Storybook MCP → fixes it → `run-story-tests` self-heals (a11y +
interaction) → re-publishes → Chromatic shows the diff → you approve or comment again.

## 1. What is now set up

- `chromatic` (v17) installed; `npm run chromatic` script added (uses `CHROMATIC_PROJECT_TOKEN` or `--project-token`).
- Project created on chromatic.com, token in hand, **first build published** (baseline of all 161 stories).
- `@storybook/addon-designs` (v11, SB10-compatible) installed + wired in `.storybook/main.ts` — embeds a design
  reference (Stitch export / Figma / image / iframe) in a **Design** panel next to each live component.
- Already present: `addon-a11y` (accessibility), `addon-docs`, `addon-themes`, plus SB10 **core** toolbar:
  **Measure**, **Outline**, **Controls**, **Viewport**, **Backgrounds**.
- `@storybook/addon-mcp` installed + wired — exposes the **Storybook MCP** at `http://localhost:6006/mcp`
  (live when `npm run storybook` runs). Registered in project `.mcp.json` as server `storybook`
  (available to Claude Code after a session reload). Agent directive added to `CLAUDE.md`.
- `.gitignore` updated so the project token / `.env` is never committed.

---

## 2. Chromatic — first-timer steps

You've already done 1–3:
1. Signed in at chromatic.com (GitHub).
2. Created the `element` project.
3. Copied the project token (`chpt_…`).

What happens / what to do next:
4. **First build = baseline.** The publish I just ran snapshots all 161 stories in a cloud browser and sets them
   as the baseline. No "changes" to review yet — this build is your **browsable library**.
5. **Open it** (live):
   - **Library (browse all 161 states):** https://6a1a050dd7e83b33c7e53b0d-eptucqspsl.chromatic.com/
   - **Project dashboard / connect GitHub for UI Review:** https://www.chromatic.com/setup?appId=6a1a050dd7e83b33c7e53b0d
   - `appId = 6a1a050dd7e83b33c7e53b0d`. Build 1 = baseline (auto-accepted); future builds diff against it.

   chromatic.com → your `element` project. Two views matter:
   - **Library** — every component + every state (the full UI). Use this for the holistic "is it usable" pass.
   - **Builds** — each publish; future builds show visual **diffs** vs the baseline.

### How you leave per-component feedback

**Option A — UI Review on a Pull Request (the power tool, best for the wave-by-wave work):**
- Every time I change UI, it goes up as a PR. Chromatic builds the PR and opens a **UI Review → Changeset**:
  the changed components shown **side-by-side (before/after)**.
- Under **each** changed component there's a **comment box**. Type your note there — comments are **threaded and
  attached to that specific component snapshot**. I get each one, address it, push, and the thread resolves.
- This is exactly "many small units of feedback across many components" — one thread per component, in context.
- Requires the GitHub repo connected in Chromatic + a CI step (see §6 — I can add it).

**Option B — browse the Library now (no PR needed):**
- Walk the component sidebar, and for anything off, send me a one-liner:
  `Component → what's wrong → what you want` (e.g. `Block (Generator/Expanded) → accent is orange → should be blue`).
- You see the exact Storybook component + state name in the sidebar, so the reference is unambiguous.

---

## 3. Storybook addons — what each gives you (run `npm run storybook` → http://localhost:6006)

| Addon / tool | Use it for |
|---|---|
| **Measure** (toolbar) | Hover any element → exact px box/margins/padding. Made for spacing/density/overlap calls. |
| **Outline** (toolbar) | Toggle box outlines on everything → spot misalignment/overflow instantly. |
| **Controls** (panel) | Live-tweak a component's props (category, zoom tier, muted…) to see every state without code. |
| **Viewport** (toolbar) | Resize the frame → check responsive behaviour. |
| **Accessibility** (a11y panel) | Per-component contrast / ARIA / focus issues, auto-flagged. |
| **Design** (addon-designs panel) | Shows the **reference design** beside the live component (see §4). |
| **Backgrounds** (toolbar) | Swap canvas tone to check the component on different surfaces. |

---

## 4. Stitch / design-asset tie-in (the create-/modify-UI loop)

`addon-designs` is the bridge between a **design asset** and the **live component**. On any story:

```ts
// Figma frame
export const Default = { parameters: { design: { type: "figma", url: "https://figma.com/file/…" } } };

// A Stitch export, hosted image, or local mockup (edit-mode.html etc.) — anything with a URL
export const Default = { parameters: { design: { type: "iframe", url: "https://…/stitch-screen", title: "Stitch ref" } } };
```

The reference then renders in the **Design** panel next to the component, and travels into Chromatic — so when
you review, you see **impl vs intended design side by side** and comment against both.

**The asset-creation loop, end to end:**
1. You flag a component that needs a new/changed look (in Chromatic or local Storybook).
2. I drive the **Stitch MCP** to produce/modify the asset:
   `generate_screen_from_text`, `generate_variants`, `edit_screens`, `apply_design_system`,
   `create_design_system_from_design_md` (we can seed it from `docs/stitch-reference/DESIGN.md`).
3. I attach that asset to the component's story via `parameters.design`.
4. I implement the component to match; Chromatic shows the diff + the design ref.
5. You approve or comment again.

**Available now:** `docs/stitch-reference/{edit-mode,perform-mode}.html` can be embedded as `type: "iframe"`
references once served (or converted to images). Fresh per-component Stitch assets are generated on demand.

**Other image/UI tools that plug in the same way:** Figma (native `type: "figma"`), the **magic MCP**
(21st.dev component generation), and the `creative-asset-pipeline` skill — all just become a `parameters.design`
reference or a generated asset I embed.

---

## 5. MCPs in this loop

- **Stitch MCP** (installed) — the active design-asset generator/editor (§4).
- **chrome-devtools MCP** — for *me* to inspect the running app/Storybook while fixing (not your channel).
- There is no dedicated Storybook/Chromatic MCP — Chromatic is a web service + CLI + GitHub Action.

---

## 6. Next setup step (optional, recommended) — automate UI Review on PRs

To unlock Option A (per-component threaded comments on every change) hands-free, I can add a Chromatic GitHub
Action (`.github/workflows/chromatic.yml`) that publishes on each PR, with the token stored as the
`CHROMATIC_PROJECT_TOKEN` GitHub secret. Then every UI wave auto-opens a UI Review for you. Say the word.

---

## Commands

```bash
cd webview
npm run storybook          # local Storybook at :6006 (Measure/Outline/Controls/a11y/Design)
CHROMATIC_PROJECT_TOKEN=chpt_… npm run chromatic   # publish a new build (or pass --project-token)
```
