# Clip A — Overview + Semantic-zoom tiers

**Flow:** focus canvas → Cmd+0 fit → zoom IN (Cmd+=) to expanded tier → zoom OUT
(Cmd+-) through standard (knobs+VU) → compact (name chip) → back.

**Expected behaviour:**
- Cmd+0 fits the Board; ValhallaSupermassive block centres.
- Zoom IN: block grows → **expanded tier** = full param-port list (real Valhalla
  params: Mix, DelaySync, Feedback, Density, Width, LowCut, HighCut, ModRate…).
- Zoom OUT: block shrinks → **standard tier** = macro knobs (GAIN/PAN/MIX/FREQ/Q)
  + L/R VU well → then **compact tier** = name chip only.
- Tier transitions should be smooth (150ms), no overlap, text legible per tier,
  no clipped/garbled labels (adaptive-contextual-layout rule).
- Right panel HEALTH stays live (CPU updates).

**Watch for defects:** tier text overlap, knobs/ports overflowing the card,
illegible labels at small zoom, janky transition, block chrome clipping.
