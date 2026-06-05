import { motion, AnimatePresence } from "framer-motion";
import { useGraphStore, selectBreadcrumbs } from "../../stores/useGraphStore";
import { Icon } from "../neu";
import { depthHsl, depthColorName } from "./depthTokens";

// House out-expo easing as a Framer-friendly numeric tuple. Mirrors
// EASE_OUT_EXPO ("cubic-bezier(0.16,1,0.3,1)") from src/motion — Framer Motion
// v12 wants the bezier as an array, not the CSS string (same idiom as
// CommandPalette's local EASE constant).
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/**
 * NestedChrome — the canvas-level "you have dived inside a Container" frame.
 *
 * When the breadcrumb stack is deeper than the root (depth > 0) this overlays
 * the GraphCanvas with three coordinated, depth-tinted affordances so a Board
 * nested several Containers down never feels like the root Board:
 *
 *   • a `.nested-canvas-frame` inset border that visually seats the nested Board
 *     "inside" a recessed compartment cut into the dark chassis;
 *   • a left `.depth-ribbon` — a vertical bar of stacked rungs, one lit rung per
 *     level descended, tinted by the active `--depth-N` token;
 *   • an animated `.depth-banner` that slides down from the top reading
 *     "Nested · Level N · {board} inside {parent}", with a visible EXIT control.
 *
 * Everything is derived from the REAL breadcrumb state (`breadcrumbStack` +
 * `navigateToBreadcrumb`) — nothing is faked. At the root (depth 0) the whole
 * overlay is absent (honest: there is nothing nested to frame). The motion is
 * the dopamine moment of the dive: frame + ribbon + banner sweep in on descend
 * (150ms page timing, house out-expo easing) and retract on exit.
 *
 * Pointer events pass through the frame so the canvas underneath stays fully
 * interactive; only the banner and EXIT button capture clicks. Mount it once,
 * absolutely positioned, as the last child inside the GraphCanvas wrapper.
 */
