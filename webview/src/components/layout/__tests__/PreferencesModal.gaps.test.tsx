/**
 * PreferencesModal gaps — covers branches NOT exercised in PreferencesModal.test.tsx:
 *
 *   - Escape key calls onClose
 *   - Tab switching to MIDI / Appearance / Shortcuts
 *   - MIDI tab: empty maps placeholder, MIDI learn toggle label
 *   - MIDI tab: DisabledBadge shown for MIDI inputs/outputs
 *   - Appearance tab: renders cable routing toggle group
 *   - Appearance tab: clicking routing option calls toggleCableRouting
 *   - Appearance tab: DisabledBadge for density / font-scale / reduce-motion
 *   - Shortcuts tab: renders all section headings + kbd chips
 *   - Plugin scan: Scan/Rescan button disabled while scanning
 *   - Plugin scan: scanning indicator + current plugin text
 *   - Plugin scan: pluginCount display
 *   - Plugin scan: format toggle onChange
 *   - Plugin scan: add path expand + addError state
 *   - Plugin scan: submitAddPath error branch
 *   - ToggleRow disabled→DisabledBadge, enabled→switch rendered
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useHostExtrasStore } from "../../../stores/useHostExtrasStore";
import { useAppStore } from "../../../stores/useAppStore";
import { usePluginScanStore } from "../../../stores/usePluginScanStore";

// ── Bridge mocks ──────────────────────────────────────────────────────────────

vi.mock("../../../bridge/nativePrefs", () => ({
  nativeAudioApplySetup:    vi.fn().mockResolvedValue(undefined),
  nativeMappingRemoveMap:   vi.fn().mockResolvedValue(undefined),
  nativeMappingSetLearning: vi.fn().mockResolvedValue(undefined),
  nativeOpenGraphMixer:     vi.fn().mockResolvedValue(undefined),
  nativeOpenLuaConsole:     vi.fn().mockResolvedValue(undefined),
  nativeOscApplyHost:       vi.fn().mockResolvedValue(undefined),
  nativeWebDismissOverlay:  vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../bridge/nativeGraph", () => ({
  nativeGraphSetCanvasOptions: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

import { PreferencesModal } from "../PreferencesModal";

const BLANK_AUDIO_SETUP = {
  outputDeviceName: "Speakers",
  inputDeviceName:  "Mic",
  audioDeviceType:  "CoreAudio",
  sampleRate:       44100,
  bufferSize:       256,
  deviceTypes:      ["CoreAudio"],
  outputDevices:    ["Speakers"],
  inputDevices:     ["Mic"],
  sampleRates:      [44100, 48000],
  bufferSizes:      [128, 256],
};

const BLANK_HOST_EXTRAS = {
  audioSetup:   BLANK_AUDIO_SETUP,
  oscHost:      { enabled: false, port: 9001 },
  canvas:       { snapToGrid: false, gridSize: 8, viewport: { x:0,y:0,zoom:1 }, graphBounds: { minX:0,minY:0,maxX:0,maxY:0 } },
  midiMapping:  { learning: false, maps: [] },
  molecules:    [],
  logLines:     [],
  activeGraphOutline: [],
  // Store actions — present so the `as HostExtrasState` casts below are complete
  // (vitest-runtime tests never call these; tsc -b requires the full shape).
  hydrateFromSnapshot: vi.fn(),
  setLogLines:  vi.fn(),
};

const BLANK_SCAN_STATE = {
  scanning:      false,
  currentPlugin: "",
  pluginCount:   0,
  paths:         { VST3: [], AU: [], CLAP: [], LV2: [] } as Record<string, string[]>,
  enabled:       { VST3: true, AU: true, CLAP: true, LV2: true } as Record<string, boolean>,
  formats:       ["VST3", "AU", "CLAP", "LV2"] as string[],
  pathsLoaded:   true,
  refreshPaths:  vi.fn().mockResolvedValue(undefined),
  refreshStatus: vi.fn().mockResolvedValue(undefined),
  scan:          vi.fn().mockResolvedValue(undefined),
  rescan:        vi.fn().mockResolvedValue(undefined),
  addPath:       vi.fn().mockResolvedValue(true),
  removePath:    vi.fn().mockResolvedValue(undefined),
  setFormatEnabled: vi.fn().mockResolvedValue(undefined),
};

function resetStores(scanOverrides: Partial<typeof BLANK_SCAN_STATE> = {}) {
  useHostExtrasStore.setState(BLANK_HOST_EXTRAS as Parameters<typeof useHostExtrasStore.setState>[0]);
  usePluginScanStore.setState({
    ...BLANK_SCAN_STATE,
    ...scanOverrides,
  } as Parameters<typeof usePluginScanStore.setState>[0]);
}

function setupAppStore(cableRouting: "manhattan" | "bezier" = "manhattan") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAppStore.setState({ cableRouting, toggleCableRouting: vi.fn() } as any);
}

const ON_CLOSE = vi.fn();

function renderModal() {
  return render(<PreferencesModal onClose={ON_CLOSE} />);
}

beforeEach(() => {
  resetStores();
  setupAppStore();
  ON_CLOSE.mockClear();
});

afterEach(() => vi.clearAllMocks());

// ── Dismiss ───────────────────────────────────────────────────────────────────

describe("PreferencesModal — dismiss", () => {
  it("Escape key calls onClose", () => {
    renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(ON_CLOSE).toHaveBeenCalled();
  });

  it("Close button calls onClose", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /close preferences/i }));
    expect(ON_CLOSE).toHaveBeenCalled();
  });
});

// ── Tab switching ─────────────────────────────────────────────────────────────

describe("PreferencesModal — tab switching", () => {
  it("renders a tablist with 4 tabs", () => {
    renderModal();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /audio/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /midi/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /appearance/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /shortcuts/i })).toBeInTheDocument();
  });

  it("Audio tab is active by default", () => {
    renderModal();
    expect(screen.getByRole("tab", { name: /audio/i })).toHaveAttribute("aria-selected", "true");
  });

  it("clicking MIDI tab shows MIDI content", () => {
    renderModal();
    fireEvent.click(screen.getByRole("tab", { name: /midi/i }));
    expect(screen.getByRole("tab", { name: /midi/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/midi mapping/i)).toBeInTheDocument();
  });

  it("clicking Appearance tab shows Appearance content", () => {
    renderModal();
    fireEvent.click(screen.getByRole("tab", { name: /appearance/i }));
    expect(screen.getByRole("tab", { name: /appearance/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/cable routing/i)).toBeInTheDocument();
  });

  it("clicking Shortcuts tab shows Shortcuts content", () => {
    renderModal();
    fireEvent.click(screen.getByRole("tab", { name: /shortcuts/i }));
    expect(screen.getByRole("tab", { name: /shortcuts/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/key-command reference/i)).toBeInTheDocument();
  });
});

// ── MIDI tab ──────────────────────────────────────────────────────────────────

describe("PreferencesModal — MIDI tab", () => {
  beforeEach(() => {
    renderModal();
    fireEvent.click(screen.getByRole("tab", { name: /midi/i }));
  });

  it("shows 'No controller maps' placeholder when maps array is empty", () => {
    expect(screen.getByText(/no controller maps/i)).toBeInTheDocument();
  });

  it("shows 'MIDI learn' button when learning=false", () => {
    expect(screen.getByRole("button", { name: /^midi learn$/i })).toBeInTheDocument();
  });

  it("shows 'Stop MIDI learn' label when learning=true", () => {
    useHostExtrasStore.setState({
      ...BLANK_HOST_EXTRAS,
      midiMapping: { learning: true, maps: [] },
    } as Parameters<typeof useHostExtrasStore.setState>[0]);
    render(<PreferencesModal onClose={ON_CLOSE} />);
    fireEvent.click(screen.getAllByRole("tab", { name: /midi/i })[0]);
    expect(screen.getByRole("button", { name: /stop midi learn/i })).toBeInTheDocument();
  });

  it("shows 'Armed' description text while learning", () => {
    useHostExtrasStore.setState({
      ...BLANK_HOST_EXTRAS,
      midiMapping: { learning: true, maps: [] },
    } as Parameters<typeof useHostExtrasStore.setState>[0]);
    render(<PreferencesModal onClose={ON_CLOSE} />);
    fireEvent.click(screen.getAllByRole("tab", { name: /midi/i })[0]);
    expect(screen.getByText(/armed/i)).toBeInTheDocument();
  });

  it("shows DisabledBadge for MIDI inputs", () => {
    expect(screen.getByText(/midi inputs/i)).toBeInTheDocument();
    // DisabledBadge renders "Pending bridge" for unimplemented items
    const badges = screen.getAllByText(/pending bridge/i);
    expect(badges.length).toBeGreaterThanOrEqual(2); // inputs + outputs
  });

  it("shows DisabledBadge for MIDI outputs", () => {
    expect(screen.getByText(/midi outputs/i)).toBeInTheDocument();
  });

  it("maps table renders when maps exist", () => {
    useHostExtrasStore.setState({
      ...BLANK_HOST_EXTRAS,
      midiMapping: {
        learning: false,
        maps: [
          { index: 0, deviceName: "Novation", controlName: "Knob 1", nodeId: "n1", nodeName: "Reverb", parameterIndex: 0, valid: true },
        ],
      },
    } as Parameters<typeof useHostExtrasStore.setState>[0]);
    render(<PreferencesModal onClose={ON_CLOSE} />);
    fireEvent.click(screen.getAllByRole("tab", { name: /midi/i })[0]);
    expect(screen.getByText("Novation")).toBeInTheDocument();
    expect(screen.getByText("Knob 1")).toBeInTheDocument();
  });
});

// ── Appearance tab ────────────────────────────────────────────────────────────

describe("PreferencesModal — Appearance tab", () => {
  beforeEach(() => {
    renderModal();
    fireEvent.click(screen.getByRole("tab", { name: /appearance/i }));
  });

  it("renders Manhattan and Bezier routing buttons", () => {
    expect(screen.getByRole("button", { name: /manhattan/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /bezier/i })).toBeInTheDocument();
  });

  it("Manhattan button is aria-pressed=true when cableRouting='manhattan'", () => {
    setupAppStore("manhattan");
    render(<PreferencesModal onClose={ON_CLOSE} />);
    fireEvent.click(screen.getAllByRole("tab", { name: /appearance/i })[0]);
    const btn = screen.getAllByRole("button", { name: /manhattan/i })[0];
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("Bezier button is aria-pressed=true when cableRouting='bezier'", () => {
    setupAppStore("bezier");
    render(<PreferencesModal onClose={ON_CLOSE} />);
    fireEvent.click(screen.getAllByRole("tab", { name: /appearance/i })[0]);
    const btn = screen.getAllByRole("button", { name: /bezier/i })[0];
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking inactive routing option calls toggleCableRouting", () => {
    const toggleCableRouting = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useAppStore.setState({ cableRouting: "manhattan", toggleCableRouting } as any);
    render(<PreferencesModal onClose={ON_CLOSE} />);
    fireEvent.click(screen.getAllByRole("tab", { name: /appearance/i })[0]);
    // Clicking "bezier" when currently "manhattan" should call toggle
    fireEvent.click(screen.getAllByRole("button", { name: /bezier/i })[0]);
    expect(toggleCableRouting).toHaveBeenCalled();
  });

  it("clicking already-active routing option does NOT call toggleCableRouting", () => {
    const toggleCableRouting = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useAppStore.setState({ cableRouting: "manhattan", toggleCableRouting } as any);
    render(<PreferencesModal onClose={ON_CLOSE} />);
    fireEvent.click(screen.getAllByRole("tab", { name: /appearance/i })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /manhattan/i })[0]);
    expect(toggleCableRouting).not.toHaveBeenCalled();
  });

  it("shows 'Dark only' badge for colour scheme (not toggleable)", () => {
    expect(screen.getByText(/dark only/i)).toBeInTheDocument();
  });

  it("shows DisabledBadge for UI density", () => {
    expect(screen.getByText(/ui density/i)).toBeInTheDocument();
    // All disabled items show "Pending bridge"
    const badges = screen.getAllByText(/pending bridge/i);
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Shortcuts tab ─────────────────────────────────────────────────────────────

describe("PreferencesModal — Shortcuts tab", () => {
  beforeEach(() => {
    renderModal();
    fireEvent.click(screen.getByRole("tab", { name: /shortcuts/i }));
  });

  it("shows read-only reference notice", () => {
    expect(screen.getByText(/read-only key-command reference/i)).toBeInTheDocument();
  });

  it("renders section headings: Navigation, View, Blocks", () => {
    expect(screen.getByText("Navigation")).toBeInTheDocument();
    expect(screen.getByText("View")).toBeInTheDocument();
    expect(screen.getByText("Blocks")).toBeInTheDocument();
  });

  it("renders Cables and Alignment sections", () => {
    expect(screen.getByText("Cables")).toBeInTheDocument();
    expect(screen.getByText("Alignment")).toBeInTheDocument();
  });

  it("renders Bookmarks and Session sections", () => {
    expect(screen.getByText("Bookmarks")).toBeInTheDocument();
    expect(screen.getByText("Session")).toBeInTheDocument();
  });

  it("renders kbd elements for shortcut keys", () => {
    const kbds = document.querySelectorAll("kbd");
    expect(kbds.length).toBeGreaterThan(10);
  });

  it("renders 'Command palette' shortcut description", () => {
    expect(screen.getByText("Command palette")).toBeInTheDocument();
  });

  it("renders 'Fit graph to view' shortcut", () => {
    expect(screen.getByText("Fit graph to view")).toBeInTheDocument();
  });
});

// ── Plugin Scan section (Audio tab) ───────────────────────────────────────────

describe("PreferencesModal — Plugin Scan section", () => {
  it("renders Scan and Rescan buttons", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /^scan$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^rescan$/i })).toBeInTheDocument();
  });

  it("Scan and Rescan are disabled while scanning=true", () => {
    resetStores({ scanning: true });
    renderModal();
    expect(screen.getByRole("button", { name: /^scan$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^rescan$/i })).toBeDisabled();
  });

  it("shows spinner with 'Scanning…' text while scanning", () => {
    resetStores({ scanning: true, currentPlugin: "" });
    renderModal();
    expect(screen.getByText(/scanning…/i)).toBeInTheDocument();
  });

  it("shows current plugin name while scanning", () => {
    resetStores({ scanning: true, currentPlugin: "Surge XT.vst3" });
    renderModal();
    expect(screen.getByText(/surge xt\.vst3/i)).toBeInTheDocument();
  });

  it("shows plugin count when not scanning and count > 0", () => {
    resetStores({ scanning: false, pluginCount: 42 });
    renderModal();
    expect(screen.getByText(/42 plugins known/i)).toBeInTheDocument();
  });

  it("shows 'No plugins scanned yet' when count is 0 and not scanning", () => {
    resetStores({ scanning: false, pluginCount: 0 });
    renderModal();
    expect(screen.getByText(/no plugins scanned yet/i)).toBeInTheDocument();
  });

  it("renders format toggle rows for VST3, AU, CLAP, LV2", () => {
    renderModal();
    expect(screen.getByText("VST3")).toBeInTheDocument();
    expect(screen.getByText("AU")).toBeInTheDocument();
    expect(screen.getByText("CLAP")).toBeInTheDocument();
    expect(screen.getByText("LV2")).toBeInTheDocument();
  });

  it("format toggle switch renders for enabled format", () => {
    renderModal();
    // Each format row has a role=switch
    const switches = screen.getAllByRole("switch");
    expect(switches.length).toBeGreaterThanOrEqual(4);
  });

  it("format toggle switch is checked when format is enabled", () => {
    renderModal();
    const vst3Switch = screen.getAllByRole("switch")[0];
    expect(vst3Switch).toHaveAttribute("aria-checked", "true");
  });

  it("clicking a format switch calls setFormatEnabled", async () => {
    const setFormatEnabled = vi.fn().mockResolvedValue(undefined);
    resetStores({ setFormatEnabled });
    renderModal();
    const switches = screen.getAllByRole("switch");
    await act(async () => { fireEvent.click(switches[0]); });
    expect(setFormatEnabled).toHaveBeenCalled();
  });

  it("clicking Scan button calls scan()", async () => {
    const scan = vi.fn().mockResolvedValue(undefined);
    resetStores({ scan });
    renderModal();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^scan$/i }));
    });
    expect(scan).toHaveBeenCalled();
  });

  it("clicking Rescan button calls rescan()", async () => {
    const rescan = vi.fn().mockResolvedValue(undefined);
    resetStores({ rescan });
    renderModal();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^rescan$/i }));
    });
    expect(rescan).toHaveBeenCalled();
  });

  it("shows 'Default locations.' when no paths for a format", () => {
    resetStores({ paths: { VST3: [], AU: [], CLAP: [], LV2: [] } });
    renderModal();
    const defaults = screen.getAllByText(/default locations/i);
    expect(defaults.length).toBeGreaterThanOrEqual(1);
  });

  it("shows path entries when paths exist for a format", () => {
    resetStores({
      paths: { VST3: ["/Library/Audio/Plug-Ins/VST3"], AU: [], CLAP: [], LV2: [] },
    });
    renderModal();
    expect(screen.getByText("/Library/Audio/Plug-Ins/VST3")).toBeInTheDocument();
  });

  it("clicking Add for VST3 shows path input", () => {
    renderModal();
    // The first "Add" link in the scan section
    const addLinks = screen.getAllByRole("button", { name: /^add$/i });
    fireEvent.click(addLinks[0]);
    expect(screen.getByPlaceholderText(/absolute\/path/i)).toBeInTheDocument();
  });

  it("Escape key on path input closes the input without saving", () => {
    renderModal();
    const addLinks = screen.getAllByRole("button", { name: /^add$/i });
    fireEvent.click(addLinks[0]);
    const input = screen.getByPlaceholderText(/absolute\/path/i);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByPlaceholderText(/absolute\/path/i)).not.toBeInTheDocument();
  });

  it("successful addPath clears the input", async () => {
    const addPath = vi.fn().mockResolvedValue(true);
    resetStores({ addPath });
    renderModal();
    const addLinks = screen.getAllByRole("button", { name: /^add$/i });
    fireEvent.click(addLinks[0]);
    const input = screen.getByPlaceholderText(/absolute\/path/i);
    fireEvent.change(input, { target: { value: "/my/path" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/absolute\/path/i)).not.toBeInTheDocument(),
    );
  });

  it("failed addPath shows error message", async () => {
    const addPath = vi.fn().mockResolvedValue(false);
    resetStores({ addPath });
    renderModal();
    const addLinks = screen.getAllByRole("button", { name: /^add$/i });
    fireEvent.click(addLinks[0]);
    const input = screen.getByPlaceholderText(/absolute\/path/i);
    fireEvent.change(input, { target: { value: "/bad/path" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    await waitFor(() =>
      expect(screen.getByText(/not a directory/i)).toBeInTheDocument(),
    );
  });

  it("removePath called when X button clicked on a path", async () => {
    const removePath = vi.fn().mockResolvedValue(undefined);
    resetStores({
      paths: { VST3: ["/my/custom/path"], AU: [], CLAP: [], LV2: [] },
      removePath,
    });
    renderModal();
    const removeBtn = screen.getByRole("button", { name: /remove \/my\/custom\/path/i });
    await act(async () => { fireEvent.click(removeBtn); });
    expect(removePath).toHaveBeenCalledWith("VST3", "/my/custom/path");
  });
});

// ── Audio tab — developer tools ───────────────────────────────────────────────

describe("PreferencesModal — Audio tab developer tools", () => {
  it("renders Lua console button", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /lua console/i })).toBeInTheDocument();
  });

  it("renders Graph mixer button", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /graph mixer/i })).toBeInTheDocument();
  });

  it("renders Dismiss overlay button", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /dismiss overlay/i })).toBeInTheDocument();
  });
});
