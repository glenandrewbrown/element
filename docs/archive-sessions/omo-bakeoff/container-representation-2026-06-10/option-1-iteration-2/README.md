# Container Block — Option 1 Iteration 2

Full variant coverage extending the mini-graph thumbnail direction Glen liked.

## Specimens

**S1 — Standard 96 px (idle / hover / selected)**
Idle keeps cable opacity low so the thumbnail reads as a schematic. Hover brightens cables and the dive hint simultaneously. Selected adds a 1.5 px instrument-colour ring with a soft outer glow — the ring carries the selection signal, not a colour-fill.

**S2 — Compact / title tiers**
Three discrete breakpoints: micro-strip (category dots, no labels) at ~0.45×, count chip in the header at ~0.35×, icon-only pips at ~0.20×. The count chip eliminates the thumbnail DOM entirely so there is no layout cost at extreme zoom.

**S3 — Dense fallback (>12 blocks)**
Above 12 internal blocks the mini-graph is replaced by a heatmap of category-coloured bars — one bar per block, height proportional to output-port count as a complexity proxy. The threshold note is always visible. S3b shows the mini-graph is still usable at exactly 12, so the cutoff is generous.

**S4 — Portal vs local Container**
Local Container: neutral "Local" badge, standard white nested-squares icon. Portal: teal accent on header line, icon, badge, LED, and a dashed thumbnail outline (dashes = externally linked). Missing-file state escalates to a red ring + warning surface with a locate instruction.

**S5 — Muted / Bypassed**
Muted: red ring (1.5 px, 55 % opacity) + `filter:saturate(0.15) brightness(0.65)` on the thumbnail. Bypassed: grey ring + full `saturate(0)` + "signal passes through" hint. Bypassed is intentionally quieter than muted.

**S6 — IO summary lanes**
IN/OUT bars sit flush above and below the thumbnail, sharing its inset shadow so they read as one recessed panel. Multi-signal variant uses circle/triangle/diamond pip shapes consistent with the rest of the system.

**S7 — Nested container in thumbnail**
The nested container renders as a bordered rectangle inside the thumbnail with its own mini icon and a tiny internal node row. The depth badge switches to "N levels deep" when nesting is detected.

**S8 — Activity hint**
Static mock of idle vs active states. Motion intent documented in S8c: cable dash-offset animation, 4-bar VU strip in the header driven by rAF, thumbnail border pulse on a 2 s loop. All three cues switch off on silence after 500 ms. No animation code written yet — Glen should approve the motion layer count before implementation.

## Open questions for Glen

- Density threshold at 12 blocks: right, or should it drop to 8 for cleaner thumbnails earlier?
- Portal dashed outline: clear enough vs Container, or would a teal fill strip on the thumbnail top edge be stronger?
- Activity hint: all three motion layers wanted, or just one to avoid playback noise?

## Recommendation

Ship S1 + S2 + S5 first (everyday editing states, all reuse the same CSS classes). Add S4 + S6 in the same pass. S3 and S7 follow once the mini-graph renderer is stable. S8 motion waits for a dedicated animation-budget review with real audio running.
