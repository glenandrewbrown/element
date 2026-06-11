/**
 * blockWidth — pure helper that sizes a Block's chassis width to fit its title.
 *
 * Bug 2 (Glen 2026-06-10): a long plugin name ("Kontakt 7", "RX 10 De-reverb")
 * truncated to "Kontak…" in the fixed `w-52` (208px) header. Per the
 * adaptive-layout rule (size to context, no overlap) the block GROWS to fit the
 * title up to a sane max, rather than truncating at a fixed width.
 *
 * The header lays out: icon (≈18px incl. gap) + title + LED/pills/B-M-chevron
 * cluster (≈92px reserved for chrome) + horizontal padding (≈16px). The title is
 * 11px bold; we approximate its width with a per-char advance and clamp the
 * resulting chassis width between BLOCK_MIN_WIDTH and BLOCK_MAX_WIDTH. Real
 * measurement still flows back via React Flow `node.measured`, so this only needs
 * to be a good upper-bound estimate that prevents truncation.
 */

/** Floor — the historical `w-52` (208px) so short-named blocks are unchanged. */
export const BLOCK_MIN_WIDTH = 208;
/** Ceiling — a sane max so a pathological name can't make a giant block. */
export const BLOCK_MAX_WIDTH = 280;
/** Approx advance (px) of one 11px bold character in the header font.
 *  Measured live (Inter bold 11px, Storybook chromium 2026-06-11): avg advance
 *  ≈ 5.7px — 6.4 keeps headroom for wide-glyph-heavy names. */
const CHAR_ADVANCE_PX = 6.4;
/** Fixed header chrome around the title: icon+gap + LED/CPU pill/format pill +
 *  B-M buttons + chevron + padding. Measured live at 151px ("22%" + "AU" pills);
 *  160 adds slack for wider pills ("100%", "VST3"). */
const HEADER_CHROME_PX = 160;

/**
 * The chassis width (px) for a Block with the given title, clamped to
 * [BLOCK_MIN_WIDTH, BLOCK_MAX_WIDTH]. Empty/short titles return the min; long
 * titles widen up to the max (beyond which the title ellipsizes — intentional,
 * the max guards proportions).
 */
export function blockWidthForTitle(title: string): number {
  const titlePx = Math.ceil((title?.length ?? 0) * CHAR_ADVANCE_PX);
  const needed = HEADER_CHROME_PX + titlePx;
  return Math.max(BLOCK_MIN_WIDTH, Math.min(BLOCK_MAX_WIDTH, needed));
}
