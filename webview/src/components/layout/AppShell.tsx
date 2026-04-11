import { type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "../../stores/useAppStore";
import { Breadcrumb } from "./Breadcrumb";
import { BlockTabStrip } from "./BlockTabStrip";

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

const TOOLBAR_H = 40;
const LEFT_W = 260;
const LEFT_COLLAPSED_W = 36;
const RIGHT_W = 280;
const RIGHT_COLLAPSED_W = 36;
const BOTTOM_EDIT_H = 64;
const BOTTOM_PERFORM_H = 180;

// ── Panel wrappers ──

interface PanelSlotProps {
  children: ReactNode;
  panelKey: string;
}

function LeftSlot({ children, panelKey }: PanelSlotProps) {
  return (
    <motion.aside
      key={panelKey}
      {...slideLeft}
      className="fixed left-0 z-40 bg-panel border-r border-white/5 flex flex-col shadow-[4px_0_12px_rgba(0,0,0,0.2)] overflow-hidden"
      style={{ top: TOOLBAR_H, bottom: 0, width: LEFT_W }}
    >
      {children}
    </motion.aside>
  );
}

function RightSlot({ children, panelKey }: PanelSlotProps) {
  return (
    <motion.aside
      key={panelKey}
      {...slideRight}
      className="fixed right-0 z-40 bg-panel border-l border-white/5 flex flex-col shadow-[-4px_0_12px_rgba(0,0,0,0.2)] overflow-hidden"
      style={{ top: TOOLBAR_H, bottom: 0, width: RIGHT_W }}
    >
      {children}
    </motion.aside>
  );
}

function BottomSlot({
  children,
  panelKey,
  height,
}: PanelSlotProps & { height: number }) {
  return (
    <motion.footer
      key={panelKey}
      layout
      initial={{ y: height, opacity: 0 }}
      animate={{ y: 0, opacity: 1, height }}
      exit={{ y: height, opacity: 0 }}
      transition={{ ease: EASE, duration: DURATION }}
      className="fixed bottom-0 left-0 right-0 z-50 bg-panel border-t border-white/5 flex flex-col shadow-[0_-4px_12px_rgba(0,0,0,0.25)] overflow-hidden"
    >
      {children}
    </motion.footer>
  );
}

// ── Collapsed rail ──

function CollapsedRail({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  const isLeft = side === "left";
  return (
    <div
      className={[
        "fixed z-40 bg-panel flex flex-col items-center pt-3 cursor-pointer",
        isLeft
          ? "left-0 border-r border-white/5"
          : "right-0 border-l border-white/5",
      ].join(" ")}
      style={{
        top: TOOLBAR_H,
        bottom: 0,
        width: isLeft ? LEFT_COLLAPSED_W : RIGHT_COLLAPSED_W,
      }}
      onClick={onClick}
    >
      <div className="w-1 h-8 rounded-full bg-text-dim/30 hover:bg-text-secondary/50 transition-colors" />
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
  statusBar?: ReactNode;
  editLeftPanel?: ReactNode;
  editRightPanel?: ReactNode;
  editBottomPanel?: ReactNode;
  performLeftPanel?: ReactNode;
  performRightPanel?: ReactNode;
  performBottomPanel?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  toolbar,
  statusBar,
  editLeftPanel,
  editRightPanel,
  editBottomPanel,
  performLeftPanel,
  performRightPanel,
  performBottomPanel,
  children,
}: AppShellProps) {
  const mode = useAppStore((s) => s.mode);
  const leftOpen = useAppStore((s) => s.leftPanelOpen);
  const rightOpen = useAppStore((s) => s.rightPanelOpen);
  const bottomOpen = useAppStore((s) => s.bottomPanelOpen);
  const togglePanel = useAppStore((s) => s.togglePanel);

  const isEdit = mode === "edit";
  const bottomH = isEdit ? BOTTOM_EDIT_H : BOTTOM_PERFORM_H;

  // Compute canvas insets
  const leftInset = leftOpen ? LEFT_W : LEFT_COLLAPSED_W;
  const rightInset = rightOpen ? RIGHT_W : RIGHT_COLLAPSED_W;
  const bottomInset = bottomOpen ? bottomH : 0;

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
          <LeftSlot key={`left-${mode}`} panelKey={`left-${mode}`}>
            {leftContent}
          </LeftSlot>
        ) : (
          <CollapsedRail
            key="left-rail"
            side="left"
            onClick={() => togglePanel("left")}
          />
        )}
      </AnimatePresence>

      {/* ── Right Panel ── */}
      <AnimatePresence mode="wait">
        {rightOpen ? (
          <RightSlot key={`right-${mode}`} panelKey={`right-${mode}`}>
            {rightContent}
          </RightSlot>
        ) : (
          <CollapsedRail
            key="right-rail"
            side="right"
            onClick={() => togglePanel("right")}
          />
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

      {/* ── Status Bar ── */}
      {statusBar && (
        <div
          className="fixed left-0 right-0 z-40"
          style={{ bottom: bottomOpen ? bottomH : 0 }}
        >
          {statusBar}
        </div>
      )}

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
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