export function NestedChrome() {
  const breadcrumbs = useGraphStore(selectBreadcrumbs);
  // EXIT is engine-driven (the dive-desync fix): it asks the host to back out,
  // and the breadcrumb redraws ONLY from the snapshot the host re-pushes — so
  // the banner can never disagree with the canvas. No optimistic mutation.
  const exitToBreadcrumb = useGraphStore((s) => s.exitToBreadcrumb);

  // The engine breadcrumb stack is [sessionName, activeGraphName, container1, …]
  // (host element_webview_host.cpp buildActiveGraphJson + useGraphStore
  // exitToBreadcrumb both document this shape): the FIRST TWO entries are the
  // Project and its active top-level Board — neither is a dived container. So
  // the nesting depth (containers descended) is length − 2, and the root
  // (not dived) is [session, graph] (length 2 → depth 0 → chrome absent).
  // Using length − 1 here mis-read the always-present active-graph entry as one
  // level of nesting, painting "LEVEL 1" + the nested frame at the root.
  const depth = Math.max(0, breadcrumbs.length - 2);
  const isNested = depth > 0;

  const board = breadcrumbs[breadcrumbs.length - 1] ?? "";
  const parent = breadcrumbs[breadcrumbs.length - 2] ?? "";

  // One level UP — the EXIT target and what double-click / Escape already do.
  const exitToIndex = breadcrumbs.length - 2;
  const exit = () => void exitToBreadcrumb(exitToIndex);

  return (
    <AnimatePresence>
      {isNested && (
        <motion.div
          key="nested-chrome"
          className="absolute inset-0 z-20 pointer-events-none"
          // Drive the active depth tint once at the root; every child reads it
          // via the depthHsl() helper so frame/ribbon/banner stay in lockstep.
          aria-hidden={false}
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          {/* ── Inset frame — seats the nested Board in a recessed compartment ── */}
          <motion.div
            className="absolute inset-0 rounded-[10px]"
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1 },
            }}
            transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
            style={{
              // W0-TOKENS §7.7 .nested-canvas-frame recipe, depth-driven.
              border: `2px solid ${depthHsl(depth, 0.45)}`,
              boxShadow: `inset 0 0 0 1px ${depthHsl(
                depth,
                0.15,
              )}, inset 0 64px 84px -44px ${depthHsl(depth, 0.18)}`,
            }}
          />

          {/* ── Left depth-ribbon — one lit rung per level descended ── */}
          <motion.div
            className="absolute left-0 top-0 bottom-0 w-[34px] flex flex-col items-center justify-center gap-2 py-6"
            variants={{
              hidden: { opacity: 0, x: -34 },
              visible: { opacity: 1, x: 0 },
            }}
            transition={{ duration: 0.22, ease: EASE_OUT_EXPO, delay: 0.02 }}
            style={{
              // W0-TOKENS §7.7 .depth-ribbon gradient, depth-driven.
              background: `linear-gradient(180deg, ${depthHsl(
                depth,
                0.85,
              )} 0%, ${depthHsl(depth, 0.18)} 100%)`,
              boxShadow:
                "inset -1px 0 0 rgba(255,255,255,0.06), 2px 0 8px rgba(0,0,0,0.45)",
            }}
          >
            <Icon
              name="Layers"
              size={15}
              className="shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
              color="#ffffff"
              aria-label={`Nested ${depth} ${
                depth === 1 ? "level" : "levels"
              } deep`}
            />
            {/* Stacked rungs: filled up to the active level, dim above it. */}
            <div className="flex flex-col items-center gap-[5px]">
              {Array.from({ length: depth }).map((_, i) => (
                <span
                  key={i}
                  className="block w-[5px] h-[5px] rounded-full"
                  style={{
                    background: "rgba(255,255,255,0.92)",
                    boxShadow: "0 0 4px rgba(255,255,255,0.45)",
                  }}
                />
              ))}
            </div>
            <span
              className="text-[9px] font-extrabold tabular-nums text-white/95"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
            >
              L{depth}
            </span>
          </motion.div>

          {/* ── Depth-banner — slides down, names the board, carries EXIT ── */}
          <motion.div
            className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-auto"
            variants={{
              hidden: { opacity: 0, y: -28 },
              visible: { opacity: 1, y: 0 },
            }}
            transition={{
              type: "spring",
              stiffness: 460,
              damping: 32,
              mass: 0.7,
            }}
          >
            <div
              className="flex items-center gap-2.5 h-8 pl-2.5 pr-1.5 rounded-full bg-panel select-none"
              style={{
                // Depth-tinted ring + the neu-floating lift (W0-TOKENS §7.2).
                boxShadow: `0 0 0 1px ${depthHsl(
                  depth,
                  0.5,
                )}, 0 0 16px ${depthHsl(
                  depth,
                  0.22,
                )}, 0 12px 32px rgba(0,0,0,0.6), -2px -2px 8px rgba(255,255,255,0.03)`,
              }}
            >
              {/* Level chip */}
              <span
                className="flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-extrabold tracking-wide tabular-nums"
                style={{
                  color: "#0E0E12",
                  background: depthHsl(depth, 0.92),
                  boxShadow: `0 0 8px ${depthHsl(depth, 0.4)}`,
                }}
                title={`${depthColorName(depth)} · depth ${depth}`}
              >
                <Icon name="Layers" size={11} color="#0E0E12" aria-hidden />
                LEVEL {depth}
              </span>

              {/* Path text — board inside parent */}
              <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide whitespace-nowrap">
                <span
                  className="text-text-primary max-w-[180px] truncate"
                  title={board}
                >
                  {board}
                </span>
                <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-text-dim">
                  inside
                </span>
                <span
                  className="text-text-secondary max-w-[150px] truncate"
                  title={parent}
                >
                  {parent}
                </span>
              </span>

              {/* EXIT — surfaces what double-click empty canvas / Escape do */}
              <button
                type="button"
                onClick={exit}
                title={`Exit to ${parent} (double-click canvas or Escape)`}
                aria-label={`Exit nested Board, back to ${parent}`}
                className="group flex items-center gap-1 h-6 pl-1.5 pr-2 rounded-full text-[10px] font-bold uppercase tracking-wider text-text-secondary hover:text-text-primary transition-colors cursor-pointer ml-0.5"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                <Icon
                  name="ChevronLeft"
                  size={13}
                  className="transition-transform group-hover:-translate-x-0.5"
                  aria-hidden
                />
                Exit
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
