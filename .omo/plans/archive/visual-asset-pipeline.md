> 🗄️ **ARCHIVED — HISTORICAL. Do NOT execute.** 2026-05-07 Phase F creative-asset production pipeline (icons/illustration/brand). Live successors: design system `.stitch/DESIGN.md` · `.omo/PROJECT-STATE.md`.
> Current state: `.omo/PROJECT-STATE.md` · plans index: `.omo/plans/README.md`. _(Archived 2026-05-30.)_

# Element — Visual Asset Pipeline (Phase F creative production)

**Pairs with:** `master-fix-plan.md` Phase F, `autonomy-execution-spec.md` §6.
**Goal:** Generate every missing icon, illustration, animation, and brand asset autonomously, in V3.0 Instrument Paradigm style, with quality gates that don't require human review.

---

## 1. Current state (audited 2026-05-07)

| Asset class | Current count | What's there | Gap |
|---|---:|---|---|
| App icons (data/images) | 4 | element-icon-v1.svg, icon.png, icon-template.png, power_48x48.png | App-level done; component icons missing |
| Webview SVG sprite (`webview/public/icons.svg`) | 6 symbols | **Vite scaffolding leftovers** — bluesky-icon, discord-icon, github-icon, documentation-icon | Wrong content entirely; needs replacement |
| Inline SVG path strings (ICON_*) | ~30+ | Ad-hoc constants in DashboardBuilder, Toolbar, ConnectionEditor, MacroDashboard, QuickAccess, StatusBar, BlockTabStrip | Fragmented; no design-token consistency |
| Lottie animations | 0 | none | Loading / transitions / micro-interactions all missing |
| Empty-state illustrations | 0 | unstyled "no items" text | Every list/panel needs one |
| Skeleton screens | 0 | none | Async load → blank page or jank |
| Background textures / chassis art | 0 | flat colour | Optional but blueprint mentions chassis feel |
| 3D / shaders | 0 | none | Optional unless we want a hero "knob lab" |
| Sound design (SFX) | 0 | none | Audio plugin host that has no UI sound feedback — opportunity |

**Verdict:** the visual layer is severely under-resourced for a precision DAW host. This is a major contributor to "the update GUI is broken in many ways."

---

## 2. Tool routing (per asset class)

```
ASSET REQUEST
    │
    ▼
┌────────────────────────────────────────────────────────────────┐
│ Class detection (icon? illustration? animation? video? 3d? sfx?) │
└────────────────────────────────────────────────────────────────┘
    │
    ├── ICON (mono / 16-32 px) ────────► (1) lucide-react search ──── if found ─► import
    │                                  │
    │                                  └── if NOT found ─► Recraft (vector_illustration, line_art substyle)
    │                                                       └── SVGO compress ─► commit to webview/src/icons/
    │
    ├── ILLUSTRATION (empty state / hero) ─► Fal.ai Flux (recraftv3 or flux/dev) — neumorphic prompt
    │                                          └── Sharp-mcp resize → AVIF/WebP ─► commit to webview/public/illustrations/
    │
    ├── ANIMATION (loading, transition) ─► Lottiefiles search (CC0)
    │                                       │
    │                                       └── if no match ─► framer-motion code primitive
    │                                                          └── store as motion-vocabulary token
    │
    ├── VIDEO LOOP (hero background) ─► Fal.ai Kling 5s + FFmpeg seamless loop ─► AVIF/MP4
    │
    ├── 3D (knob lab demo, optional) ─► Hyper3D / Hunyuan3D ─► gltf-transform compress ─► .glb
    │
    └── SFX (UI feedback) ─► /sfx-generator skill (ElevenLabs / Freesound CC0)
```

---

## 3. Brand prompt grammar

Every Recraft / Flux call in this project uses this template stem:

```
A vector icon for a precision audio plugin host called Element.
Visual style: neumorphic, single-tone monochrome, 1.5px stroke width,
subtle inner highlight from top-left, anchored on a 24x24 grid.
Subject: <SPECIFIC>
Avoid: gradients, photorealism, decorative flourishes, soft shadows
       (those are added at runtime by the neumorphic CSS).
Background: transparent.
Output: SVG, single-path where possible, ≤ 2KB.
```

