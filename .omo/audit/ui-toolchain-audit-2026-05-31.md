# UI Toolchain Failure Audit — 2026-05-31

Glen, after ~8 rejected rounds on a SINGLE component (the Block): *"all your ui work has been an
absolute disgrace and a waste of my tokens… escalate this to the highest possible learning of
failure and workflow/tools reevaluation."* This is that audit. Brutal + honest.

## 1. The smoking gun

The last pass ("faithful port", multi-agent workflow) shipped a Block that:
- had a **transparent centre** (canvas grid visible through the chassis) — "absolutely cannot be",
- had a **worse** muted state ("worst ui I've ever seen"),
- **misaligned** header/port text, white rings on ports, an out-of-place green load bar.

…and the workflow's **verify agents returned `matches: true`** and "pixel-faithful". The neu-primitives
workflow then hard-failed (0 tokens of useful work, StructuredOutput errors).

Worse: the workflow's verify agents returned `matches:true` / "pixel-faithful", **and I looked at the
same screenshots and reported them to Glen as "a significant leap."** Neither the agents NOR I could
see the quality gap. That is the headline failure.

**Conclusion: the #1 problem is BLIND VERIFICATION (agents and me). The build method is also wrong.
Verification must be fixed first — it is independent of whichever build path we pick, and until it is
fixed every path fails identically.**

Note the failures came in two distinct classes, and the fix for one does NOT fix the other:
- **Craft failures** (rounds 1–4): misaligned header chips, wrong knob/meter proportion, cramped CPU
  chip, missing hover, inconsistent meter scale, disliked port rings, "poor attention to detail."
  These are hand-authored styling/layout mistakes — a perfect token system leaves every one of them.
- **Structural failures** (later rounds): transparent backgrounds, broken overlays — the design-system
  stack mismatch in §3b.

## 2. Root causes (systemic, not one-off)

1. **WRONG TOOL CLASS.** I treated "make it look like the mockup" as *hand-write React + CSS*. It is
   a *generate / extract a polished design* problem. Every pass was hand-rolled inline styles or an
   LLM agent **re-typing the mockup by eye**. Hand-rolling/transcription = amateur output + bugs.
2. **BLIND VERIFICATION.** LLM agents (and me) "look at a low-res screenshot and say it matches."
   They confirmed success on a transparent, broken block. `shot.mjs` PNGs + LLM visual judgement is
   NOT a gate. Proven false-positive, repeatedly.
3. **TRANSCRIPTION DROPS CONTEXT → BUGS.** Re-typing the mockup's `hsl(var(--token))` CSS into
   Element's Tailwind-v4 `@theme` context broke token resolution / backgrounds (the transparent
   centre). Copying code by hand ≠ working code, because the surrounding CSS/build context differs.
4. **NEVER USED THE LIVE MOCKUP AS GROUND TRUTH.** The mockup is a real working app
   (`mindful-studio` repo + live `https://preview--neurosonic-canvas.lovable.app/`). I worked from
   stale static screenshots instead of the running source + its real CSS.
5. **THE DESIGNER MANDATE WAS NOT ACTUALLY EXECUTED.** Glen mandated `ui-ux-pro-max` + a designer
   agent. The workflows used **generic opus agents** labelled "designer", not the specialised
   design tools/agent. I invoked `ui-ux-pro-max` ONCE (for a wizard question), never to design.
6. **SWARMS AMPLIFIED THE PROBLEM.** Fanning out generic agents that all hand-roll = more amateur
   output faster + wasted tokens (the neu workflow failure).

## 3. Tools I HAD the whole time and never used

| Tool / skill / MCP | What it does | Used? |
|---|---|---|
| **`mcp__stitch__*`** (Google Stitch) | GENERATE screens/components + design systems from text; the mockup itself looks Stitch/lovable-generated | ❌ never |
| **`mcp__magic__*`** (21st.dev) | `component_builder` / `component_refiner` — generate + refine **polished** React components | ❌ never |
| **`neumorphism-generator`** skill | Emits the exact neumorphism.io box-shadow/background CSS from a base colour | ❌ never (and neu shadows were a repeated complaint) |
| **`mcp__chrome-devtools__*`** | Drive the LIVE lovable preview: pixel-accurate screenshots + `evaluate_script` to extract EXACT computed styles per element | ❌ never on the mockup |
| **`mcp__storybook__*`** | Real prop/render truth, `run-story-tests`, `preview-stories` | ⚠️ barely |
| **`ui-ux-pro-max`** skill | 67 styles / 96 palettes / font pairings / shadcn MCP — design standards | ⚠️ once, not for design |
| **`uiverse-galaxy`** (109 neumorphism elements), **`reactbits-components`**, **`shadcn-ui`** | Ready, polished component sources | ❌ never |
| **`stitch-code-to-design` / `extract-design-md` / `react-components`** | Extract the mockup's design system → tokens → React, AST-validated | ❌ never |
| **`oh-my-claudecode:designer`** agent (real designer subagent) | UI/UX designer-developer | ❌ used generic opus instead |

