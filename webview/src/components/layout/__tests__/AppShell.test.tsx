import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

const mockTogglePanel = vi.fn();
const mockRequestFocusBrowserSearch = vi.fn();

let appStoreState = {
  mode: "edit" as "edit" | "perform",
  leftPanelOpen: true,
  rightPanelOpen: true,
  bottomPanelOpen: true,
  leftWidth: 260,
  rightWidth: 280,
  togglePanel: mockTogglePanel,
  requestFocusBrowserSearch: mockRequestFocusBrowserSearch,
};
let mapMode = false;

vi.mock("../../../stores/useAppStore", () => ({
  useAppStore: vi.fn((sel: (s: unknown) => unknown) => sel(appStoreState)),
}));

vi.mock("../../../stores/usePerformStore", () => ({
  usePerformStore: vi.fn((sel: (s: unknown) => unknown) => sel({ mapMode })),
  selectMapMode: (s: { mapMode: boolean }) => s.mapMode,
}));

vi.mock("framer-motion", () => ({
  motion: {
    aside: ({ children, className, style, ...rest }: React.HTMLAttributes<HTMLElement>) => (
      <aside className={className} style={style} data-testid="motion-aside" {...rest}>
        {children}
      </aside>
    ),
    footer: ({ children, className, style, ...rest }: React.HTMLAttributes<HTMLElement>) => (
      <footer className={className} style={style} data-testid="motion-footer" {...rest}>
        {children}
      </footer>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../Breadcrumb", () => ({
  Breadcrumb: () => <div data-testid="breadcrumb" />,
}));

vi.mock("../BlockTabStrip", () => ({
  BlockTabStrip: () => <div data-testid="block-tab-strip" />,
}));

import { AppShell } from "../AppShell";

describe("AppShell — panel rendering (edit mode, all open)", () => {
  beforeEach(() => {
    appStoreState = {
      mode: "edit",
      leftPanelOpen: true,
      rightPanelOpen: true,
      bottomPanelOpen: true,
      leftWidth: 260,
      rightWidth: 280,
      togglePanel: mockTogglePanel,
      requestFocusBrowserSearch: mockRequestFocusBrowserSearch,
    };
    mapMode = false;
    vi.clearAllMocks();
  });

  it("renders children", () => {
    render(<AppShell><div data-testid="canvas" /></AppShell>);
    expect(screen.getByTestId("canvas")).toBeInTheDocument();
  });

  it("renders toolbar slot", () => {
    render(<AppShell toolbar={<span>MyToolbar</span>}><div /></AppShell>);
    expect(screen.getByText("MyToolbar")).toBeInTheDocument();
  });

  it("renders left panel content when leftPanelOpen", () => {
    render(
      <AppShell editLeftPanel={<div data-testid="left-panel" />}><div /></AppShell>
    );
    expect(screen.getByTestId("left-panel")).toBeInTheDocument();
  });

  it("renders right panel content when rightPanelOpen", () => {
    render(
      <AppShell editRightPanel={<div data-testid="right-panel" />}><div /></AppShell>
    );
    expect(screen.getByTestId("right-panel")).toBeInTheDocument();
  });

  it("renders bottom panel content when bottomPanelOpen", () => {
    render(
      <AppShell editBottomPanel={<div data-testid="bottom-panel" />}><div /></AppShell>
    );
    expect(screen.getByTestId("bottom-panel")).toBeInTheDocument();
  });

  it("renders Breadcrumb in edit mode", () => {
    render(<AppShell><div /></AppShell>);
    expect(screen.getByTestId("breadcrumb")).toBeInTheDocument();
  });

  it("renders BlockTabStrip in edit mode", () => {
    render(<AppShell><div /></AppShell>);
    expect(screen.getByTestId("block-tab-strip")).toBeInTheDocument();
  });
});

describe("AppShell — collapsed rails (unified PanelRail)", () => {
  beforeEach(() => {
    appStoreState = {
      mode: "edit",
      leftPanelOpen: false,
      rightPanelOpen: false,
      bottomPanelOpen: false,
      leftWidth: 260,
      rightWidth: 280,
      togglePanel: mockTogglePanel,
      requestFocusBrowserSearch: mockRequestFocusBrowserSearch,
    };
    mapMode = false;
    vi.clearAllMocks();
  });

  it("renders the left PanelRail (browser) when leftPanelOpen is false", () => {
    render(<AppShell><div /></AppShell>);
    expect(screen.getByLabelText("Expand browser")).toBeInTheDocument();
    expect(screen.getByTestId("panel-rail-left")).toBeInTheDocument();
  });

  it("clicking the left rail expand button calls togglePanel('left') AND focuses search", () => {
    render(<AppShell><div /></AppShell>);
    fireEvent.click(screen.getByLabelText("Expand browser"));
    expect(mockTogglePanel).toHaveBeenCalledWith("left");
    // Search-first: expanding the browser focuses its search (brief §4.2).
    expect(mockRequestFocusBrowserSearch).toHaveBeenCalled();
  });

  it("renders the right PanelRail (inspector) when rightPanelOpen is false", () => {
    render(<AppShell><div /></AppShell>);
    expect(screen.getByLabelText("Expand inspector")).toBeInTheDocument();
    expect(screen.getByTestId("panel-rail-right")).toBeInTheDocument();
  });

  it("clicking the right rail expand button calls togglePanel('right')", () => {
    render(<AppShell><div /></AppShell>);
    fireEvent.click(screen.getByLabelText("Expand inspector"));
    expect(mockTogglePanel).toHaveBeenCalledWith("right");
  });

  it("the blank drag-handle rail is gone (no generic 'Expand left/right panel' label)", () => {
    render(<AppShell><div /></AppShell>);
    expect(screen.queryByLabelText("Expand left panel")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Expand right panel")).not.toBeInTheDocument();
  });

  it("bottom panel not rendered when bottomPanelOpen is false", () => {
    render(<AppShell editBottomPanel={<div data-testid="bp" />}><div /></AppShell>);
    expect(screen.queryByTestId("bp")).not.toBeInTheDocument();
  });
});

describe("AppShell — perform mode", () => {
  beforeEach(() => {
    appStoreState = {
      mode: "perform",
      leftPanelOpen: true,
      rightPanelOpen: true,
      bottomPanelOpen: true,
      leftWidth: 260,
      rightWidth: 280,
      togglePanel: mockTogglePanel,
      requestFocusBrowserSearch: mockRequestFocusBrowserSearch,
    };
    mapMode = false;
    vi.clearAllMocks();
  });

  it("does not render Breadcrumb in perform mode", () => {
    render(<AppShell><div /></AppShell>);
    expect(screen.queryByTestId("breadcrumb")).not.toBeInTheDocument();
  });

  it("does not render BlockTabStrip in perform mode", () => {
    render(<AppShell><div /></AppShell>);
    expect(screen.queryByTestId("block-tab-strip")).not.toBeInTheDocument();
  });

  it("renders performLeftPanel content in perform mode", () => {
    render(
      <AppShell
        editLeftPanel={<div data-testid="edit-left" />}
        performLeftPanel={<div data-testid="perform-left" />}
      >
        <div />
      </AppShell>
    );
    expect(screen.getByTestId("perform-left")).toBeInTheDocument();
    expect(screen.queryByTestId("edit-left")).not.toBeInTheDocument();
  });

  it("renders placeholder when no performLeftPanel supplied", () => {
    render(<AppShell><div /></AppShell>);
    expect(screen.getByText(/Quick Access/i)).toBeInTheDocument();
  });
});

describe("AppShell — map mode banner", () => {
  beforeEach(() => {
    appStoreState = {
      mode: "perform",
      leftPanelOpen: true,
      rightPanelOpen: true,
      bottomPanelOpen: false,
      leftWidth: 260,
      rightWidth: 280,
      togglePanel: mockTogglePanel,
      requestFocusBrowserSearch: mockRequestFocusBrowserSearch,
    };
    mapMode = true;
    vi.clearAllMocks();
  });

  it("shows MAP MODE banner when mapMode is active in perform", () => {
    render(<AppShell><div /></AppShell>);
    expect(screen.getByText(/MAP MODE/)).toBeInTheDocument();
  });
});

describe("AppShell — default placeholder panels", () => {
  beforeEach(() => {
    appStoreState = {
      mode: "edit",
      leftPanelOpen: true,
      rightPanelOpen: true,
      bottomPanelOpen: true,
      leftWidth: 260,
      rightWidth: 280,
      togglePanel: mockTogglePanel,
      requestFocusBrowserSearch: mockRequestFocusBrowserSearch,
    };
    mapMode = false;
    vi.clearAllMocks();
  });

  it("shows Tool Palette placeholder when no editLeftPanel supplied", () => {
    render(<AppShell><div /></AppShell>);
    expect(screen.getByText(/Tool Palette/i)).toBeInTheDocument();
  });

  it("shows Inspector placeholder when no editRightPanel supplied", () => {
    render(<AppShell><div /></AppShell>);
    expect(screen.getByText(/Inspector/i)).toBeInTheDocument();
  });

  it("shows Snippet Shelf placeholder when no editBottomPanel supplied", () => {
    render(<AppShell><div /></AppShell>);
    expect(screen.getByText(/Snippet Shelf/i)).toBeInTheDocument();
  });
});
