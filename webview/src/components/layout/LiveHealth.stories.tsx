import type { Meta, StoryObj } from "@storybook/react-vite";
import { LiveHealth } from "./LiveHealth";
import { usePerformStore } from "../../stores/usePerformStore";
import type { AlertData } from "../../data/types";

// ── Store seeding ──
// LiveHealth reads usePerformStore(selectLiveHealth) for cpu/buffer/latency/
// outputPeak and usePerformStore(selectAlerts) for liveHealth.alerts. The
// native bridge no-ops without a JUCE backend, so seeding state is enough.
//
// `liveHealth` must always be seeded COMPLETE: selectLiveHealth returns the
// whole object and setState does a shallow merge, so a partial object would
// strip fields other consumers (e.g. MacroDashboard's bpm.toFixed) rely on.
//
// DEVIATION NOTE: `ioActivity` is part of the LiveHealth shape but LiveHealth.tsx
// never renders it (the INPUT meter is hardcoded dimmed/"n/a" per Q-VU-INPUT).
// We still seed it to match the documented health contract; visible variation
// is driven by cpu / outputPeak / buffer / latency / alerts.

interface HealthSeed {
  cpu: number;
  buffer: number;
  latency: number;
  bpm: number;
  outputPeak: number;
  ioActivity: "nominal" | "warning" | "critical";
  alerts: AlertData[];
}

function seed(h: HealthSeed): void {
  usePerformStore.setState({
    liveHealth: {
      cpu: h.cpu,
      buffer: h.buffer,
      latency: h.latency,
      clock: "Internal",
      bpm: h.bpm,
      timecode: "00:01:24:11",
      sampleRateLabel: "48.0 kHz",
      alerts: h.alerts,
      ioActivity: h.ioActivity,
      outputPeak: h.outputPeak,
    },
  });
}

const warningAlert: AlertData = {
  id: "a1",
  severity: "warning",
  title: "High CPU on Reverb",
  message: "ValhallaRoom is using 38% of one core.",
};

const criticalAlert: AlertData = {
  id: "a2",
  severity: "error",
  title: "Buffer underrun",
  message: "Audio dropout detected — increase buffer size.",
};

const meta = {
  title: "Layout/LiveHealth",
  component: LiveHealth,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LiveHealth>;

export default meta;
type Story = StoryObj<typeof meta>;

const framed = (
  <div style={{ height: 520, width: 280 }} className="bg-panel">
    <LiveHealth />
  </div>
);

export const Nominal: Story = {
  decorators: [
    (Story) => {
      seed({
        cpu: 18,
        buffer: 256,
        latency: 5,
        bpm: 120,
        outputPeak: 0.45,
        ioActivity: "nominal",
        alerts: [],
      });
      return <Story />;
    },
  ],
  render: () => framed,
};

export const Warning: Story = {
  decorators: [
    (Story) => {
      seed({
        cpu: 64,
        buffer: 256,
        latency: 9,
        bpm: 124,
        outputPeak: 0.72,
        ioActivity: "warning",
        alerts: [warningAlert],
      });
      return <Story />;
    },
  ],
  render: () => framed,
};

export const Critical: Story = {
  decorators: [
    (Story) => {
      seed({
        cpu: 96,
        buffer: 128,
        latency: 21,
        bpm: 140,
        outputPeak: 0.98,
        ioActivity: "critical",
        alerts: [criticalAlert, warningAlert],
      });
      return <Story />;
    },
  ],
  render: () => framed,
};

export const Empty: Story = {
  decorators: [
    (Story) => {
      seed({
        cpu: 0,
        buffer: 0,
        latency: 0,
        bpm: 120,
        outputPeak: 0,
        ioActivity: "nominal",
        alerts: [],
      });
      return <Story />;
    },
  ],
  render: () => framed,
};
