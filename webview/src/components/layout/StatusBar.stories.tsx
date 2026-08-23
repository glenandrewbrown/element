import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusBar } from "./StatusBar";
import { usePerformStore } from "../../stores/usePerformStore";
import { useEngineSnapshotStore } from "../../stores/useEngineSnapshotStore";

// StatusBar reads liveHealth from usePerformStore and engineRunning from
// useEngineSnapshotStore. Seed both in each story's decorator.

const meta = {
  title: "Layout/StatusBar",
  component: StatusBar,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Slim 24px global footer: audio device, engine RUNNING/STOPPED, sample rate, buffer, latency, severity-coloured CPU, and transport timecode. Reads liveHealth from usePerformStore and engineRunning from useEngineSnapshotStore (falling back to isPlaying); seed both per story. Known issue F-04: the SAMPLE field can render the version string instead of the sample rate — not fixed here.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof StatusBar>;

export default meta;
type Story = StoryObj<typeof meta>;

function seedHealth(overrides: {
  engineRunning?: boolean;
  isPlaying?: boolean;
  cpu?: number;
  buffer?: number;
  latency?: number;
  clock?: string;
  sampleRateLabel?: string;
  timecode?: string;
}) {
  useEngineSnapshotStore.setState((s) => ({
    ...s,
    engineRunning: overrides.engineRunning ?? false,
    hasHostData: overrides.engineRunning ?? false,
  }));
  usePerformStore.setState((s) => ({
    ...s,
    isPlaying: overrides.isPlaying ?? false,
    liveHealth: {
      ...s.liveHealth,
      cpu: overrides.cpu ?? 0,
      buffer: overrides.buffer ?? 0,
      latency: overrides.latency ?? 0,
      clock: overrides.clock ?? "—",
      sampleRateLabel: overrides.sampleRateLabel ?? "—",
      timecode: overrides.timecode ?? "",
      bpm: 120,
      outputPeak: 0,
      alerts: [],
      ioActivity: "nominal",
    },
  }));
}

// Primary: engine running with realistic device info and healthy CPU.
export const Running: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Healthy live state — engine running, 48kHz/256, low latency, sub-50% CPU (logic green). The bar's normal on-stage appearance.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedHealth({
        engineRunning: true,
        cpu: 23.4,
        buffer: 256,
        latency: 5.3,
        clock: "Scarlett 2i2 USB",
        sampleRateLabel: "48.0 kHz",
        timecode: "00:01:32:14",
      });
      return <Story />;
    },
  ],
};

// Stopped: engine not running, all fields at defaults.
export const Stopped: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Engine idle with no host data: STOPPED indicator and em-dash fallbacks for device/rate/buffer/latency — what the bar shows before audio is open.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedHealth({ engineRunning: false });
      return <Story />;
    },
  ],
};

// High CPU: > 80% triggers text-error colouring.
export const HighCpu: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "CPU above 80% — the percentage turns error-red, the dropout-risk warning threshold.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedHealth({
        engineRunning: true,
        cpu: 87.6,
        buffer: 128,
        latency: 2.7,
        clock: "Built-in Output",
        sampleRateLabel: "44.1 kHz",
        timecode: "00:04:11:00",
      });
      return <Story />;
    },
  ],
};

// Medium CPU: 51–80% triggers text-modifier colouring.
export const MediumCpu: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "CPU in the 51–80% band — the percentage turns modifier-orange, the mid-severity caution between green and red.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedHealth({
        engineRunning: true,
        cpu: 62.0,
        buffer: 512,
        latency: 10.6,
        clock: "Focusrite USB",
        sampleRateLabel: "96.0 kHz",
        timecode: "00:00:45:00",
      });
      return <Story />;
    },
  ],
};

// isPlaying fallback (BUG-014): engineRunning=false but isPlaying=true
// should still show RUNNING to match Perform header behaviour.
export const IsPlayingFallback: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Regression guard (BUG-014): snapshot engineRunning=false but the perform store reports isPlaying=true, so the bar must still read RUNNING to stay consistent with the Perform header.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedHealth({
        engineRunning: false,
        isPlaying: true,
        cpu: 15.0,
        buffer: 256,
        latency: 5.3,
        clock: "CoreAudio Default",
        sampleRateLabel: "44.1 kHz",
        timecode: "00:00:12:00",
      });
      return <Story />;
    },
  ],
};

// Default device: clock="—" shows "Default Device" fallback.
export const DefaultDevice: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Engine running but no named clock (clock='—'): verifies the 'Default Device' label fallback.",
      },
    },
  },
  decorators: [
    (Story) => {
      seedHealth({
        engineRunning: true,
        cpu: 5.2,
        buffer: 512,
        latency: 11.6,
        clock: "—",
        sampleRateLabel: "48.0 kHz",
        timecode: "00:00:00:00",
      });
      return <Story />;
    },
  ],
};
