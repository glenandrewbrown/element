/**
 * <EmptyState /> primitive — V3.0 Instrument Paradigm (Phase F.0.10)
 *
 * A neumorphic empty-state container for "no items" states (e.g. no plugins,
 * no nodes, no presets, no MIDI input). Renders an optional illustration,
 * a title, an optional description, and an optional CTA, centered in the
 * parent.
 *
 * Pairs with the empty-state illustrations under `webview/public/illustrations/`
 * (Phase F.0.11) and the motion vocabulary in `webview/src/motion/`.
 *
 * Usage:
 *   <EmptyState
 *     illustration="no-plugins"
 *     title="No plugins yet"
 *     description="Drag a plugin from the browser to get started."
 *     size="md"
 *     tone="audio"
 *     action={<NeuButton onClick={openBrowser}>Add Plugin</NeuButton>}
 *   />
 *
 *   <EmptyState
 *     illustration={<MyCustomSvg />}
 *     title="No connections"
 *   />
 *
 * Accessibility:
 *  - The wrapper is a `<section role="status" aria-live="polite">` so empty
 *    states are announced when they replace content (e.g. after a search
 *    returns no results).
 *  - The illustration is `aria-hidden` (decorative) — the title carries
 *    the accessible name.
 *
 * Design constraints (CLAUDE.md V3.0):
 *  - Neumorphic raised surface with var(--shadow-raised). No glassmorphism.
 *  - One unified dark palette; no mode-switching colour tricks.
 *  - Tone hint applies a 4px outer glow (semantic hue at 25% opacity) only
 *    when the caller asks for it — neutral by default.
 */

import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { motionTransitions } from "../../motion";

// ── Tokens ──────────────────────────────────────────────────────────────────

/** Wrapper sizing tier. Drives padding + typography + illustration size. */
export type EmptyStateSize = "sm" | "md" | "lg";

/** Optional semantic tone — applies a subtle outer glow + accent line. */
export type EmptyStateTone = "audio" | "midi" | "cv" | "neutral";

const SIZE_TOKENS: Record<
  EmptyStateSize,
  { wrapper: string; illustration: number; title: string; description: string }
> = {
  sm: {
    wrapper: "p-4 gap-2",
    illustration: 64,
    title: "text-[12px] tracking-wide",
    description: "text-[11px]",
  },
  md: {
    wrapper: "p-6 gap-3",
    illustration: 96,
    title: "text-[14px] tracking-wide",
    description: "text-[12px]",
  },
  lg: {
    wrapper: "p-8 gap-4",
    illustration: 128,
    title: "text-[16px] tracking-wide",
    description: "text-[13px]",
  },
};

const TONE_GLOW: Record<EmptyStateTone, string | undefined> = {
  audio: "var(--shadow-glow-audio)",
  midi: "var(--shadow-glow-midi)",
  cv: "var(--shadow-glow-cv)",
  neutral: undefined,
};

// Built-in illustration registry. Maps a known name to a path under
// /illustrations/. Phase F.0.11 generates these AVIF/WebP files; until they
// land, callers can also pass a ReactNode (e.g. an inline <svg>) directly.
const ILLUSTRATION_PATHS: Record<string, string> = {
  "no-plugins": "/illustrations/no-plugins.webp",
  "no-nodes": "/illustrations/no-nodes.webp",
  "no-presets": "/illustrations/no-presets.webp",
  "no-midi-input": "/illustrations/no-midi-input.webp",
  "no-audio-input": "/illustrations/no-audio-input.webp",
  error: "/illustrations/error.webp",
  loading: "/illustrations/loading.webp",
  "sandbox-stopped": "/illustrations/sandbox-stopped.webp",
};

// ── Props ───────────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  /**
   * Either a known illustration name (resolved against the bundled
   * /illustrations/ directory) OR a ReactNode (e.g. an inline SVG component
   * or <Icon />).
   *
   * Omitted: no illustration is rendered.
   */
  illustration?: keyof typeof ILLUSTRATION_PATHS | (string & {}) | ReactNode;
  /** Required headline (carries the accessible name for the section). */
  title: string;
  /** Optional secondary line. */
  description?: string;
  /** Optional call-to-action node (typically a <NeuButton />). */
  action?: ReactNode;
  /** Sizing tier; default "md". */
  size?: EmptyStateSize;
  /** Semantic tone; "neutral" by default. */
  tone?: EmptyStateTone;
  /** Optional className passed to the wrapper. */
  className?: string;
}

// ── Component ───────────────────────────────────────────────────────────────

export function EmptyState({
  illustration,
  title,
  description,
  action,
  size = "md",
  tone = "neutral",
  className = "",
}: EmptyStateProps) {
  const tokens = SIZE_TOKENS[size];
  const glow = TONE_GLOW[tone];

  const wrapperStyle: CSSProperties = {
    boxShadow: glow
      ? `var(--shadow-raised), ${glow}`
      : "var(--shadow-raised)",
  };

  const renderedIllustration = renderIllustration(
    illustration,
    tokens.illustration,
  );

  return (
    <motion.section
      role="status"
      aria-live="polite"
      className={[
        "flex flex-col items-center justify-center text-center",
        "rounded-md bg-surface text-text-primary",
        "mx-auto max-w-sm",
        tokens.wrapper,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={wrapperStyle}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTransitions.page}
    >
      {renderedIllustration}
      <h2 className={["font-semibold uppercase", tokens.title].join(" ")}>
        {title}
      </h2>
      {description ? (
        <p className={["text-text-secondary", tokens.description].join(" ")}>
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </motion.section>
  );
}

// ── Illustration resolver ───────────────────────────────────────────────────

function renderIllustration(
  illustration: EmptyStateProps["illustration"],
  pixelSize: number,
): ReactNode {
  if (illustration === undefined || illustration === null) return null;

  // ReactNode passthrough (anything that isn't a string).
  if (typeof illustration !== "string") {
    return (
      <div
        aria-hidden="true"
        style={{ width: pixelSize, height: pixelSize }}
        className="flex items-center justify-center"
      >
        {illustration}
      </div>
    );
  }

  // String — try the registry first, fall back to the literal path.
  const src =
    illustration in ILLUSTRATION_PATHS
      ? ILLUSTRATION_PATHS[illustration as keyof typeof ILLUSTRATION_PATHS]
      : illustration;

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={pixelSize}
      height={pixelSize}
      style={{ width: pixelSize, height: pixelSize, objectFit: "contain" }}
      draggable={false}
    />
  );
}

export default EmptyState;
