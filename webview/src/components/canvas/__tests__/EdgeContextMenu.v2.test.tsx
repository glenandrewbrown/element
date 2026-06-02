/**
 * EdgeContextMenu v2 — replaces quarantined tests whose labels were
 * stale (old "Make Wireless"/"Make Wired"/"Save" API).
 *
 * Current API:
 *   wired cable  → "Route through Bus…"
 *   cable on bus → "Rename Bus…" + "Remove from Bus"
 *   name entry   → "Confirm" / "Cancel" buttons, Escape closes
 *   disabled     → "Insert Bus Blocks…" (aria-disabled)
 *   danger       → "Delete Cable"
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNativeDisconnect = vi.fn().mockResolvedValue(undefined);
const mockNativeSetCableBus = vi.fn().mockResolvedValue(undefined);
const mockSetBusForCable = vi.fn();

const AUDIO_EDGE = {
  id: "edge-1",
  source: "node-A",
  sourcePort: "out-0",
  target: "node-B",
  targetPort: "in-0",
  signalType: "audio",
  channelCount: 2,
};

let edges: typeof AUDIO_EDGE[] = [AUDIO_EDGE];
let cableBus: Record<string, string> = {};

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({ edges, selectedNodeId: null }),
  ),
  selectEdges: (s: { edges: unknown[] }) => s.edges,
}));

vi.mock("../../../stores/useBusStore", () => ({
  useBusStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({ cableBus, setBusForCable: mockSetBusForCable }),
  ),
  deriveBuses: (_edges: unknown[], cb: Record<string, string>) => {
    const names = new Set(Object.values(cb));
    return [...names].map((name) => ({ name }));
  },
  suggestBusName: (existing: string[]) =>
    existing.length === 0 ? "Bus A" : `Bus ${String.fromCharCode(65 + existing.length)}`,
}));

vi.mock("../../../bridge/nativeGraph", () => ({
  nativeGraphDisconnect: (...a: unknown[]) => mockNativeDisconnect(...a),
  nativeGraphSetCableBus: (...a: unknown[]) => mockNativeSetCableBus(...a),
}));

vi.mock("../../neu", () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

import { EdgeContextMenu } from "../EdgeContextMenu";

const DEFAULT_PROPS = {
  edgeId: "edge-1",
  position: { x: 100, y: 100 },
  onClose: vi.fn(),
};

// ── Helper ────────────────────────────────────────────────────────────────────

function setup(props = DEFAULT_PROPS) {
  return render(<EdgeContextMenu {...props} />);
}

// ── Null guard ────────────────────────────────────────────────────────────────

describe("EdgeContextMenu — null guard", () => {
  beforeEach(() => { edges = []; cableBus = {}; vi.clearAllMocks(); });

  it("renders nothing when edgeId not found in store", () => {
    const { container } = setup();
    expect(container.firstChild).toBeNull();
  });
});

// ── Wired cable (no bus) ──────────────────────────────────────────────────────

describe("EdgeContextMenu — wired cable", () => {
  beforeEach(() => { edges = [AUDIO_EDGE]; cableBus = {}; vi.clearAllMocks(); });

  it("renders with role=menu and accessible label", () => {
    setup();
    expect(screen.getByRole("menu", { name: /cable menu/i })).toBeInTheDocument();
  });

  it("header shows 'Audio Cable' for audio signal type", () => {
    setup();
    expect(screen.getByText(/audio cable/i)).toBeInTheDocument();
  });

  it("header shows channel count badge", () => {
    setup();
    expect(screen.getByText("2ch")).toBeInTheDocument();
  });

  it("shows 'Route through Bus…' menu item", () => {
    setup();
    expect(screen.getByRole("menuitem", { name: /route through bus/i })).toBeInTheDocument();
  });

  it("shows disabled 'Insert Bus Blocks…' item", () => {
    setup();
    const disabled = screen.getByRole("menuitem", { name: /insert bus blocks/i });
    expect(disabled).toHaveAttribute("aria-disabled", "true");
  });

  it("shows 'Delete Cable' danger item", () => {
    setup();
    expect(screen.getByRole("menuitem", { name: /delete cable/i })).toBeInTheDocument();
  });

  it("clicking 'Delete Cable' calls nativeGraphDisconnect with correct args", () => {
    setup();
    fireEvent.click(screen.getByRole("menuitem", { name: /delete cable/i }));
    expect(mockNativeDisconnect).toHaveBeenCalledWith(
      "node-A",
      "out-0",
      "node-B",
      "in-0",
    );
  });

  it("clicking 'Delete Cable' calls onClose", () => {
    const onClose = vi.fn();
    render(<EdgeContextMenu {...DEFAULT_PROPS} onClose={onClose} />);
    fireEvent.click(screen.getByRole("menuitem", { name: /delete cable/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking 'Delete Cable' also clears bus map via setBusForCable", () => {
    setup();
    fireEvent.click(screen.getByRole("menuitem", { name: /delete cable/i }));
    expect(mockSetBusForCable).toHaveBeenCalledWith("edge-1", undefined);
  });
});

// ── Bus name entry (Route through Bus flow) ───────────────────────────────────

describe("EdgeContextMenu — Route through Bus flow", () => {
  beforeEach(() => { edges = [AUDIO_EDGE]; cableBus = {}; vi.clearAllMocks(); });

  it("clicking 'Route through Bus…' shows name input", () => {
    setup();
    fireEvent.click(screen.getByRole("menuitem", { name: /route through bus/i }));
    expect(screen.getByRole("textbox", { name: /bus name/i })).toBeInTheDocument();
  });

  it("input is pre-filled with suggested bus name 'Bus A' when no buses exist", () => {
    setup();
    fireEvent.click(screen.getByRole("menuitem", { name: /route through bus/i }));
    const input = screen.getByRole("textbox", { name: /bus name/i }) as HTMLInputElement;
    expect(input.value).toBe("Bus A");
  });

  it("shows 'Confirm' and 'Cancel' buttons in edit mode", () => {
    setup();
    fireEvent.click(screen.getByRole("menuitem", { name: /route through bus/i }));
    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("Confirm persists the bus name and closes", () => {
    const onClose = vi.fn();
    render(<EdgeContextMenu {...DEFAULT_PROPS} onClose={onClose} />);
    fireEvent.click(screen.getByRole("menuitem", { name: /route through bus/i }));
    const input = screen.getByRole("textbox", { name: /bus name/i });
    fireEvent.change(input, { target: { value: "Reverb Send" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(mockSetBusForCable).toHaveBeenCalledWith("edge-1", "Reverb Send");
    expect(mockNativeSetCableBus).toHaveBeenCalledWith("edge-1", "Reverb Send");
    expect(onClose).toHaveBeenCalled();
  });

  it("Enter key in input confirms the name", () => {
    const onClose = vi.fn();
    render(<EdgeContextMenu {...DEFAULT_PROPS} onClose={onClose} />);
    fireEvent.click(screen.getByRole("menuitem", { name: /route through bus/i }));
    const input = screen.getByRole("textbox", { name: /bus name/i });
    fireEvent.change(input, { target: { value: "My Bus" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockSetBusForCable).toHaveBeenCalledWith("edge-1", "My Bus");
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape from edit mode closes without saving", () => {
    const onClose = vi.fn();
    render(<EdgeContextMenu {...DEFAULT_PROPS} onClose={onClose} />);
    fireEvent.click(screen.getByRole("menuitem", { name: /route through bus/i }));
    const input = screen.getByRole("textbox", { name: /bus name/i });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(mockSetBusForCable).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("Cancel button closes without saving", () => {
    const onClose = vi.fn();
    render(<EdgeContextMenu {...DEFAULT_PROPS} onClose={onClose} />);
    fireEvent.click(screen.getByRole("menuitem", { name: /route through bus/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mockSetBusForCable).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("existing bus chips render when buses exist", () => {
    cableBus = { "other-edge": "Reverb Send" };
    setup();
    fireEvent.click(screen.getByRole("menuitem", { name: /route through bus/i }));
    expect(screen.getByRole("button", { name: "Reverb Send" })).toBeInTheDocument();
  });

  it("clicking a bus chip sets the input value", () => {
    cableBus = { "other-edge": "Chorus Bus" };
    setup();
    fireEvent.click(screen.getByRole("menuitem", { name: /route through bus/i }));
    fireEvent.click(screen.getByRole("button", { name: "Chorus Bus" }));
    const input = screen.getByRole("textbox", { name: /bus name/i }) as HTMLInputElement;
    expect(input.value).toBe("Chorus Bus");
  });

  it("empty name Confirm does not persist (trimmed to empty)", () => {
    const onClose = vi.fn();
    render(<EdgeContextMenu {...DEFAULT_PROPS} onClose={onClose} />);
    fireEvent.click(screen.getByRole("menuitem", { name: /route through bus/i }));
    const input = screen.getByRole("textbox", { name: /bus name/i });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(mockSetBusForCable).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

// ── Cable already on bus ──────────────────────────────────────────────────────

describe("EdgeContextMenu — cable on bus", () => {
  beforeEach(() => {
    edges = [AUDIO_EDGE];
    cableBus = { "edge-1": "Delay Send" };
    vi.clearAllMocks();
  });

  it("header shows 'Bus · Delay Send'", () => {
    setup();
    expect(screen.getByText(/bus · delay send/i)).toBeInTheDocument();
  });

  it("shows 'Rename Bus…' menu item", () => {
    setup();
    expect(screen.getByRole("menuitem", { name: /rename bus/i })).toBeInTheDocument();
  });

  it("shows 'Remove from Bus' menu item instead of Route through Bus", () => {
    setup();
    expect(screen.getByRole("menuitem", { name: /remove from bus/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /route through bus/i })).not.toBeInTheDocument();
  });

  it("'Remove from Bus' clears the bus and closes", () => {
    const onClose = vi.fn();
    render(<EdgeContextMenu {...DEFAULT_PROPS} onClose={onClose} />);
    fireEvent.click(screen.getByRole("menuitem", { name: /remove from bus/i }));
    expect(mockSetBusForCable).toHaveBeenCalledWith("edge-1", undefined);
    expect(onClose).toHaveBeenCalled();
  });

  it("'Rename Bus…' shows input pre-filled with current bus name", () => {
    setup();
    fireEvent.click(screen.getByRole("menuitem", { name: /rename bus/i }));
    const input = screen.getByRole("textbox", { name: /bus name/i }) as HTMLInputElement;
    expect(input.value).toBe("Delay Send");
  });

  it("Rename Bus heading says 'Rename Bus' not 'Route through Bus'", () => {
    setup();
    fireEvent.click(screen.getByRole("menuitem", { name: /rename bus/i }));
    expect(screen.getByText(/rename bus/i)).toBeInTheDocument();
  });
});

// ── Signal types ──────────────────────────────────────────────────────────────

describe("EdgeContextMenu — signal type labels", () => {
  beforeEach(() => { cableBus = {}; vi.clearAllMocks(); });

  it("MIDI edge shows 'MIDI Cable' header", () => {
    edges = [{ ...AUDIO_EDGE, signalType: "midi" }];
    setup();
    expect(screen.getByText(/midi cable/i)).toBeInTheDocument();
  });

  it("Value edge shows 'CV/Value Cable' header", () => {
    edges = [{ ...AUDIO_EDGE, signalType: "value" }];
    setup();
    expect(screen.getByText(/cv\/value cable/i)).toBeInTheDocument();
  });
});

// ── Escape / outside click ────────────────────────────────────────────────────

describe("EdgeContextMenu — dismiss", () => {
  beforeEach(() => { edges = [AUDIO_EDGE]; cableBus = {}; vi.clearAllMocks(); });

  it("Escape key calls onClose", () => {
    const onClose = vi.fn();
    render(<EdgeContextMenu {...DEFAULT_PROPS} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("mousedown outside the menu calls onClose", () => {
    const onClose = vi.fn();
    render(<EdgeContextMenu {...DEFAULT_PROPS} onClose={onClose} />);
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  it("mousedown inside the menu does NOT call onClose", () => {
    const onClose = vi.fn();
    render(<EdgeContextMenu {...DEFAULT_PROPS} onClose={onClose} />);
    const menu = screen.getByRole("menu");
    fireEvent.mouseDown(menu);
    expect(onClose).not.toHaveBeenCalled();
  });
});
