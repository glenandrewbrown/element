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
 * Containers/Portals. Use it for upward navigation when the user has dived into
 * a Block's nested Board — clicking any earlier crumb pops back to that level.
 * Renders nothing at the root (depth ≤ 1), so it can live permanently above the
 * canvas. Driven entirely by the graph store's breadcrumb stack.
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
  const navigate = useGraphStore((s) => s.navigateToBreadcrumb);

  if (breadcrumbs.length <= 1) return null;

  return (
    <nav
      aria-label="Nested Board path"
      className="flex items-center h-7 px-3 bg-panel/70 border-b border-white/5 select-none overflow-x-auto"
    >
      {breadcrumbs.map((crumb, i) => {
        const isLast = i === breadcrumbs.length - 1;
        // Crumb at index i sits at depth-level i (0 = root). Tint each pill by
        // its own level so the trail shows the depth gradient.
        const tint = depthHsl(i, isLast ? 0.92 : 0.55);
        return (
          <span key={`${crumb}-${i}`} className="flex items-center shrink-0">
            {i > 0 && CHEVRON}
            <button
              type="button"
              onClick={() => !isLast && navigate(i)}
              aria-current={isLast ? "page" : undefined}
              className={[
                "flex items-center h-5 px-2 rounded-full text-[10px] font-bold tracking-wide uppercase whitespace-nowrap transition-colors",
                isLast
                  ? "cursor-default"
                  : "cursor-pointer text-text-secondary hover:text-text-primary",
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
                      // Ancestor levels: tinted outline ring, transparent fill.
                      boxShadow: `inset 0 0 0 1px ${tint}`,
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
