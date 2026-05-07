/**
 * Canonical <Icon /> component for Element webview — V3.0 Instrument Paradigm.
 *
 * Wraps lucide-react. Single-tone monochrome, 1.5px stroke, 24×24 grid.
 * Pairs with the design tokens shipped in webview/src/motion/index.ts (F.0.9)
 * and the brand grammar in .sisyphus/plans/visual-asset-pipeline.md §3.
 *
 * Accessibility: when neither `aria-label` nor `aria-hidden` is provided, the
 * icon defaults to `aria-hidden="true"` (decorative — for content icons,
 * always pass `aria-label`).
 *
 * Unknown icon names render a `<HelpCircle />` fallback and emit a single
 * dev-mode `console.warn` per unique unknown name.
 */

import * as LucideIcons from "lucide-react";
import type { LucideProps } from "lucide-react";
import { HelpCircle } from "lucide-react";
import type { ComponentType } from "react";

// ── Semantic tone palette (mirrors CLAUDE.md V3.0) ──────────────────────────

const TONE_COLORS = {
  audio: "#4A90D9",
  midi: "#2BC4C4",
  cv: "#E8A838",
  primary: "#E5E5EA",
  secondary: "#8E8E93",
} as const;

export type IconTone = keyof typeof TONE_COLORS;

// ── Props ───────────────────────────────────────────────────────────────────

export interface IconProps {
  /** Lucide icon export name (e.g. "AudioWaveform", "Cable", "Power"). */
  name: string;
  /** Pixel size; default 16. */
  size?: number;
  /** Optional className passed to the underlying SVG. */
  className?: string;
  /** Semantic tone — sets stroke colour to the design-system hue. */
  tone?: IconTone;
  /** Stroke width override; default 1.5 (V3.0 brand grammar). */
  strokeWidth?: number;
  /** Accessible label for content icons. */
  "aria-label"?: string;
  /** Pass-through for decorative icons (default true when no aria-label). */
  "aria-hidden"?: boolean | "true" | "false";
}

// ── Unknown-name dev warnings (deduplicated) ────────────────────────────────

const warned = new Set<string>();

function warnUnknownIcon(name: string): void {
  // Vite injects `import.meta.env.DEV` at build time; suppress in production.
  if (!import.meta.env.DEV) return;
  if (warned.has(name)) return;
  warned.add(name);
  // eslint-disable-next-line no-console
  console.warn(
    `[Icon] Unknown lucide icon name "${name}" — rendering <HelpCircle /> fallback. ` +
      `If this is an audio-domain glyph (cable / jack / port-* / scene / etc.), ` +
      `track it as a Phase F.0.8 custom-icon gap.`,
  );
}

// ── Component ───────────────────────────────────────────────────────────────

/**
 * Render a Lucide icon by export name.
 *
 * Decorative by default — pass `aria-label` for content icons.
 *
 *   <Icon name="AudioWaveform" tone="audio" aria-label="Audio waveform" />
 *   <Icon name="Settings" />            // decorative, aria-hidden auto-applied
 */
export function Icon({
  name,
  size = 16,
  className,
  tone,
  strokeWidth = 1.5,
  "aria-label": ariaLabel,
  "aria-hidden": ariaHidden,
}: IconProps) {
  // Lookup the lucide export. The lucide-react module exposes named icon
  // components plus utility exports (createLucideIcon, etc.) — we filter
  // for components by checking PascalCase + that the value is callable.
  const lucideMap = LucideIcons as unknown as Record<
    string,
    ComponentType<LucideProps> | undefined
  >;
  const Resolved = lucideMap[name];

  const isComponent =
    typeof Resolved === "function" || typeof Resolved === "object";

  let LucideComponent: ComponentType<LucideProps>;
  if (isComponent && Resolved) {
    LucideComponent = Resolved;
  } else {
    warnUnknownIcon(name);
    LucideComponent = HelpCircle;
  }

  // Decorative-by-default a11y rule.
  const resolvedAriaHidden =
    ariaLabel !== undefined
      ? ariaHidden
      : ariaHidden !== undefined
        ? ariaHidden
        : true;

  const color = tone ? TONE_COLORS[tone] : undefined;

  return (
    <LucideComponent
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      color={color}
      aria-label={ariaLabel}
      aria-hidden={resolvedAriaHidden as boolean | undefined}
      role={ariaLabel ? "img" : undefined}
    />
  );
}

export default Icon;
