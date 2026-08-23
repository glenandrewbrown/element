/**
 * blockWidth — pure helper that sizes a Block's chassis width.
 *
 * Space-efficient redesign (Glen 2026-06-12): blocks must NOT grow to
 * accommodate the full plugin name. Cap at 168px (was adaptive up to 280px).
 * Long names are middle-truncated in the header; the full name is always
 * accessible via the `title` tooltip attribute. Short names keep the same floor.
 *
 * The header lays out: icon (≈18px incl. gap) + truncated title + LED/pills/
 * B-M-chevron cluster (≈92px) + horizontal padding (≈16px). The title is
 * 11px bold; we keep a fixed chassis width so all blocks align on a consistent
 * grid regardless of plugin name length.
 */

/** Fixed chassis width — all standard blocks use this width. Compact and dense
 *  enough to avoid name-driven layout sprawl, wide enough for ≈10 char names
 *  plus the header chrome (icon + B/M/chevron + pills + padding ≈ 128px). */
export const BLOCK_MIN_WIDTH = 168;
/** Same as min: we no longer grow to fit names. Kept for callers that reference
 *  the max (e.g. the previous adaptive-width logic, now unified). */
export const BLOCK_MAX_WIDTH = 168;

/** Characters to show on each side of a middle-truncated name. At 168px there
 *  is room for ≈ 6 chars of chrome + ≈ 5+5 title chars = e.g. "Konta…8 Fac". */
const TRUNC_SIDE = 5;

/**
 * Middle-truncate `name` to at most `maxChars` characters.
 * "Kontakt 8 Factory Library" → "Konta…brary" (5 + … + 5)
 * Names at or under maxChars are returned unchanged.
 */
export function middleTruncate(
  name: string,
  maxChars = TRUNC_SIDE * 2 + 1,
): string {
  if (!name || name.length <= maxChars) return name;
  const half = Math.floor((maxChars - 1) / 2);
  const tail = maxChars - 1 - half;
  return `${name.slice(0, half)}…${name.slice(name.length - tail)}`;
}

/**
 * The chassis width (px) for a Block. All blocks use the fixed BLOCK_MIN_WIDTH;
 * this function exists so callers don't embed the constant directly and can be
 * updated centrally.
 */
export function blockWidthForTitle(_title: string): number {
  return BLOCK_MIN_WIDTH;
}
