import type { ReactNode } from "react";
import { Icon } from "../neu/Icon";

/**
 * PanelRail — the ONE unified 40px neumorphic icon rail used by BOTH collapsed
 * side panels (VS Code Activity-Bar pattern). Collapse hides a panel's CONTENT
 * but leaves a one-click icon rail to restore it — "collapse hides content, not
 * access" (research §D item 1). This replaces the two divergent rails that
 * existed before: AppShell's blank 36px drag-handle pill and ToolPalette's own
 * 40px category rail (brief §1.3 / §4.1).
 *
 * The rail is deliberately dumb: a top "expand" button (re-opens the panel +
 * runs an optional side-effect, e.g. focus search) plus an optional set of
 * extra glyph buttons (e.g. the left browser's category filters) that each
 * re-expand AND apply their action. Every button carries an `aria-label`
 * (a11y gate).
 *
 * Painter rule: static neumorphic shadows only; the only motion is a one-shot
 * `transition-colors` on hover. No per-tick blur/shadow animation.
 */

export interface PanelRailButton {
  /** Stable key for React. */
  key: string;
  /** Allowlisted Icon name (see Icon.tsx ICON_MAP). */
  icon: string;
  /** Accessible label — REQUIRED (a11y gate: every rail button is labelled). */
  label: string;
  /** Native title tooltip (defaults to `label`). */
  title?: string;
  /** Click handler — typically re-expands the panel and applies an action. */
  onClick: () => void;
  /** Dim the glyph (e.g. an inactive category filter). */
  dim?: boolean;
  /** Optional explicit colour for the glyph (e.g. a category hue). */
  color?: string;
}

export interface PanelRailProps {
  /** Which edge this rail docks to — controls the border side. */
  side: "left" | "right";
  /** The primary expand button's icon (Search for browser, Sliders for inspector). */
  expandIcon: string;
  /** Accessible label for the expand button. */
  expandLabel: string;
  /** Native tooltip for the expand button (defaults to `expandLabel`). */
  expandTitle?: string;
  /** Re-expand the panel. */
  onExpand: () => void;
  /** Optional extra glyph buttons below the divider. */
  buttons?: PanelRailButton[];
  /** Optional extra footer node (rare). */
  footer?: ReactNode;
}

/**
 * Fixed rail width in px. Exported so AppShell can size the canvas inset off the
 * same constant the rail renders at (no drift between the two).
 */
export const PANEL_RAIL_W = 40;

export function PanelRail({
  side,
  expandIcon,
  expandLabel,
  expandTitle,
  onExpand,
  buttons,
  footer,
}: PanelRailProps) {
  const isLeft = side === "left";
  return (
    <div
      className={[
        "w-10 shrink-0 flex flex-col items-center py-2 gap-2 bg-panel h-full",
        isLeft ? "border-r border-white/5" : "border-l border-white/5",
      ].join(" ")}
      data-testid={`panel-rail-${side}`}
    >
      <button
        type="button"
        onClick={onExpand}
        className="w-8 h-8 flex items-center justify-center rounded-md bg-surface neu-raised text-text-secondary hover:text-accent-blue transition-colors"
        title={expandTitle ?? expandLabel}
        aria-label={expandLabel}
      >
        <Icon name={expandIcon} size={13} aria-hidden />
      </button>

      {buttons && buttons.length > 0 ? (
        <>
          <div className="w-5 border-t border-white/5" />
          {buttons.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={b.onClick}
              className="w-6 h-6 flex items-center justify-center transition-opacity hover:opacity-100"
              title={b.title ?? b.label}
              aria-label={b.label}
              style={b.color ? { color: b.color } : undefined}
            >
              <span
                className="inline-flex transition-opacity"
                style={{ opacity: b.dim ? 0.5 : 1 }}
              >
                <Icon name={b.icon} size={14} strokeWidth={1.75} aria-hidden />
              </span>
            </button>
          ))}
        </>
      ) : null}

      {footer ? <div className="mt-auto">{footer}</div> : null}
    </div>
  );
}

export default PanelRail;