For illustrations (empty states):
```
A minimal neumorphic illustration for an audio plugin host empty state.
Palette: hex #1E1E22 base, #252529 surface, with a single accent
of #4A90D9 OR #E8A838 OR #2BC4C4 (caller specifies which).
No glassmorphism, no transparency, no blur.
Subject: <SPECIFIC, e.g. "an empty cable rack with hooks">
Mood: serene, technical, expert-friendly. Not cute.
Output: 512×512 PNG with transparent background.
```

For animations (Lottie via framer-motion):
```
Element micro-interaction:
  duration:  100ms (press) / 200ms (hover) / 250ms (modal entry)
  easing:    cubic-bezier(0.4, 0, 0.2, 1)
  primitive: scale | opacity | translateY | strokeDashoffset
  semantic:  audio-blue | midi-teal | cv-orange
  trigger:   <event>
```

---

## 4. Phase F.0 — Design system foundation (PREREQUISITE for all UI work)

This work item is added to `master-fix-plan.md` and runs **before** F.1-F.10.

| Sub-task | Tool | Output | QA gate |
|---|---|---|---|
| F.0.1 Install Lucide React | `npm i lucide-react` | package.json delta | npm build green |
| F.0.2 Install Vitest + RTL | `npm i -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom` | webview/vitest.config.ts | `npx vitest run` green |
| F.0.3 Install Playwright e2e | `npm i -D @playwright/test && npx playwright install chromium` | webview/playwright.config.ts | `npx playwright test --list` works |
| F.0.4 Install Lottie React player | `npm i @lottiefiles/react-lottie-player` | package.json delta | tsc green |
| F.0.5 Replace `webview/public/icons.svg` (Vite scaffolding) with empty stub | manual | trimmed file | webview build green |
| F.0.6 Build canonical `<Icon name="..." />` component | `category="visual-engineering"` + `frontend-ui-ux` skill | webview/src/components/neu/Icon.tsx | tsc + Playwright "icons render" test |
| F.0.7 Migrate every inline ICON_* constant to Lucide imports | `category="quick"` codemod | files modified, ICON_* removed | webview build + Playwright snapshots match baseline |
| F.0.8 Generate brand-style audio-domain icons NOT in Lucide (≈10-15: cable, jack, port-audio, port-midi, port-cv, scene, snippet, container, portal, panic, etc.) | Recraft via creative-asset-pipeline skill | webview/src/icons/audio/*.svg | multimodal-looker grade ≥ 0.85 against neumorphic brief |
| F.0.9 Define motion vocabulary tokens | hand-written | webview/src/motion/index.ts | exported, used by neu primitives |
| F.0.10 Define empty-state primitive (`<EmptyState illustration="..." />`) | `category="visual-engineering"` | webview/src/components/neu/EmptyState.tsx | Playwright renders correctly |
| F.0.11 Generate empty-state illustrations (≈8: no plugins, no nodes, no presets, no MIDI, no audio in, error state, loading, sandbox stopped) | Fal.ai Flux + Sharp resize | webview/public/illustrations/*.avif | multimodal verdict + a11y contrast check |
| F.0.12 Define skeleton screen primitive (`<Skeleton variant="..." />`) | `category="visual-engineering"` | webview/src/components/neu/Skeleton.tsx | Playwright snapshot |

**Estimated:** 2-3 days. Single tracked PR. Becomes Phase F.0 in `master-fix-plan.md`.

---

## 5. Per-asset autonomous loop

```
ASSET_LOOP(asset_request)
1. detect class (icon / illustration / animation / video / 3d / sfx)
2. lookup existing (in webview/src/icons/, lucide list, Lottie cache)
3. if found → return import path
4. else generate:
     a. compose prompt from brand grammar §3 + caller context
     b. call routing tool (§2)
     c. receive output URL or local file
     d. download + place at canonical path
     e. optimize (Imagician/Sharp/SVGO/gltf-transform)
5. integrate:
     a. update import map (webview/src/icons/index.ts auto-generated)
     b. lint pass
6. verify:
     a. Playwright loads the consuming component
     b. multimodal-looker grades against original brief
     c. if < 0.85 → regen with delta corrections (max 3)
7. commit:
     a. git add webview/src/icons/<file>
     b. commit msg: feat(assets): add <name> icon for <component>
8. record:
     a. wiki entry under "design-decisions" category
     b. evidence/F.0/<asset>/{prompt.txt, output.svg, verdict.json}
```

---

## 6. Required NPM additions

```jsonc
// webview/package.json — additions
{
  "dependencies": {
    "lucide-react": "^0.468.0",
    "@lottiefiles/react-lottie-player": "^3.5.0"
  },
  "devDependencies": {
    "vitest": "^2.1.5",
    "@vitest/ui": "^2.1.5",
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/user-event": "^14.5.2",
    "jsdom": "^25.0.1",
    "@playwright/test": "^1.49.0"
  }
}
```

After install: `npx playwright install chromium` (fetches headless browser).

---

## 7. CSS / Tailwind tokens to add (one-time)

```css
/* webview/src/index.css additions */
:root {
  /* Neumorphic shadow primitives */
  --shadow-raised: -2px -2px 6px rgba(255,255,255,0.04),
                    3px  3px 8px rgba(0,0,0,0.40);
  --shadow-pressed: inset -2px -2px 4px rgba(255,255,255,0.04),
                    inset  3px  3px 6px rgba(0,0,0,0.45);
  --shadow-glow-audio: 0 0 4px rgba(74,144,217,0.25);
  --shadow-glow-midi:  0 0 4px rgba(43,196,196,0.25);
  --shadow-glow-cv:    0 0 4px rgba(232,168,56,0.25);

  /* Motion */
  --motion-press: 100ms cubic-bezier(0.4, 0, 0.2, 1);
  --motion-hover: 200ms cubic-bezier(0.4, 0, 0.2, 1);
  --motion-modal: 250ms cubic-bezier(0.32, 0.72, 0, 1);
  --motion-page:  150ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

These are added by **F.0.6** (Icon component) and consumed everywhere via `style={{ boxShadow: 'var(--shadow-raised)', transition: 'all var(--motion-hover)' }}`.

---

## 8. SFX (sound design — optional Phase F.13+)

Audio host that has no UI sound — irony. If we want them:

| Event | Description | Tool |
|---|---|---|
| Block snap-to-grid | quiet click | /sfx-generator (ElevenLabs short SFX, or Freesound) |
| Cable connect | low resonant tap | same |
| Cable disconnect | inverse tap | same |
| Panic button | glass break / muted thud | same |
| Error / blocked action | small descending tone | same |
| Save success | soft chime, audio-blue spectral | same |

Wired through React via Howler.js or native HTMLAudio. **Defer until F.0-F.12 ship.**

---

## 9. Output budgets (gating values for asset-optimizer)

| Asset class | Per-file max | Total budget |
|---|---:|---:|
| SVG icon | 2 KB | 50 KB sprite |
| Empty-state PNG/AVIF | 30 KB | 250 KB pack |
| Lottie JSON | 20 KB | 200 KB |
| Hero MP4/AVIF loop | 800 KB | 1 MB |
| 3D .glb | 500 KB | (only if used) |

Vite build warns at 500 KB chunk; current main bundle is 687 KB. Target post-optimization: < 400 KB (per `master-fix-plan.md` F-10).

---

## 10. Provenance + license

- Lucide MIT — fine, attribute in /docs/credits.md
- Recraft generations — owned by us
- Fal.ai generations — owned by us per their TOS
- Lottiefiles CC0 only — never CC-BY without check
- Freesound CC0 only
- Sonniss GDC bundle — already permissive for game/app use

Every generated asset gets a `provenance.json` sibling file recording: tool | model | prompt | seed | license | created_at.

---

**End of visual asset pipeline spec.**
