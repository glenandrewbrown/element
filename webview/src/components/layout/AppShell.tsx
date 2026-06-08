import { type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "../../stores/useAppStore";
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

// ── Panel wrappers ──

interface PanelSlotProps {
  children: ReactNode;
  panelKey: string;
  width: number;
}

function LeftSlot({ children, panelKey, width }: PanelSlotProps) {
  return (
    <motion.aside
      key={panelKey}
      {...slideLeft}
      className="fixed left-0 z-40 bg-panel border-r border-white/5 flex flex-col shadow-[4px_0_12px_rgba(0,0,0,0.2)] overflow-hidden"
      style={{ top: TOOLBAR_H, bottom: 0, width }}
    >
      {children}
    </motion.aside>
  );
}

function RightSlot({ children, panelKey, width }: PanelSlotProps) {
  return (
    <motion.aside
      key={panelKey}
      {...slideRight}
      className="fixed right-0 z-40 bg-panel border-l border-white/5 flex flex-col shadow-[-4px_0_12px_rgba(0,0,0,0.2)] overflow-hidden"
      style={{ top: TOOLBAR_H, bottom: 0, width }}
    >
      {children}
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
  const rightOpen = useAppStore((s) => s.rightPanelOpen);
  const bottomOpen = useAppStore((s) => s.bottomPanelOpen);
  const leftWidth = useAppStore((s) => s.leftWidth);
  const rightWidth = useAppStore((s) => s.rightWidth);
  const togglePanel = useAppStore((s) => s.togglePanel);
  const requestFocusBrowserSearch = useAppStore(
    (s) => s.requestFocusBrowserSearch,
  );
  const mapMode = usePerformStore(selectMapMode);

  const isEdit = mode === "edit";
  const bottomH = isEdit ? BOTTOM_EDIT_H : BOTTOM_PERFORM_H;

  // Compute canvas insets — open panels use the persisted width, collapsed
  // panels reserve the shared rail width so the canvas never overlaps the rail.
  const leftInset = leftOpen ? leftWidth : COLLAPSED_W;
  const rightInset = rightOpen ? rightWidth : COLLAPSED_W;
  const bottomInset = (bottomOpen ? bottomH : 0) + STATUS_H;

  // Re-expand handlers for the collapsed rails. The left rail ALSO focuses the
  // browser search on expand (search-first, brief §4.2) via the store nonce.
  const expandLeft = () => {
    togglePanel("left");
    requestFocusBrowserSearch();
  };
  const expandRight = () => togglePanel("right");

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
