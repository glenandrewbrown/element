import { useViewport } from "@xyflow/react";
import type { GhostRect } from "./optionDragDuplicate";

/**
 * Option-drag ghost originals — dashed neumorphic placeholders at the
 * pre-drag positions, shown while an alt-drag copy is in flight. They signal
 * "the originals stay HERE; the copy goes to the drop point" (macOS
 * Finder/Logic copy-drag affordance).
 *
 * Lives as its own component so the useViewport subscription (which
 * re-renders on every pan/zoom) only exists while the layer is mounted —
 * GraphCanvas renders it conditionally on ghosts.length > 0, keeping the
 * steady-state canvas free of per-viewport-change re-renders.
 */
export function OptionDragGhostLayer({ ghosts }: { ghosts: GhostRect[] }) {
  const viewport = useViewport();
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 1 }}
      aria-hidden
    >
      {ghosts.map((g) => (
        <div
          key={g.id}
          className="option-drag-ghost"
          style={{
            left: viewport.x + g.x * viewport.zoom,
            top: viewport.y + g.y * viewport.zoom,
            width: g.width * viewport.zoom,
            height: g.height * viewport.zoom,
          }}
        />
      ))}
    </div>
  );
}
