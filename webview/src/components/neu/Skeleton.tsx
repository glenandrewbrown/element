/**
 * <Skeleton /> primitive — V3.0 Instrument Paradigm (Phase F.0.12)
 *
 * A neumorphic loading placeholder. Renders one of three variants:
 *  - "block"  : a rounded rectangle (configurable width + height)
 *  - "text"   : a single-line placeholder (configurable width, fixed height)
 *  - "circle" : a circular placeholder (configurable size)
 *
 * Animated with a subtle horizontal shimmer driven by Framer Motion,
 * timed to the design-system's `motionTransitions.modal` curve. Uses the
 * neumorphic pressed surface tone (var(--shadow-pressed)) so the skeleton
 * reads as recessed scaffolding, not raised content.
 *
 * Accessibility:
 *  - Wrapped in `role="status"` with `aria-live="polite"` and an SR-only
 *    "Loading" label so assistive tech announces the loading state.
 *  - Honours `prefers-reduced-motion` via the global rule in
 *    webview/src/index.css.
 *
 * Usage:
 *   <Skeleton variant="block" width={240} height={120} />
 *   <Skeleton variant="text" width="60%" />
 *   <Skeleton variant="circle" size={40} />
 *
 *   // Composition
 *   <div className="space-y-2">
 *     <Skeleton variant="text" width="80%" />
 *     <Skeleton variant="text" width="60%" />
 *     <Skeleton variant="block" height={120} />
 *   </div>
 */

import { motion } from "framer-motion";
import type { CSSProperties } from "react";

// ── Variants ────────────────────────────────────────────────────────────────

export type SkeletonVariant = "block" | "text" | "circle";

// ── Props ───────────────────────────────────────────────────────────────────

export interface SkeletonProps {
  /** Shape of the placeholder. Default: "block". */
  variant?: SkeletonVariant;
  /**
   * Width. CSS length OR pixel number. Default depends on variant:
   *  - block: "100%"
   *  - text:  "100%"
   *  - circle: ignored (use `size`)
   */
  width?: number | string;
  /**
   * Height. CSS length OR pixel number. Default depends on variant:
   *  - block:  16
   *  - text:   "0.9em" (single line)
   *  - circle: ignored (use `size`)
   */
  height?: number | string;
  /** Diameter for the "circle" variant. Default: 24. */
  size?: number;
  /** Optional className appended to the wrapper. */
  className?: string;
  /** Optional aria label override (default: "Loading"). */
  "aria-label"?: string;
}

// ── Tokens ──────────────────────────────────────────────────────────────────

/** Base background — sits between canvas and pressed for legibility. */
const SKELETON_BG = "var(--color-pressed, #1A1A1E)";

/** Shimmer overlay — semi-opaque elevated tone sliding L→R. */
const SHIMMER_GRADIENT =
  "linear-gradient(90deg, " +
  "rgba(255,255,255,0.0) 0%, " +
  "rgba(255,255,255,0.05) 50%, " +
  "rgba(255,255,255,0.0) 100%)";

// ── Component ───────────────────────────────────────────────────────────────

export function Skeleton({
  variant = "block",
  width,
  height,
  size = 24,
  className = "",
  "aria-label": ariaLabel = "Loading",
}: SkeletonProps) {
  const dims = resolveDimensions(variant, width, height, size);

  const baseStyle: CSSProperties = {
    width: dims.width,
    height: dims.height,
    borderRadius: variant === "circle" ? "9999px" : "4px",
    background: SKELETON_BG,
    boxShadow: "var(--shadow-pressed)",
    overflow: "hidden",
    display: "inline-block",
    position: "relative",
    verticalAlign: "middle",
  };

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className={["neu-skeleton", className].filter(Boolean).join(" ")}
      style={baseStyle}
    >
      <motion.span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: SHIMMER_GRADIENT,
          backgroundSize: "200% 100%",
          backgroundRepeat: "no-repeat",
        }}
        initial={{ backgroundPositionX: "200%" }}
        animate={{ backgroundPositionX: "-100%" }}
        transition={{
          duration: 1.4,
          ease: "linear",
          repeat: Infinity,
        }}
      />
      <span className="sr-only">{ariaLabel}</span>
    </span>
  );
}

// ── Dimension resolver ──────────────────────────────────────────────────────

function resolveDimensions(
  variant: SkeletonVariant,
  width: number | string | undefined,
  height: number | string | undefined,
  size: number,
): { width: string | number; height: string | number } {
  if (variant === "circle") {
    return { width: size, height: size };
  }
  if (variant === "text") {
    return {
      width: width ?? "100%",
      height: height ?? "0.9em",
    };
  }
  // block
  return {
    width: width ?? "100%",
    height: height ?? 16,
  };
}

export default Skeleton;
