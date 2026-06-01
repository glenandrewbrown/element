import type { Meta, StoryObj } from "@storybook/react-vite";
import { PreferencesModal } from "./PreferencesModal";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import { useAppStore } from "../../stores/useAppStore";

// PreferencesModal reads from useHostExtrasStore (audio/osc/canvas/midiMapping)
// and useAppStore (cableRouting). Seed both stores in each story decorator so
// stories are fully self-contained.

const meta = {
  title: "Layout/PreferencesModal",
  component: PreferencesModal,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Tabbed Preferences modal — Audio / MIDI / Appearance / Shortcuts. " +
          "Audio: device + driver + sample-rate/buffer + OSC + canvas (all bridged via nativePrefs). " +
          "Plugin-scan/paths/format-toggles are honest-disabled with tooltips naming the missing bridge calls " +
          "(elementScanPlugins / elementGetPluginPaths / elementSetPluginFormatEnabled — Pillar-2 backlog). " +
          "MIDI: mapping table + MIDI-learn (bridged); per-device enable honest-disabled pending elementGetMidiInputs/Outputs. " +
          "Appearance: cable routing toggle (wired, persisted); theme/density/font-scale honest-disabled. " +
          "Shortcuts: read-only key-command list from useKeyboard.ts — full rebinding editor tracked as U9.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    onClose: { action: "closed" },
  },
} satisfies Meta<typeof PreferencesModal>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Fully-populated Audio tab ─────────────────────────────────────────────────

export const AudioPopulated: Story = {
  name: "Audio — Populated",
  decorators: [
    (Story) => {
      useHostExtrasStore.setState({
        audioSetup: {
          outputDeviceName: "Scarlett 2i2 USB",
          inputDeviceName: "Scarlett 2i2 USB",
          audioDeviceType: "CoreAudio",
          sampleRate: 48000,
          bufferSize: 256,
          deviceTypes: ["CoreAudio", "ASIO", "WASAPI"],
          outputDevices: ["Scarlett 2i2 USB", "Built-in Output", "Headphones"],
          inputDevices: ["Scarlett 2i2 USB", "Built-in Microphone"],
          sampleRates: [44100, 48000, 96000],
          bufferSizes: [64, 128, 256, 512, 1024],
        },
        oscHost: { enabled: true, port: 9001 },
        canvas: {
          snapToGrid: true,
          gridSize: 16,
          viewport: { x: 0, y: 0, zoom: 1 },
          graphBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        },
        midiMapping: { learning: false, maps: [] },
        molecules: [],
        logLines: [],
        activeGraphOutline: [],
      });
      return <Story />;
    },
  ],
  args: { onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "Audio tab with a fully populated hardware snapshot: Scarlett 2i2 as the selected interface, " +
          "CoreAudio driver, 48 kHz / 256-sample buffer, OSC enabled on port 9001, snap-grid on. " +
          "Plugin scan controls are honest-disabled (Pillar-2 bridge gap).",
      },
    },
  },
};

// ── Empty state (no hardware, first run) ─────────────────────────────────────

export const AudioEmpty: Story = {
  name: "Audio — Empty (first run)",
  decorators: [
    (Story) => {
      useHostExtrasStore.setState({
        audioSetup: null,
        oscHost: { enabled: false, port: 9001 },
        canvas: {
          snapToGrid: false,
          gridSize: 8,
          viewport: { x: 0, y: 0, zoom: 1 },
          graphBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        },
        midiMapping: { learning: false, maps: [] },
        molecules: [],
        logLines: [],
        activeGraphOutline: [],
      });
      return <Story />;
    },
  ],
  args: { onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "First-run / no-hardware state: audioSetup is null so selects fall back to empty option lists. " +
          "OSC is off; no MIDI maps. Exercises all empty-fallback paths.",
      },
    },
  },
};

// ── MIDI tab with maps and MIDI learn active ──────────────────────────────────

