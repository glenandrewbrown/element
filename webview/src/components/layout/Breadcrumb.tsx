import { useGraphStore, selectBreadcrumbs } from "../../stores/useGraphStore";
import { Icon } from "../neu";
import { depthHsl } from "../canvas/depthTokens";

const CHEVRON = (
  <Icon
    name="ChevronRight"
    size={12}
    className="text-text-dim mx-0.5 shrink-0"
    aria-hidden
  />
);

/**
 * Breadcrumb trail showing the path from the root Board down into nested
 * Containers/Portals. Always visible (including at root) so the user always
 * knows where they are. Clicking any ancestor crumb pops back to that level.
 * Driven entirely by the graph store's breadcrumb stack.
 *
 * At the root (breadcrumbs.length ≤ 1) a single non-clickable "Board" crumb is
 * shown so the bar is never empty — the user always has a location indicator.
 *
 * Each crumb is a depth-tinted pill: its border/glow comes from the `--depth-N`
 * token for that crumb's level (index 0 = level 0 = root blue, deepening down
 * the stack), so the trail itself renders the depth gradient and the current
 * (deepest) level reads as a filled, glowing chip. This mirrors the canvas
 * NestedChrome (shared {@link depthHsl} helper) so the breadcrumb and the
 * nested-frame/ribbon/banner agree on the per-level tint — colour is always
 * paired with position + label text, never the sole carrier.
 */
export function Breadcrumb() {
  const breadcrumbs = useGraphStore(selectBreadcrumbs);
  // Crumb clicks are engine-driven (the dive-desync fix): exiting to a level
  // asks the host to back out that many times, and the trail redraws ONLY from
  // the snapshot the host re-pushes — so it can never disagree with the canvas.
  const exitToBreadcrumb = useGraphStore((s) => s.exitToBreadcrumb);

  // breadcrumbStack[0] is the session/project name (e.g. "My Project").
  // breadcrumbStack[1] is the active board name. [2+] are Container dives.
  // The nav crumbs replace index 0 with "Board" (canvas tool, not session title)
  // but we keep the project name to show as secondary context in the bar.
  const engineCrumbs = breadcrumbs.length > 0 ? breadcrumbs : ["Untitled"];
  const projectName = engineCrumbs[0] ?? "Untitled";
  // Nav crumbs: "Board" replaces the session name; nested levels kept as-is.
  const crumbs = ["Board", ...engineCrumbs.slice(1)];

  return (
    <nav
      aria-label="Nested Board path"
      className="flex items-center h-7 px-3 bg-panel/70 border-b border-white/5 select-none overflow-x-auto gap-2"
    >
      {/* Project name — secondary context, not a nav crumb */}
      <span
        className="text-[10px] text-text-dim shrink-0 pr-1 border-r border-white/10"
        title={projectName}
      >
        {projectName}
      </span>

      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        // Crumb at index i sits at depth-level i (0 = root). Tint each pill by
        // its own level so the trail shows the depth gradient.
        const tint = depthHsl(i, isLast ? 0.92 : 0.55);
        return (
          <span key={`${crumb}-${i}`} className="flex items-center shrink-0">
            {i > 0 && CHEVRON}
            <button
              type="button"
              onClick={() => !isLast && void exitToBreadcrumb(i)}
              aria-current={isLast ? "page" : undefined}
              className={[
                "flex items-center h-5 px-2 rounded-full text-[10px] font-bold tracking-wide uppercase whitespace-nowrap transition-colors",
                isLast ? "cursor-default" : "cursor-pointer hover:opacity-100",
              ].join(" ")}
              style={
                isLast
                  ? {
                      // Active level: filled chip in its depth tint.
                      color: "#0E0E12",
                      background: tint,
                      boxShadow: `0 0 8px ${depthHsl(i, 0.4)}`,
                    }
                  : {
                      // Ancestor levels: depth-tinted text + outline ring.
                      color: tint,
                      boxShadow: `inset 0 0 0 1px ${depthHsl(i, 0.4)}`,
                      opacity: 0.8,
                    }
              }
            >
              {crumb}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