I hand-rolled an audio-plugin UI with **zero** of the design-generation, design-extraction, or
objective-verification tools that were sitting right there.

## 3b. THE DEEPEST ROOT CAUSE — incompatible design-system stacks (found during this audit)

The mockup and Element are built on **different, incompatible UI stacks**:

| | mockup (`mindful-studio` / lovable) | Element `webview` |
|---|---|---|
| Tailwind | **v3** (`@tailwind base/components/utilities`, `tailwind.config.ts`, `@layer base`) | **v4** (`@import "tailwindcss"`, `@theme{}`, `@tailwindcss/vite`) |
| Tokens | **HSL CSS vars** `--cat-x: 210 65% 57%` → `hsl(var(--cat-x))` | **hex** in `@theme` `--color-x: #4a90d9` |
| Component kit | **shadcn + Radix** (27 `@radix-ui/*`, `class-variance-authority`, `tailwind-merge`) | **none** (bespoke `neu/*`) |

So a mockup component (`NodeBlock.tsx`) doesn't just need its own styles copied — it transitively
references a whole shadcn/Radix/Tailwind-v3 token universe (`--background`, `--border`, `--card`,
`--muted`, cva variants, Radix primitives) that **does not exist in Element**. Copy/transcribe it and
those tokens resolve to nothing → **transparent backgrounds, broken layout, misalignment** — exactly
the bugs Glen keeps seeing. **"Port the mockup onto Element" was structurally doomed to leak bugs
every single time, no matter how careful the transcription.** This is why 8 rounds failed.

## 4. The corrected approach (recommendation)

### FIRST, regardless of build path — fix VERIFICATION (the headline)

This is the one change that matters most; every build path fails identically without it.
1. **Objective faithfulness check, not LLM vibe.** Drive the **live mockup + Element with
   `mcp__chrome-devtools__*`** (`evaluate_script` → computed styles per element) and diff the numbers;
   high-DPI screenshots; structural/pixel diff. No agent (or me) may report "matches" from eyeballing a
   low-res PNG — that is exactly how a transparent, broken block got called "a significant leap".
2. **Human gate EARLY + CHEAP.** Get ONE component objectively faithful, put that ONE in front of Glen,
   then scale. **Never batch the other 36 before that gate.** (chrome-devtools proves *faithful to the
   mockup*; it cannot judge taste calls like meter-scale consistency — so Glen's eyes stay the final gate,
   just used once-per-pattern, not once-per-flailing-round.)
3. Use the **real `oh-my-claudecode:designer` agent + the design skills**, never generic opus, for UI.

### THE ONE THING PROVEN DEAD
**Piecemeal hand-porting the mockup's look into Element's incompatible stack.** 8 rounds, every time.
Stop it completely. Do NOT propose "port TW-v3+shadcn into the v4 app" or "adopt shadcn wholesale" as
the fix either — those are big migrations with their own failure surface, and Glen asked for an audit,
not an architecture migration.

## 5. The fork — Glen's call (finding + one recommendation)

The mockup is **already a complete, coherent UI that Glen loves and that actually works.** Element's
webview is a half-built migration on an incompatible stack. So the honest binary is:

- **(A — RECOMMENDED) Build ON the mockup. Invert the effort.** Take the mockup app as the UI
  foundation and wire **Element's engine into it** (the JUCE `window.__JUCE__` bridge + Zustand stores +
  React Flow data), instead of dragging the mockup's look into Element. The design is already done +
  approved + working; we add the engine, not re-draw the paint. Kills the transcription gap at the root.
- **(B) Keep Element's webview stack and REGENERATE** each component natively (Tailwind-v4/hex) with the
  design tools (**Stitch / 21st-magic / neumorphism-generator / ui-ux-pro-max**), matched to the mockup —
  never hand-rolled. More work, keeps Element's current shell.

**Recommend A.** Lowest risk to "actually looks like the design", because the design already exists and
runs — we stop fighting it. Whichever you pick, the **chrome-devtools objective-verification gate + the
revert of the current broken Block** apply first.