export const MidiLearning: Story = {
  name: "MIDI — Learning active",
  decorators: [
    (Story) => {
      useHostExtrasStore.setState({
        audioSetup: {
          outputDeviceName: "Default",
          inputDeviceName: "Default",
          audioDeviceType: "CoreAudio",
          sampleRate: 44100,
          bufferSize: 512,
          deviceTypes: ["CoreAudio"],
          outputDevices: ["Default"],
          inputDevices: ["Default"],
          sampleRates: [44100, 48000],
          bufferSizes: [256, 512],
        },
        oscHost: { enabled: false, port: 9001 },
        canvas: {
          snapToGrid: false,
          gridSize: 8,
          viewport: { x: 0, y: 0, zoom: 1 },
          graphBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        },
        midiMapping: {
          learning: true,
          maps: [
            {
              index: 0,
              deviceName: "Launchpad Pro",
              controlName: "Knob 1",
              nodeName: "Synth Lead",
              nodeId: "node-1",
              parameterIndex: 0,
              valid: true,
            },
            {
              index: 1,
              deviceName: "Launchpad Pro",
              controlName: "Fader 2",
              nodeName: "Reverb Bus",
              nodeId: "node-2",
              parameterIndex: 1,
              valid: true,
            },
            {
              index: 2,
              deviceName: "APC Mini",
              controlName: "CC 7",
              nodeName: "Compressor",
              nodeId: "node-3",
              parameterIndex: 3,
              valid: false,
            },
          ],
        },
        molecules: [],
        logLines: [],
        activeGraphOutline: [],
      });
      // Pre-select MIDI tab by overriding the default useState on mount
      return <Story />;
    },
  ],
  args: { onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "MIDI tab with learning armed (midiMapping.learning=true). Button shows the active orange 'Stop MIDI learn' state. " +
          "Mapping table shows two valid and one invalid (APC Mini CC 7) row — invalid rows are rendered at reduced opacity. " +
          "Note: the story opens on the Audio tab by default; navigate to MIDI to see this state.",
      },
    },
  },
};

// ── MIDI tab with populated map table, learn off ──────────────────────────────

export const MidiMapped: Story = {
  name: "MIDI — Mapped (learn off)",
  decorators: [
    (Story) => {
      useHostExtrasStore.setState({
        audioSetup: null,
        oscHost: { enabled: false, port: 9001 },
        canvas: {
          snapToGrid: false,
          gridSize: 8,
          viewport: { x: 0, y: 0, zoom: 1 },
          graphBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        },
        midiMapping: {
          learning: false,
          maps: [
            {
              index: 0,
              deviceName: "Launchpad Pro",
              controlName: "Knob 1",
              nodeName: "Synth Lead",
              nodeId: "node-1",
              parameterIndex: 0,
              valid: true,
            },
            {
              index: 1,
              deviceName: "Launchpad Pro",
              controlName: "Fader 2",
              nodeName: "Reverb Bus",
              nodeId: "node-2",
              parameterIndex: 1,
              valid: true,
            },
          ],
        },
        molecules: [],
        logLines: [],
        activeGraphOutline: [],
      });
      return <Story />;
    },
  ],
  args: { onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "MIDI tab at rest: two valid controller maps, learn not active. Navigate to the MIDI tab to review the mapping table.",
      },
    },
  },
};

// ── Appearance tab — bezier routing ──────────────────────────────────────────

export const AppearanceBezier: Story = {
  name: "Appearance — Bezier routing",
  decorators: [
    (Story) => {
      useHostExtrasStore.setState({
        audioSetup: null,
        oscHost: { enabled: false, port: 9001 },
        canvas: {
          snapToGrid: false,
          gridSize: 8,
          viewport: { x: 0, y: 0, zoom: 1 },
          graphBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        },
        midiMapping: { learning: false, maps: [] },
        molecules: [],
        logLines: [],
        activeGraphOutline: [],
      });
      // Set cable routing to bezier
      useAppStore.setState({ cableRouting: "bezier" });
      return <Story />;
    },
  ],
  args: { onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "Appearance tab with bezier cable routing selected. The segment button group shows Bezier highlighted. " +
          "Theme/density/font-scale controls are honest-disabled with Pillar-2 tooltips. Navigate to Appearance tab.",
      },
    },
  },
};

// ── Shortcuts tab ─────────────────────────────────────────────────────────────

export const ShortcutsReference: Story = {
  name: "Shortcuts — Reference list",
  decorators: [
    (Story) => {
      useHostExtrasStore.setState({
        audioSetup: null,
        oscHost: { enabled: false, port: 9001 },
        canvas: {
          snapToGrid: false,
          gridSize: 8,
          viewport: { x: 0, y: 0, zoom: 1 },
          graphBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        },
        midiMapping: { learning: false, maps: [] },
        molecules: [],
        logLines: [],
        activeGraphOutline: [],
      });
      return <Story />;
    },
  ],
  args: { onClose: () => {} },
  parameters: {
    docs: {
      description: {
        story:
          "Shortcuts tab showing the read-only key-command list derived from useKeyboard.ts. " +
          "Grouped by Navigation / View / Blocks / Cables / Alignment / Bookmarks / Session / UI. " +
          "Full rebinding editor (U9) is a follow-up task. Navigate to the Shortcuts tab.",
      },
    },
  },
};
