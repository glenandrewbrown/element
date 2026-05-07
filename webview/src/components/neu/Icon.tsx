/**
 * Canonical <Icon /> component for Element webview — V3.0 Instrument Paradigm.
 *
 * Wraps lucide-react with an EXPLICIT ALLOWLIST so the bundler can tree-shake
 * unused icons. Q1 closeout (Phase F-10): the previous `import * as LucideIcons`
 * defeated tree-shaking, ballooning the bundle from 687 kB → 1.29 MB.
 *
 * Single-tone monochrome, 1.5px stroke, 24×24 grid. Pairs with the design tokens
 * in webview/src/motion/index.ts (F.0.9) and the brand grammar in
 * .sisyphus/plans/visual-asset-pipeline.md §3.
 *
 * Adding a new icon:
 *   1. Confirm the export name on https://lucide.dev/icons (PascalCase).
 *   2. Add a named import to the LUCIDE block below.
 *   3. Add it to the ICON_MAP record.
 *   That's it — tree-shaking remains intact because every entry is a static
 *   named import.
 *
 * Accessibility: when neither `aria-label` nor `aria-hidden` is provided, the
 * icon defaults to `aria-hidden="true"` (decorative — for content icons,
 * always pass `aria-label`).
 *
 * Unknown icon names render a `<HelpCircle />` fallback and emit a single
 * dev-mode `console.warn` per unique unknown name.
 */

import {
  Activity,
  AudioWaveform,
  Cable,
  Camera,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Cpu,
  Folder,
  GripVertical,
  HeartPulse,
  HelpCircle,
  Layers,
  LayoutGrid,
  Link,
  List,
  MoreVertical,
  Music,
  Network,
  Pause,
  Pencil,
  Play,
  Plus,
  Power,
  Puzzle,
  Redo2,
  Search,
  Settings,
  SkipBack,
  Square,
  Trash2,
  Undo2,
  Volume2,
  X,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
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

// ── Static icon registry (allowlisted for tree-shaking, F-10 / Q1 fix) ──────

const ICON_MAP: Record<string, ComponentType<LucideProps>> = {
  Activity,
  AudioWaveform,
  Cable,
  Camera,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Cpu,
  Folder,
  GripVertical,
  HeartPulse,
  Layers,
  LayoutGrid,
  Link,
  List,
  MoreVertical,
  Music,
  Network,
  Pause,
  Pencil,
  Play,
  Plus,
  Power,
  Puzzle,
  Redo2,
  Search,
  Settings,
  SkipBack,
  Square,
  Trash2,
  Undo2,
  Volume2,
  X,
};

/** Icon names available without an Icon.tsx edit (string-typed for ergonomics). */
export type IconName = keyof typeof ICON_MAP;

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
      `Add it to the allowlist in webview/src/components/neu/Icon.tsx ` +
      `(named import + ICON_MAP entry). If this is an audio-domain glyph ` +
      `(cable / jack / port-* / scene / etc.), track it as a Phase F.0.8 ` +
      `custom-icon gap.`,
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
  const Resolved = ICON_MAP[name];

  let LucideComponent: ComponentType<LucideProps>;
  if (Resolved) {
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
