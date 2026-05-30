import type { Meta, StoryObj } from "@storybook/react-vite";
import { LiveHealth } from "./LiveHealth";
import { usePerformStore } from "../../stores/usePerformStore";
import type { AlertData } from "../../data/types";

// ── Store seeding ──
// LiveHealth reads usePerformStore(selectLiveHealth) for cpu/buffer/latency/
// outputPeak/sampleRateLabel/bpm and usePerformStore(selectAlerts) for alerts.
// `liveHealth` must always be seeded COMPLETE: selectLiveHealth returns the
// whole object and setState does a shallow merge, so a partial object would
// strip fields other consumers (e.g. MacroDashboard's bpm.toFixed) rely on.
//
// G-08 I/O activity design notes:
//   • buffer === 0  → "Engine idle" state  (no device active / not started)
//   • buffer  >  0  → I/O rows shown       (audio-out meter + honest no-data for others)
// Use buffer: 256+ in non-Empty stories to exercise the live I/O rows.

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
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Perform-mode engine vitals panel (G-08 redesign). Shows per-signal-type I/O rows " +
          "(Audio OUT with live VU bar / Audio IN awaiting bridge / MIDI and Value with honest '—') " +
          "plus CPU load, buffer, latency, BPM, and alerts. When buffer === 0 an explicit " +
          "'Engine idle' state replaces the I/O rows so the user is never misled by a flat-but-live meter.",
      },
    },
    // Design reference: locked neumorphic palette + G-08 I/O detail spec
    design: {
      type: "link",
      url: "docs/ELEMENT_UNIFIED_BLUEPRINT.md#g-08-livehealth-io-detail",
    },
  },
  tags: ["gate-ab"],
} satisfies Meta<typeof LiveHealth>;

export default meta;
type Story = StoryObj<typeof meta>;

const framed = (
  <div style={{ height: 520, width: 280 }} className="bg-panel">
    <LiveHealth />
  </div>
);

// ── Helper: assert element exists, throw with clear message on failure ──
function assertExists(el: Element | null, label: string): void {
  if (!el) throw new Error(`Assertion failed: '${label}' not found in DOM`);
}

// ── Nominal — healthy session ──

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
  parameters: {
    docs: {
      description: {
        story:
          "Healthy session: 18% CPU, 256 smp buffer, mid-level Audio OUT meter, " +
          "honest no-data labels on Audio IN / MIDI / Value rows.",
      },
    },
    design: {
      type: "link",
      url: "docs/ELEMENT_UNIFIED_BLUEPRINT.md#g-08-livehealth-io-detail",
    },
  },
  play: async ({ canvasElement }) => {
    // Assert: distinct Audio OUT row (has live meter)
    assertExists(
      canvasElement.querySelector('[data-testid="io-row-audio-out"]'),
      "io-row-audio-out — distinct output row",
    );
    // Assert: distinct Audio IN row (honest no-data)
    assertExists(
      canvasElement.querySelector('[data-testid="io-row-audio-in"]'),
      "io-row-audio-in — distinct input row",
    );
    // Assert: signal-type marker present (Audio ●)
    assertExists(
      canvasElement.querySelector('[data-testid="signal-type-audio"]'),
      "signal-type-audio — taxonomy type marker",
    );
    // Assert: MIDI signal-type marker
    assertExists(
      canvasElement.querySelector('[data-testid="signal-type-midi"]'),
      "signal-type-midi — taxonomy type marker",
    );
    // Assert: Value signal-type marker
    assertExists(
      canvasElement.querySelector('[data-testid="signal-type-value"]'),
      "signal-type-value — taxonomy type marker",
    );
    // Assert: NOT in engine-idle state (buffer = 256, should show I/O rows)
    const idleEl = canvasElement.querySelector('[data-testid="io-engine-idle"]');
    if (idleEl)
      throw new Error("io-engine-idle should NOT be present when buffer > 0");
  },
};

// ── Warning — elevated CPU + alert ──

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
  parameters: {
    docs: {
      description: {
        story:
          "Elevated CPU (64%) with one warning alert — shows the alert card inline " +
          "and the CPU bar in orange so the user can act before it becomes a dropout.",
      },
    },
    design: {
      type: "link",
      url: "docs/ELEMENT_UNIFIED_BLUEPRINT.md#g-08-livehealth-io-detail",
    },
  },
};

// ── Critical — near-overload ──

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
  parameters: {
    docs: {
      description: {
        story:
          "Near-overload: CPU at 96% (red bar), output peaking, two stacked alerts " +
          "including a buffer underrun — the worst-case state the panel must surface clearly.",
      },
    },
    design: {
      type: "link",
      url: "docs/ELEMENT_UNIFIED_BLUEPRINT.md#g-08-livehealth-io-detail",
    },
  },
};

// ── Empty — engine idle / no data ──

export const Empty: Story = {
  decorators: [
    (Story) => {
      seed({
        cpu: 0,
        buffer: 0,     // ← triggers Engine idle state (not just flat meter)
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
  parameters: {
    docs: {
      description: {
        story:
          "Engine idle: buffer === 0 shows an explicit 'Engine idle' state instead of " +
          "flat meters — so the user can tell the engine is not running vs running-but-silent. " +
          "Metrics show '—' for all zero fields. No fake signal activity.",
      },
    },
    design: {
      type: "link",
      url: "docs/ELEMENT_UNIFIED_BLUEPRINT.md#g-08-livehealth-io-detail",
    },
  },
  play: async ({ canvasElement }) => {
    // Assert: explicit no-data state is shown (NOT hidden behind flat meters)
    assertExists(
      canvasElement.querySelector('[data-testid="io-engine-idle"]'),
      'io-engine-idle — explicit no-data state when buffer === 0',
    );
    // Assert: I/O rows are NOT rendered in idle state (no fake signal activity)
    const outRow = canvasElement.querySelector('[data-testid="io-row-audio-out"]');
    if (outRow)
      throw new Error(
        "io-row-audio-out should NOT be present in engine-idle state — would show fake zeros",
      );
    // Assert: CPU shows 0%
    const cpuEl = canvasElement.querySelector('[data-testid="cpu-pct"]');
    assertExists(cpuEl, "cpu-pct");
    const cpuText = cpuEl?.textContent?.trim();
    if (cpuText !== "0%")
      throw new Error(`Expected cpu-pct to show '0%', got '${cpuText}'`);
  },
};
