import {
  type ReactNode,
  useCallback,
  useRef,
  useState,
  useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useAppStore,
  PANEL_SNAP_W,
  clampPanelWidth,
  resolveResponsivePanelLayout,
} from "../../stores/useAppStore";
import { usePerformStore, selectMapMode } from "../../stores/usePerformStore";
import { Breadcrumb } from "./Breadcrumb";
import { BlockTabStrip } from "./BlockTabStrip";
import { MirrorPanel } from "./MirrorPanel";
import { PanelRail, PANEL_RAIL_W } from "./PanelRail";

// ── Shared transition config ──

const EASE = [0.16, 1, 0.3, 1] as const;
const DURATION = 0.2;

const slideLeft = {
  initial: { x: -260, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: -260, opacity: 0 },
  transition: { ease: EASE, duration: DURATION },
};

const slideRight = {
  initial: { x: 280, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: 280, opacity: 0 },
  transition: { ease: EASE, duration: DURATION },
};

// ── Layout constants ──
//
// Panel widths are no longer hardcoded here — they come from the persisted
// store (`leftWidth`/`rightWidth`, defaulted to 260/280), so collapse state +
// widths survive reload and a future drag-resize can write them (Task 3.B /
// brief §4.4). The COLLAPSED width is the shared `PANEL_RAIL_W` (40px) so the
// canvas inset never drifts from what the rail actually renders.

const TOOLBAR_H = 40;
const COLLAPSED_W = PANEL_RAIL_W;
const BOTTOM_EDIT_H = 64;
const BOTTOM_PERFORM_H = 180;
const STATUS_H = 24;

// ── Drag-to-resize handle (Task 3.F / brief §4.1, §4.4, §4.5) ──
//
// A 5px hit-strip on a panel's INNER edge. The whole point is the painter/perf
// rule: dragging it must NOT re-render React per pointermove. So on pointerdown
// we capture the pointer and grab the live DOM nodes (the panel <aside> + the
// canvas <main>), and every pointermove writes their geometry DIRECTLY to
// `.style` — no setState, no Zustand write. The store is touched exactly once,
// on pointerup, via `setPanelWidth` (commit) or `togglePanel` (snap-collapse).
// Releasing clears the inline overrides so React/store state takes the geometry
// back over cleanly on the next render.
interface ResizeHandleProps {
  side: "left" | "right";
  /** The panel <aside> being resized (width is written here live). */
  asideRef: React.RefObject<HTMLElement | null>;
  /** The canvas <main> whose inset must track the panel edge live. */
  mainRef: React.RefObject<HTMLElement | null>;
  /** Commit the final clamped width on pointer-up. */
  onCommit: (width: number) => void;
  /** Collapse to the rail (sub-threshold drop). */
  onCollapse: () => void;
}

