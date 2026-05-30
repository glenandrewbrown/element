# Creative Toolchain — Validation Gate (2026-05-30)

**Required before plan sign-off** (Glen): every creative tool selected, live-tested, and proven, with
the workflow that ties them together. Verdict legend: ✅ proven this session · ⚠️ ready w/ caveat · ⛔ dropped.

## Per-task tool selection + proof

| Creative task (G-items) | Chosen tool | Verdict | Proof / note |
|---|---|---|---|
| **Design systems & layouts** — ToolPalette G-17, BlockEmbed G-20-23, canvas G-32 | **Stitch MCP** `create_design_system` / `apply_design_system`, seeded from `docs/stitch-reference/DESIGN.md` | ✅ | Created design-system `assets/10956647362761953765` v1 seeded with our neu tokens (4-cat colours). Auth confirmed via `list_projects`. Seed file `DESIGN.md` (27 lines) + `edit-mode.html`/`perform-mode.html` present. |
| **Icons / category shapes / textures / mockup refs** — G-18 4 shapes, G-24-28 cable glyphs | **HF Qwen image-gen** (`gr2_qwen_image_fast_generate_image`) | ✅ | Generated an **on-brand neumorphic hexagon** (Modulators ⬢ badge) — purple `#A87FE0` glow on `#1E1E22`, correct paired shadows. Auth: GlenAndrewBrown. Seed `1778117027` (reproducible). |
| **Brand / company logos (SVG)** | **magic MCP** `logo_search` | ✅ | Returned a real SVG icon (GitHub). API key live. |
| **Discrete component scaffolding** — SessionTree G-12, BusInspector G-05, VirtualKeyboard G-01 | **magic `21st_magic_component_builder`/`_refiner`** (primary) + hand-build from `neu/` primitives (reskin) | ⛔ post-restart: builder STILL 1s-capped (FleetView); logo_search ✅ | **2026-05-30 post-restart:** `logo_search` returned a real GitHub SVG (backend UP), but slow `21st_magic_component_builder` STILL errors `timed out after 1s` — MCP_TOOL_TIMEOUT did NOT lift the per-call cap in this remote-control harness. **Workaround:** run magic builder in a standard (non-FleetView) Claude Code session. Not a blocker — magic builder is an accelerator; Wave 1 is hand-coded and the redesign waves' primary path is neu/ primitives + HF image-gen + logo_search. Root cause: local **stdio** MCP servers got a ~1s tool-call timeout in this harness (HF/Stitch/Storybook are remote/http → longer, so they worked; magic's fast `logo_search` worked, the slow 21st generate calls didn't). **Fix:** added `MCP_TOOL_TIMEOUT=120000` + `MCP_TIMEOUT=30000` to `~/.claude/settings.json` env, bumped magic startup `timeout`→120 in `~/.claude.json`. Takes effect on **session restart**. Re-validate magic component-builder after reload. Fallback if the harness ignores it: run magic in a standard (non-remote-control) Claude Code session (default 60s). |
| **Reuse real components + true props** | **Storybook MCP** `list/get-documentation` | ✅ | Used live this session (40 components listed; docs fetched). Prevents hallucinated props. |
| **Validate each change (interaction + a11y)** | **Storybook MCP** `run-story-tests` | ✅ | Ran green on `canvas-block--generator` + `layout-toolbar--edit-mode`. |
| **Attach design ref per story** | **@storybook/addon-designs** `parameters.design` | ✅ wired | `^11.1.3` in `.storybook/main.ts`. Refs ready: DESIGN.md, edit/perform-mode.html, Stitch exports, HF images. (Panel render confirmed on first attach.) |
| **Visual gallery + per-PR diff gate** | **Chromatic** | ⚠️ | Script `chromatic --exit-zero-on-changes` + CI `.github/workflows/chromatic.yml` present. **GAP: no local token** (`.env` absent) → local publish needs the `chpt_` token; CI uses the secret. |
| **Visual QA / live snapshot** | **chrome-devtools MCP** | ✅ reads | Snapshot/console/list proven (caught the panel render-bug). Action tools (click/fill/navigate) flake on the 1s timeout — reads are reliable. |
| **Human review loop** | **💬 Feedback panel** → `ui-comments.jsonl` | ✅ | Proven end-to-end (32 notes captured + status-tracked). |
| **Asset optimization (WebP/AVIF, SVG)** | **creative-asset-pipeline** skill | ✅ (engine ready) | Relies on HF image-gen (✅ proven) + optimization; invoke per asset batch. |

