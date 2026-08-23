import { useGraphStore, selectBreadcrumbs } from "../../stores/useGraphStore";

const CHEVRON = (
  <svg
    width={12}
    height={12}
    viewBox="0 0 24 24"
    fill="currentColor"
    className="text-text-dim mx-1 shrink-0"
  >
    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
  </svg>
);

/**
 * Breadcrumb trail showing the path from the root Board down into nested
 * Containers/Portals. Use it for upward navigation when the user has dived into
 * a Block's nested Board — clicking any earlier crumb pops back to that level.
 * Renders nothing at the root (depth ≤ 1), so it can live permanently above the
 * canvas. Driven entirely by the graph store's breadcrumb stack.
 */
export function Breadcrumb() {
  const breadcrumbs = useGraphStore(selectBreadcrumbs);
  const navigate = useGraphStore((s) => s.navigateToBreadcrumb);

  if (breadcrumbs.length <= 1) return null;

  return (
    <nav className="flex items-center h-6 px-4 bg-panel/60 border-b border-white/5 text-[10px] font-medium tracking-wide uppercase select-none">
      {breadcrumbs.map((crumb, i) => {
        const isLast = i === breadcrumbs.length - 1;
        return (
          <span key={`${crumb}-${i}`} className="flex items-center">
            {i > 0 && CHEVRON}
            <button
              onClick={() => !isLast && navigate(i)}
              className={[
                "transition-colors",
                isLast
                  ? "text-text-primary cursor-default"
                  : "text-text-secondary hover:text-text-primary cursor-pointer",
              ].join(" ")}
            >
              {crumb}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