function ResizeHandle({
  side,
  asideRef,
  mainRef,
  onCommit,
  onCollapse,
}: ResizeHandleProps) {
  const isLeft = side === "left";
  // Per-drag scratch state — refs (not React state) so updating them never
  // schedules a render. `willSnap` + `liveW` are read back on pointerup to
  // decide collapse-vs-commit and WHICH width to commit. We read the committed
  // width from `liveW` (not the DOM) because pointerup clears the inline width
  // first, after which a getBoundingClientRect would report the stale React
  // prop width, not the dragged-to width.
  const drag = useRef<{
    startX: number;
    startW: number;
    willSnap: boolean;
    liveW: number;
  }>({ startX: 0, startW: 0, willSnap: false, liveW: 0 });

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const aside = asideRef.current;
      if (!aside) return;
      const dx = e.clientX - drag.current.startX;
      // Inner edge: dragging the LEFT panel's right edge rightwards widens it;
      // the RIGHT panel's left edge leftwards widens it (mirror the sign).
      const raw = drag.current.startW + (isLeft ? dx : -dx);
      const willSnap = raw < PANEL_SNAP_W;
      // Below the snap threshold we pin the live preview to the rail width so
      // the panel visibly parks at the rail (tldraw/Figma) rather than shrinking
      // into a sliver; above it we clamp to the sane open range.
      const liveW = willSnap ? COLLAPSED_W : clampPanelWidth(raw);
      drag.current.willSnap = willSnap;
      drag.current.liveW = liveW;
      // Direct DOM write — the perf-critical path. No React here.
      aside.style.width = `${liveW}px`;
      aside.dataset.willSnap = willSnap ? "true" : "false";
      const main = mainRef.current;
      if (main) main.style[isLeft ? "left" : "right"] = `${liveW}px`;
    },
    [asideRef, mainRef, isLeft],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      const aside = asideRef.current;
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      const { willSnap, liveW, startW } = drag.current;
      // Hand geometry back to React/store: clear the inline overrides we wrote
      // during the drag BEFORE the store update so there's no flash of the
      // stale committed width.
      if (aside) {
        aside.style.width = "";
        delete aside.dataset.willSnap;
      }
      const main = mainRef.current;
      if (main) {
        main.style[isLeft ? "left" : "right"] = "";
        main.style.transition = ""; // re-enable the CSS ease for open/snap
      }
      if (willSnap) {
        onCollapse();
      } else {
        // `liveW` is 0 only if no pointermove fired (a pure click) — keep the
        // existing width in that case rather than committing 0.
        onCommit(clampPanelWidth(liveW || startW));
      }
    },
    [asideRef, mainRef, isLeft, onCommit, onCollapse],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const aside = asideRef.current;
      if (!aside) return;
      drag.current = {
        startX: e.clientX,
        startW: aside.getBoundingClientRect().width,
        willSnap: false,
        liveW: 0,
      };
      // Kill the canvas inset's CSS ease for the drag — otherwise <main> lags
      // the panel edge by the 200ms transition. Restored on pointer-up so the
      // snap-collapse / open animation still eases.
      const main = mainRef.current;
      if (main) main.style.transition = "none";
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [asideRef, mainRef],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${isLeft ? "browser" : "inspector"} panel`}
      data-testid={`resize-handle-${side}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      // 5px hit-strip pinned to the inner edge, full height. `cursor-col-resize`
      // signals draggability; a faint accent line appears on hover (one-shot
      // transition-colors only — painter rule, no animated shadow/blur).
      className={[
        "absolute top-0 bottom-0 z-50 w-[5px] cursor-col-resize group",
        isLeft ? "right-[-2px]" : "left-[-2px]",
      ].join(" ")}
    >
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-transparent group-hover:bg-accent-blue/40 transition-colors" />
    </div>
  );
}

// ── Panel wrappers ──

interface PanelSlotProps {
  children: ReactNode;
  panelKey: string;
  width: number;
  asideRef?: React.RefObject<HTMLElement | null>;
  /** Optional inner-edge resize handle (Task 3.F). */
  handle?: ReactNode;
}

function LeftSlot({ children, panelKey, width, asideRef, handle }: PanelSlotProps) {
  return (
    <motion.aside
      key={panelKey}
      ref={asideRef as React.Ref<HTMLElement>}
      {...slideLeft}
      className="fixed left-0 z-40 bg-panel border-r border-white/5 flex flex-col shadow-[4px_0_12px_rgba(0,0,0,0.2)] overflow-visible"
      style={{ top: TOOLBAR_H, bottom: 0, width }}
    >
      <div className="flex-1 flex flex-col overflow-hidden">{children}</div>
      {handle}
    </motion.aside>
  );
}

function RightSlot({ children, panelKey, width, asideRef, handle }: PanelSlotProps) {
  return (
    <motion.aside
      key={panelKey}
      ref={asideRef as React.Ref<HTMLElement>}
      {...slideRight}
      className="fixed right-0 z-40 bg-panel border-l border-white/5 flex flex-col shadow-[-4px_0_12px_rgba(0,0,0,0.2)] overflow-visible"
      style={{ top: TOOLBAR_H, bottom: 0, width }}
    >
      <div className="flex-1 flex flex-col overflow-hidden">{children}</div>
      {handle}
    </motion.aside>
  );
}

function BottomSlot({
  children,
  panelKey,
  height,
}: {
  children: ReactNode;
  panelKey: string;
  height: number;
}) {
  return (
    <motion.footer
      key={panelKey}
      layout
      initial={{ y: height, opacity: 0 }}
      animate={{ y: 0, opacity: 1, height }}
      exit={{ y: height, opacity: 0 }}
      transition={{ ease: EASE, duration: DURATION }}
      className="fixed left-0 right-0 z-50 bg-panel border-t border-white/5 flex flex-col shadow-[0_-4px_12px_rgba(0,0,0,0.25)] overflow-hidden"
      style={{ bottom: STATUS_H }}
    >
      {children}
    </motion.footer>
  );
}

// ── Collapsed rail ──
//
// The blank 36px drag-handle `CollapsedRail` is GONE (brief §1.3) — both
// collapsed panels now render the shared `PanelRail` (40px Activity-Bar icon
// rail). A thin `RailDock` fixes that rail to the correct edge with the same
// geometry the old pill used.

