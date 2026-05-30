# neomorph Design System vs Blueprint + stitch-reference — Comparison

Compared 2026-05-30: Stitch `neomorph` DS (DESIGN.md + theme tokens) vs `docs/stitch-reference/{DESIGN.md,edit-mode.html,perform-mode.html}` vs `docs/ELEMENT_UNIFIED_BLUEPRINT.md`.

## Verdict: neomorph is philosophically right but SPEC-STALE — must be patched before variant generation.

### ✅ Aligned
- **Surface ramp (DESIGN.md text):** Canvas #1E1E22 / Panel #222226 / Surface #252529 / Elevated #2A2A2E / Pressed #1A1A1E — exact match.
- **No-glass:** neomorph explicitly bans glassmorphism/backdrop-blur/transparency (lines 14, 50, 175). Shadow specs match (light rgba(255,255,255,0.05) + dark rgba(0,0,0,0.4), 8px+). ✓
- **Layout/IA:** 3-col (≈220 left palette | canvas | ≈260 right inspector), 40px toolbar, EDIT/PERFORM toggle, PANIC always visible — matches edit-mode.html + blueprint §6.1/§7.5.

### 🔴 Drift (must fix)
1. **Taxonomy = OLD 3-cat.** neomorph DESIGN.md lines 39–45 still say **Generators / Modifiers / Logic** — pre D1. Missing the 4th category **Modulators/Utilities #A87FE0 ⬡** entirely. (stitch-reference/DESIGN.md IS updated to 4-cat; neomorph is not.)
2. **Theme token divergence (Material-3 tonal, not locked accents):** Stitch `namedColors` `background:#131317` & `surface:#131317` are darker than locked Canvas #1E1E22; `primary:#a0caff` (M3 tonal) ≠ solid #4A90D9; `secondary:#fdba49`≠#E8A838; `tertiary:#4cdada`≠#2BC4C4. **#A87FE0 absent.** Generating from these → wrong lightness + missing 4th category colour.
3. **Terminology / shelved drift:** neomorph references "Sub-Board", "scenes", "Dashboard Builder", "Macro Controls", "MAP MODE", "Molecule" — legacy or shelved (D3). perform-mode.html still has Scene pills + `--logic` token.

### Guardrails for ANY new Edit-canvas variant (the fix-forward rule set)
- Surfaces: exact #1E1E22/#222226/#252529/#2A2A2E/#1A1A1E, narrow tonal band. NOT #131317.
- 4-cat, all four, correct labels + shapes: Virtual Instruments #4A90D9 ● / MIDI Effects #2BC4C4 ▲ / Audio Effects #E8A838 ◆ / Modulators-Utilities #A87FE0 ⬡. No Generators/Modifiers/Logic.
- Terminology: Block/Board/Project/Cable/Snippet/Container/Portal/Module. No Node/Graph/Session/Connection/Preset/Molecule.
- Shelved — DO NOT render: Dashboard Builder, Scene launch/pills, Macro Controls, MAP MODE.
- No glass/blur/transparency. Block header shows the category shape (●▲◆⬡) — colour-blind safety.
- Signal-type colours (separate system): Audio #4A90D9 / MIDI #2BC4C4 / Value-CV #E8A838 — distinguish from category by context.
- Edit layout: 3-col ≈220|flex|≈260, 40px toolbar, ≤28px status strip.

### Recommended action
Patch the `neomorph` Stitch design system to current spec (4-cat + #A87FE0, locked surface hexes over the M3 tonal values, strip shelved/legacy terms) — basis = the already-correct `docs/stitch-reference/DESIGN.md` — BEFORE generating Edit-canvas variants. Otherwise every variant inherits the stale taxonomy + wrong colours.