## The validated workflow (one loop per component)
1. **Context** — Storybook MCP (real props) + blueprint/CLAUDE.md.
2. **Design ref** — Stitch (layout) · HF image-gen (icon/texture/mockup) · magic logo_search (brand) → attach via addon-designs.
3. **Build** — hand-code with `neu/` primitives; reskin any ref to the **locked** neumorphic tokens.
4. **Validate** — `run-story-tests` (interaction + a11y), self-heal until green.
5. **Gallery** — Chromatic snapshot diff (CI).
6. **Review** — Glen flips the 💬 note `fixed` at runtime.

## Open setup items before sign-off
1. **Chromatic local token — ✅ DONE + PROVEN (2026-05-30).** Token in `webview/.env` (gitignored, git-confirmed). Local publish validated: **Build 4 passed — 42 components / 168 stories / 336 snapshots**. Library: https://6a1a050dd7e83b33c7e53b0d-mvmpupamdw.chromatic.com/
2. **magic component-builder — STILL 1s-CAPPED post-restart (2026-05-30).** Restart done; the env did NOT lift the per-call timeout in this FleetView/remote-control harness — `_builder` still errors `timed out after 1s`. `logo_search` works (fast, sub-1s). **Workaround:** run magic builder in a standard (non-FleetView) Claude Code session when needed. Not a blocker — magic builder is an accelerator; primary component path is hand-built neu/ primitives + HF image-gen.
3. **Stitch validation asset** `assets/10956647362761953765` — created only to prove the API; safe to delete in Stitch.

**Bottom line:** creative engines that matter (Stitch layouts, HF imagery, logo SVGs, Storybook reuse+test,
addon-designs, Chromatic-via-CI, 💬 review) are **live and proven**. Only the Chromatic *local* token is an
outstanding setup step; magic-builder needs the session restart to validate.

---

## Added + validated 2026-05-30 — Reactbits / UIverse / Neumorphism (Glen-requested)

| Tool | What it gives | Install / location | Verdict | Skill |
|---|---|---|---|---|
| **Neumorphism generator** | `neu()` + Element token presets → exact neumorphic box-shadow/gradient CSS (reproduces neumorphism.io, BSD-3) | `webview/src/lib/neu.ts` (+ `__tests__/neu.test.ts`) | ✅ **7/7 vitest pass** | `.claude/skills/neumorphism-generator` |
| **UIverse Galaxy** | 3,802 community HTML+CSS elements (MIT); **109 neumorphism-tagged** (buttons/cards/toggles/loaders) | cloned `webview/vendor/galaxy` (gitignored) + `scripts/index-galaxy.mjs` → `vendor/galaxy-neumorphism.json` | ✅ **indexed 3802 / 109 neu** | `.claude/skills/uiverse-galaxy` |
| **React Bits** | 110+ animated React components (text reveals, motion wrappers, particle bgs); MIT+Commons Clause | direct registry fetch `reactbits.dev/r/{name}.json`; `motion`@12 installed; sample `webview/src/components/reactbits/BlurText.{tsx,stories.tsx}` | ✅ **story tests green** | `.claude/skills/reactbits-components` |

**Guardrails baked into the skills:** all three reskin to the LOCKED neu tokens; React Bits `components/*`
(GlassIcons/SpotlightCard/glassy) excluded; UIverse `glassmorphism`/`skeuomorphism` excluded; everything
Chromatic + `run-story-tests` gated. React Bits gotchas documented (type-only `motion` imports; gsap-vs-motion
deps; restart Storybook after a new dep).

**New project deltas (uncommitted):** dep `motion`; `webview/src/lib/neu.ts(+test)`; `webview/scripts/index-galaxy.mjs`;
`webview/src/components/reactbits/BlurText.*`; `webview/.gitignore += vendor/`; `webview/vendor/` (gitignored, not committed).
