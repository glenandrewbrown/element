import type { Meta, StoryObj } from "@storybook/react-vite";
import { PreferencesModal } from "./PreferencesModal";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";

// PreferencesModal reads audio/osc/canvas/midiMapping from useHostExtrasStore.
// Seed the store in each story's decorator so stories are fully self-contained.

const meta = {
  title: "Layout/PreferencesModal",
  component: PreferencesModal,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    onClose: { action: "closed" },
  },
} satisfies Meta<typeof PreferencesModal>;

export default meta;
type Story = StoryObj<typeof meta>;

// Fully populated: realistic audio devices, OSC enabled, snap grid, and MIDI maps.
export const Populated: Story = {
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
        canvas: { snapToGrid: true, gridSize: 16, viewport: { x: 0, y: 0, zoom: 1 }, graphBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } },
        midiMapping: {
          learning: false,
          maps: [
            { index: 0, deviceName: "Launchpad Pro", controlName: "Knob 1", nodeName: "Synth Lead", nodeId: "node-1", parameterIndex: 0, valid: true },
            { index: 1, deviceName: "Launchpad Pro", controlName: "Fader 2", nodeName: "Reverb Bus", nodeId: "node-2", parameterIndex: 1, valid: true },
            { index: 2, deviceName: "APC Mini", controlName: "CC 7", nodeName: "Compressor", nodeId: "node-3", parameterIndex: 3, valid: false },
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
};

// Empty state: no audio setup, no OSC, no MIDI maps.
export const Empty: Story = {
  decorators: [
    (Story) => {
      useHostExtrasStore.setState({
        audioSetup: null,
        oscHost: { enabled: false, port: 9001 },
        canvas: { snapToGrid: false, gridSize: 8, viewport: { x: 0, y: 0, zoom: 1 }, graphBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } },
        midiMapping: { learning: false, maps: [] },
        molecules: [],
        logLines: [],
        activeGraphOutline: [],
      });
      return <Story />;
    },
  ],
  args: { onClose: () => {} },
};

// MIDI learn active: the "Stop MIDI learn" button state.
export const MidiLearning: Story = {
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
        canvas: { snapToGrid: false, gridSize: 8, viewport: { x: 0, y: 0, zoom: 1 }, graphBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } },
        midiMapping: { learning: true, maps: [] },
        molecules: [],
        logLines: [],
        activeGraphOutline: [],
      });
      return <Story />;
    },
  ],
  args: { onClose: () => {} },
};
