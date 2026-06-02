import type { Meta, StoryObj } from "@storybook/react-vite";
import { LiveHealth } from "./LiveHealth";
import { usePerformStore } from "../../stores/usePerformStore";
import type { AlertData } from "../../data/types";

// ── Store seeding ──
// LiveHealth reads usePerformStore(selectLiveHealth) for cpu/buffer/latency/
// outputPeak/inputPeak and usePerformStore(selectAlerts) for liveHealth.alerts.
// The native bridge no-ops without a JUCE backend, so seeding state is enough.
//
// `liveHealth` must always be seeded COMPLETE: selectLiveHealth returns the
// whole object and setState does a shallow merge, so a partial object would
// strip fields other consumers (e.g. bpm.toFixed) rely on.
//
// inputPeak (Q-VU-INPUT): now LIVE — fed by selectInputPeak from
// liveHealth.inputPeak (real device audio-input peak from onMasterLevels).
// Seed it non-zero to prove the INPUT ladder actually lights up in stories.

interface HealthSeed {
  cpu: number;
  buffer: number;
  latency: number;
  bpm: number;
  outputPeak: number;
  /** Audio-input peak 0–1 (Q-VU-INPUT). 0 = silent/no input device. */
  inputPeak: number;
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
      outputPeakL: h.outputPeak,
      outputPeakR: h.outputPeak,
      inputPeak: h.inputPeak,
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
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Read-only engine vitals panel: CPU load bar, input/output metering ladders, buffer size, latency, and any active alerts. Use it as a persistent monitor so the user can catch dropouts or runaway CPU mid-session. Reflects the live engine snapshot from the perform store; warning/critical alerts render inline.",
      },
    },
  },
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
        inputPeak: 0.31,
        ioActivity: "nominal",
        alerts: [],
      });
      return <Story />;
    },
  ],
  render: () => framed,
  parameters: {
    docs: {
      description: {
        story:
          "Healthy session: low CPU, mid-level output meter, modest input peak (real device mic/line input via Q-VU-INPUT), no alerts — the all-clear state the user expects most of the time.",
      },
    },
  },
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
        inputPeak: 0.58,
        ioActivity: "warning",
        alerts: [warningAlert],
      });
      return <Story />;
    },
  ],
  render: () => framed,
  parameters: {
    docs: {
      description: {
        story:
          "Elevated CPU with one warning alert (heavy reverb) and a hot input signal — shows both meters active and the inline alert card so the user can act before dropout.",
      },
    },
  },
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
        inputPeak: 0.91,
        ioActivity: "critical",
        alerts: [criticalAlert, warningAlert],
      });
      return <Story />;
    },
  ],
  render: () => framed,
  parameters: {
    docs: {
      description: {
        story:
          "Near-overload: CPU at 96%, output peaking, input near-full, and multiple stacked alerts including a buffer underrun — the worst-case state the panel must surface clearly.",
      },
    },
  },
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
        inputPeak: 0,
        ioActivity: "nominal",
        alerts: [],
      });
      return <Story />;
    },
  ],
  render: () => framed,
  parameters: {
    docs: {
      description: {
        story:
          "Engine idle / no data: zeroed CPU, flat input and output meters — how the panel reads before audio is running. Both meters are honest (0 = silence, not n/a).",
      },
    },
  },
};

/**
 * InputActive — proves the INPUT ladder lights up from the real selector.
 * Simulates a live mic/line input with a quiet output (e.g. monitoring only).
 * Input peak #4A90D9 (audio blue per design system); output nearly silent.
 */
export const InputActive: Story = {
  decorators: [
    (Story) => {
      seed({
        cpu: 12,
        buffer: 256,
        latency: 5,
        bpm: 120,
        outputPeak: 0.04,
        inputPeak: 0.68,
        ioActivity: "nominal",
        alerts: [],
      });
      return <Story />;
    },
  ],
  render: () => framed,
  parameters: {
    docs: {
      description: {
        story:
          "Live input active (Q-VU-INPUT, selectInputPeak = 0.68) with near-silent output — proves the INPUT ladder lights up from the real selector in audio-signal blue (#4A90D9). Typical when monitoring a mic before a take.",
      },
    },
  },
};
