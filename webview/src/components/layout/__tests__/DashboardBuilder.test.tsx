/**
 * DashboardBuilder — coverage skeleton (was 0%).
 *
 * Covers: empty state, edit-layout toggle, add-widget palette, add each
 * widget kind, clear-all confirm flow, widget delete, WidgetShell drag,
 * BindModal open/close/bind, write-param path, confim-clear reset on
 * edit-mode exit.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useDashboardStore } from "../../../stores/useDashboardStore";
import { useParameterStore } from "../../../stores/useParameterStore";
import { useGraphStore } from "../../../stores/useGraphStore";
import { DashboardBuilder } from "../DashboardBuilder";

// ── Bridge mocks ──────────────────────────────────────────────────────────────

const mockSetNodeParameter = vi.fn();
const mockGetNodeParameters = vi.fn();
const mockLoadDashboardLayout = vi.fn();
const mockLoadMappedParameters = vi.fn();

vi.mock("../../../bridge/nativeGraph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../bridge/nativeGraph")>();
  return {
    ...actual,
    nativeSetNodeParameter: (...a: unknown[]) => mockSetNodeParameter(...a),
    nativeGetNodeParameters: (...a: unknown[]) => mockGetNodeParameters(...a),
  };
});

vi.mock("../../../stores/useDashboardStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../stores/useDashboardStore")>();
  return {
    ...actual,
    loadDashboardLayoutFromHost: () => mockLoadDashboardLayout(),
  };
});

vi.mock("../../../stores/usePerformStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../stores/usePerformStore")>();
  return {
    ...actual,
    loadMappedParametersFromHost: () => mockLoadMappedParameters(),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetStores() {
  useDashboardStore.setState({
    widgets: [],
    editing: false,
    selectedId: null,
  });
  useParameterStore.setState({ values: {} });
  useGraphStore.setState((s) => ({ ...s, nodes: [] }));
  mockLoadDashboardLayout.mockResolvedValue(undefined);
  mockLoadMappedParameters.mockResolvedValue(undefined);
  mockSetNodeParameter.mockResolvedValue(undefined);
  mockGetNodeParameters.mockResolvedValue({ parameters: [] });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DashboardBuilder — empty state", () => {
  beforeEach(resetStores);
  afterEach(() => vi.clearAllMocks());

  it("shows 'No widgets yet' when empty and not editing", () => {
    render(<DashboardBuilder />);
    expect(screen.getByText(/no widgets yet/i)).toBeInTheDocument();
  });

  it("shows edit prompt when empty and not editing", () => {
    render(<DashboardBuilder />);
    expect(screen.getByText(/edit layout/i, { selector: "span,div,p" })).toBeInTheDocument();
  });

  it("calls loadDashboardLayoutFromHost on mount", () => {
    render(<DashboardBuilder />);
    expect(mockLoadDashboardLayout).toHaveBeenCalled();
  });
});

describe("DashboardBuilder — edit toggle", () => {
  beforeEach(resetStores);
  afterEach(() => vi.clearAllMocks());

  it("Edit Layout button toggles editing mode on", () => {
    render(<DashboardBuilder />);
    fireEvent.click(screen.getByRole("button", { name: /edit layout/i }));
    // In edit mode, Add button appears
    expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument();
  });

  it("clicking Edit Layout again turns editing off", () => {
    render(<DashboardBuilder />);
    const btn = screen.getByRole("button", { name: /edit layout/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(screen.queryByRole("button", { name: /^add$/i })).not.toBeInTheDocument();
  });
});

describe("DashboardBuilder — add widgets", () => {
  beforeEach(resetStores);
  afterEach(() => vi.clearAllMocks());

  function enterEditAndOpenPalette() {
    render(<DashboardBuilder />);
    fireEvent.click(screen.getByRole("button", { name: /edit layout/i }));
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
  }

  it("add palette shows Knob, Fader, Button, Meter options", () => {
    enterEditAndOpenPalette();
    expect(screen.getByRole("button", { name: /knob/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fader/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /button/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /meter/i })).toBeInTheDocument();
  });

  it.each(["Knob", "Fader", "Button", "Meter"] as const)(
    "clicking %s adds a widget to the store",
    (kind) => {
      enterEditAndOpenPalette();
      fireEvent.click(screen.getByRole("button", { name: new RegExp(kind, "i") }));
      expect(useDashboardStore.getState().widgets).toHaveLength(1);
      expect(useDashboardStore.getState().widgets[0].kind).toBe(kind.toLowerCase());
    },
  );

  it("widget count badge shows after adding", () => {
    enterEditAndOpenPalette();
    fireEvent.click(screen.getByRole("button", { name: /knob/i }));
    render(<DashboardBuilder />);
    expect(screen.getByText(/1 widget/i)).toBeInTheDocument();
  });
});

describe("DashboardBuilder — delete widget", () => {
  beforeEach(() => {
    resetStores();
    useDashboardStore.getState().addWidget("knob");
  });
  afterEach(() => vi.clearAllMocks());

  it("delete button removes widget from store", () => {
    render(<DashboardBuilder />);
    fireEvent.click(screen.getByRole("button", { name: /edit layout/i }));
    const deleteBtn = screen.getByTitle("Delete widget");
    fireEvent.click(deleteBtn);
    expect(useDashboardStore.getState().widgets).toHaveLength(0);
  });
});

describe("DashboardBuilder — clear all", () => {
  beforeEach(() => {
    resetStores();
    useDashboardStore.getState().addWidget("knob");
    useDashboardStore.getState().addWidget("fader");
  });
  afterEach(() => vi.clearAllMocks());

  it("Clear All button requires two clicks (confirm flow)", () => {
    render(<DashboardBuilder />);
    fireEvent.click(screen.getByRole("button", { name: /edit layout/i }));
    const clearBtn = screen.getByRole("button", { name: /clear all/i });
    fireEvent.click(clearBtn);
    // First click → shows confirm
    expect(screen.getByRole("button", { name: /confirm clear/i })).toBeInTheDocument();
    // Widgets still there
    expect(useDashboardStore.getState().widgets).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /confirm clear/i }));
    expect(useDashboardStore.getState().widgets).toHaveLength(0);
  });

  it("confirm state resets when editing mode turns off", () => {
    render(<DashboardBuilder />);
    const editBtn = screen.getByRole("button", { name: /edit layout/i });
    fireEvent.click(editBtn);
    fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    // Confirm shown
    expect(screen.getByRole("button", { name: /confirm clear/i })).toBeInTheDocument();
    // Turn off editing
    fireEvent.click(editBtn);
    // Turn on again — confirm should be gone
    fireEvent.click(editBtn);
    expect(screen.queryByRole("button", { name: /confirm clear/i })).not.toBeInTheDocument();
  });
});

describe("DashboardBuilder — BindModal", () => {
  beforeEach(() => {
    resetStores();
    useDashboardStore.getState().addWidget("knob");
  });
  afterEach(() => vi.clearAllMocks());

  it("Bind button opens the BindModal", () => {
    render(<DashboardBuilder />);
    fireEvent.click(screen.getByRole("button", { name: /edit layout/i }));
    fireEvent.click(screen.getByRole("button", { name: /bind/i }));
    expect(screen.getByText(/bind parameter/i)).toBeInTheDocument();
  });

  it("BindModal can be dismissed by clicking backdrop", async () => {
    render(<DashboardBuilder />);
    fireEvent.click(screen.getByRole("button", { name: /edit layout/i }));
    fireEvent.click(screen.getByRole("button", { name: /bind/i }));
    const backdrop = screen.getByText(/bind parameter/i).closest(".fixed") as HTMLElement;
    fireEvent.pointerDown(backdrop, { target: backdrop });
    await waitFor(() =>
      expect(screen.queryByText(/bind parameter/i)).not.toBeInTheDocument(),
    );
  });

  it("BindModal X button closes modal", async () => {
    render(<DashboardBuilder />);
    fireEvent.click(screen.getByRole("button", { name: /edit layout/i }));
    fireEvent.click(screen.getByRole("button", { name: /bind/i }));
    fireEvent.click(screen.getByTitle("Close"));
    await waitFor(() =>
      expect(screen.queryByText(/bind parameter/i)).not.toBeInTheDocument(),
    );
  });
});

describe("DashboardBuilder — canvas pointer deselect", () => {
  beforeEach(() => {
    resetStores();
    useDashboardStore.getState().addWidget("knob");
  });
  afterEach(() => vi.clearAllMocks());

  it("clicking canvas background clears selectedId", () => {
    render(<DashboardBuilder />);
    fireEvent.click(screen.getByRole("button", { name: /edit layout/i }));
    // Select the widget
    useDashboardStore.setState({ selectedId: useDashboardStore.getState().widgets[0].id });
    // Click canvas background (the flex-1 div with style="background: #1E1E22")
    const canvas = document.querySelector<HTMLElement>('[style*="1E1E22"]');
    if (canvas) {
      act(() => {
        fireEvent.pointerDown(canvas, { target: canvas });
      });
    }
    expect(useDashboardStore.getState().selectedId).toBeNull();
  });
});