function RailDock({
  side,
  children,
}: {
  side: "left" | "right";
  children: ReactNode;
}) {
  const isLeft = side === "left";
  return (
    <div
      className={`fixed z-40 ${isLeft ? "left-0" : "right-0"}`}
      style={{ top: TOOLBAR_H, bottom: 0, width: COLLAPSED_W }}
    >
      {children}
    </div>
  );
}

// ── Placeholder ──

function PlaceholderPanel({ label }: { label: string }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <span className="text-[10px] text-text-dim uppercase tracking-widest">
        {label}
      </span>
    </div>
  );
}

// ── AppShell ──

interface AppShellProps {
  toolbar?: ReactNode;
  editLeftPanel?: ReactNode;
  editRightPanel?: ReactNode;
  editBottomPanel?: ReactNode;
  performLeftPanel?: ReactNode;
  performRightPanel?: ReactNode;
  performBottomPanel?: ReactNode;
  statusBar?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  toolbar,
  editLeftPanel,
  editRightPanel,
  editBottomPanel,
  performLeftPanel,
  performRightPanel,
  performBottomPanel,
  statusBar,
  children,
}: AppShellProps) {
  const mode = useAppStore((s) => s.mode);
  const leftOpen = useAppStore((s) => s.leftPanelOpen);
  const rightOpenPersisted = useAppStore((s) => s.rightPanelOpen);
  const bottomOpen = useAppStore((s) => s.bottomPanelOpen);
  const leftWidthPersisted = useAppStore((s) => s.leftWidth);
  const rightWidthPersisted = useAppStore((s) => s.rightWidth);
  const togglePanel = useAppStore((s) => s.togglePanel);
  const requestFocusBrowserSearch = useAppStore(
    (s) => s.requestFocusBrowserSearch,
  );
  const setPanelWidth = useAppStore((s) => s.setPanelWidth);
  const mapMode = usePerformStore(selectMapMode);

  // Live DOM targets for the drag-resize handles — the handle writes width /
  // inset straight to these during pointermove (no React state per move; the
  // perf-critical painter rule). React/store own them again once a drag ends.
  const mainRef = useRef<HTMLElement>(null);
  const leftAsideRef = useRef<HTMLElement>(null);
  const rightAsideRef = useRef<HTMLElement>(null);

  const isEdit = mode === "edit";
  const bottomH = isEdit ? BOTTOM_EDIT_H : BOTTOM_PERFORM_H;

  // ── Responsive panel layout (BUG-2) ──
  // Track the live window width and derive EFFECTIVE rendered panel widths from
  // it (clamp-on-render — the persisted `leftWidth`/`rightWidth` are NEVER
  // overwritten, so a window-widen restores the user's chosen size). The right
  // Inspector auto-collapses below the threshold and re-opens automatically when
  // the window widens again — without touching the persisted open flag.
  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const responsive = resolveResponsivePanelLayout({
    windowWidth,
    leftOpen,
    rightOpen: rightOpenPersisted,
    leftWidth: leftWidthPersisted,
    rightWidth: rightWidthPersisted,
  });
  // Effective open state: the right panel renders as its rail when the window is
  // too narrow, regardless of the persisted flag (re-openable — the persisted
  // flag is untouched, so widening restores it).
  const rightOpen = rightOpenPersisted && !responsive.shouldCollapseRight;
  const leftWidth = responsive.leftWidth;
  const rightWidth = responsive.rightWidth;

  // Compute canvas insets — open panels use the effective (responsive) width,
  // collapsed panels reserve the shared rail width so the canvas never overlaps
  // the rail.
  const leftInset = leftOpen ? leftWidth : COLLAPSED_W;
  const rightInset = rightOpen ? rightWidth : COLLAPSED_W;
  const bottomInset = (bottomOpen ? bottomH : 0) + STATUS_H;

  // Re-expand handlers for the collapsed rails. The left rail ALSO focuses the
  // browser search on expand (search-first, brief §4.2) via the store nonce.
  const expandLeft = () => {
    togglePanel("left");
    requestFocusBrowserSearch();
  };
  // When the right panel is auto-collapsed (window too narrow) its persisted
  // open flag is still TRUE, so a plain `togglePanel` would flip it CLOSED. In
  // that state the rail's expand action instead forces a one-shot un-collapse
  // for THIS width by ignoring the responsive collapse until the user resizes:
  // we simply open the bottom-panel-free canvas by toggling only when the panel
  // is genuinely persisted-closed; if it's auto-collapsed we no-op (the user
  // must widen the window — the tooltip explains the threshold).
  const expandRight = () => {
    if (responsive.shouldCollapseRight && rightOpenPersisted) return;
    togglePanel("right");
  };

  // Resolve panel content by mode
  const leftContent = isEdit
    ? (editLeftPanel ?? <PlaceholderPanel label="Tool Palette" />)
    : (performLeftPanel ?? <PlaceholderPanel label="Quick Access" />);

  const rightContent = isEdit
    ? (editRightPanel ?? <PlaceholderPanel label="Inspector" />)
    : (performRightPanel ?? <PlaceholderPanel label="Live Health" />);

  const bottomContent = isEdit
    ? (editBottomPanel ?? <PlaceholderPanel label="Snippet Shelf" />)
    : (performBottomPanel ?? <PlaceholderPanel label="Macro Dashboard" />);

  return (
    <div className="w-full h-full overflow-hidden bg-canvas">
      {/* ── Toolbar ── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 bg-panel border-b border-white/5 shadow-[0_2px_4px_rgba(0,0,0,0.3)] flex items-center justify-between px-3"
        style={{ height: TOOLBAR_H }}
      >
        {toolbar ?? (
          <span className="text-[11px] text-text-dim uppercase tracking-widest">
            Toolbar
          </span>
        )}
      </header>

      {/* ── Left Panel ── */}
      <AnimatePresence mode="wait">
        {leftOpen ? (
          <LeftSlot
            key={`left-${mode}`}
            panelKey={`left-${mode}`}
            width={leftWidth}
            asideRef={leftAsideRef}
            handle={
              <ResizeHandle
                side="left"
                asideRef={leftAsideRef}
                mainRef={mainRef}
                onCommit={(w) => setPanelWidth("left", w)}
                onCollapse={() => togglePanel("left")}
              />
            }
          >
            {leftContent}
          </LeftSlot>
        ) : (
          <RailDock key="left-rail" side="left">
            <PanelRail
              side="left"
              expandIcon="Search"
              expandLabel="Expand browser"
              expandTitle="Expand browser (⌘1)"
              onExpand={expandLeft}
            />
          </RailDock>
        )}
      </AnimatePresence>

      {/* ── Right Panel ── */}
      <AnimatePresence mode="wait">
        {rightOpen ? (
          <RightSlot
            key={`right-${mode}`}
            panelKey={`right-${mode}`}
            width={rightWidth}
            asideRef={rightAsideRef}
            handle={
              <ResizeHandle
                side="right"
                asideRef={rightAsideRef}
                mainRef={mainRef}
                onCommit={(w) => setPanelWidth("right", w)}
                onCollapse={() => togglePanel("right")}
              />
            }
          >
            {rightContent}
          </RightSlot>
        ) : (
          <RailDock key="right-rail" side="right">
            <PanelRail
              side="right"
              expandIcon="SlidersHorizontal"
              expandLabel="Expand inspector"
              expandTitle="Expand inspector (⌘2)"
              onExpand={expandRight}
            />
          </RailDock>
        )}
      </AnimatePresence>

      {/* ── Bottom Panel ── */}
      <AnimatePresence mode="wait">
        {bottomOpen && (
          <BottomSlot
            key={`bottom-${mode}`}
            panelKey={`bottom-${mode}`}
            height={bottomH}
          >
            {bottomContent}
          </BottomSlot>
        )}
      </AnimatePresence>

      {/* ── Canvas (center fill) ── */}
      <main
        ref={mainRef}
        className="absolute overflow-hidden flex flex-col"
        style={{
          top: TOOLBAR_H,
          left: leftInset,
          right: rightInset,
          bottom: bottomInset,
          transition: `left ${DURATION}s cubic-bezier(${EASE.join(",")}), right ${DURATION}s cubic-bezier(${EASE.join(",")}), bottom ${DURATION}s cubic-bezier(${EASE.join(",")})`,
        }}
      >
        {isEdit && <Breadcrumb />}
        {isEdit && <BlockTabStrip />}
        <div
          className={[
            "flex-1 relative canvas-grid overflow-hidden",
            !isEdit && "perform-mode",
            !isEdit && mapMode && "map-mode-active",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {!isEdit && mapMode ? (
            <div className="map-mode-banner">
              MAP MODE — click parameter to assign macro
            </div>
          ) : null}
          {children}
        </div>
      </main>

      <div
        className="fixed left-0 right-0 bottom-0 z-50"
        style={{ height: STATUS_H }}
      >
        {statusBar}
      </div>

      {/* U11 — read-only Mirror of a peer Element instance. Self-hides when no
          mirror target is selected (renders nothing), and floats as a fixed
          right-side overlay so it never displaces the graph canvas. */}
      <MirrorPanel />
    </div>
  );
}
