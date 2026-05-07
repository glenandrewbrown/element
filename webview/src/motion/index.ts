/**
 * Motion vocabulary — V3.0 Instrument Paradigm
 *
 * Element micro-interactions are encoded as a small, reusable set of
 * timing + easing tokens. Components reference these tokens (or the
 * matching CSS custom properties on `:root`) instead of inlining
 * milliseconds, so the motion language stays consistent across the UI.
 *
 * Pairs with the CSS custom properties added to `webview/src/index.css`
 * (--motion-press, --motion-hover, --motion-modal, --motion-page,
 *  --shadow-raised, --shadow-pressed, --shadow-glow-{audio,midi,cv}).
 *
 * See docs/ELEMENT_UNIFIED_BLUEPRINT.md and
 * .sisyphus/plans/visual-asset-pipeline.md §3 + §7.
 */

// ── Easing curves ───────────────────────────────────────────────────────────

/** Material-style standard easing — most UI motion. */
export const EASE_STANDARD = "cubic-bezier(0.4, 0, 0.2, 1)";

/** Modal / overlay entry — slightly more decisive at the end. */
export const EASE_MODAL = "cubic-bezier(0.32, 0.72, 0, 1)";

/** Out-expo — used by Tailwind --ease-out-expo token. */
export const EASE_OUT_EXPO = "cubic-bezier(0.16, 1, 0.3, 1)";

// ── Durations (ms) ──────────────────────────────────────────────────────────

/** Press / tap response. */
export const DURATION_PRESS = 100;

/** Hover / focus reveal. */
export const DURATION_HOVER = 200;

/** Modal / overlay entry. */
export const DURATION_MODAL = 250;

/** Page / section transition. */
export const DURATION_PAGE = 150;

// ── Composite transition strings (CSS-ready) ────────────────────────────────

/**
 * Pre-composed CSS `transition` value strings. Mirrors the CSS variables
 * declared in `index.css` so JS-side animations stay in lockstep.
 */
export const transitions = {
  press: `${DURATION_PRESS}ms ${EASE_STANDARD}`,
  hover: `${DURATION_HOVER}ms ${EASE_STANDARD}`,
  modal: `${DURATION_MODAL}ms ${EASE_MODAL}`,
  page: `${DURATION_PAGE}ms ${EASE_STANDARD}`,
} as const;

export type MotionToken = keyof typeof transitions;

// ── Framer Motion-friendly transition records ───────────────────────────────

/**
 * Reusable transition records for Framer Motion components. Numeric
 * `duration` is in seconds (Framer's convention).
 */
export const motionTransitions = {
  press: { duration: DURATION_PRESS / 1000, ease: [0.4, 0, 0.2, 1] as const },
  hover: { duration: DURATION_HOVER / 1000, ease: [0.4, 0, 0.2, 1] as const },
  modal: { duration: DURATION_MODAL / 1000, ease: [0.32, 0.72, 0, 1] as const },
  page: { duration: DURATION_PAGE / 1000, ease: [0.4, 0, 0.2, 1] as const },
} as const;

// ── Neumorphic shadow primitives (mirror of CSS vars) ───────────────────────

export const shadows = {
  raised:
    "-2px -2px 6px rgba(255,255,255,0.04), 3px 3px 8px rgba(0,0,0,0.40)",
  pressed:
    "inset -2px -2px 4px rgba(255,255,255,0.04), inset 3px 3px 6px rgba(0,0,0,0.45)",
  glowAudio: "0 0 4px rgba(74,144,217,0.25)",
  glowMidi: "0 0 4px rgba(43,196,196,0.25)",
  glowCv: "0 0 4px rgba(232,168,56,0.25)",
} as const;

export type ShadowToken = keyof typeof shadows;

// ── CSS custom-property accessors (matches webview/src/index.css) ───────────

/**
 * Returns a CSS `var(--motion-...)` reference, suitable for inline styles:
 *   `style={{ transition: cssMotionVar('hover') }}`
 */
export function cssMotionVar(token: MotionToken): string {
  return `var(--motion-${token})`;
}

/**
 * Returns a CSS `var(--shadow-...)` reference, suitable for inline styles.
 */
export function cssShadowVar(token: ShadowToken): string {
  switch (token) {
    case "raised":
      return "var(--shadow-raised)";
    case "pressed":
      return "var(--shadow-pressed)";
    case "glowAudio":
      return "var(--shadow-glow-audio)";
    case "glowMidi":
      return "var(--shadow-glow-midi)";
    case "glowCv":
      return "var(--shadow-glow-cv)";
  }
}
