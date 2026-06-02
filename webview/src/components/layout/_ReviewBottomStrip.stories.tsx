import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BottomStrip } from "./BottomStrip";
import { useEngineSnapshotStore } from "../../stores/useEngineSnapshotStore";
import { usePerformStore } from "../../stores/usePerformStore";
import { useGraphStore } from "../../stores/useGraphStore";
import type { BlockData, CableData } from "../../data/types";

/**
 * 🔍 Review/BottomStrip — guided one-at-a-time review wizard.
 *
 * ONE story, ONE url. Glen steps through three BottomStrip states:
 * left = live Element BottomStrip (seeded from the same stores as
 * BottomStrip.stories.tsx), right = mockup reference (text target — the
 * mindful-studio Storybook at :6008 was not running at authoring time).
 *
 * Feedback box → POST /__ui_comment → .omo/audit/ui-comments.jsonl.
 */

// ── Demo graph data (cribbed verbatim from BottomStrip.stories.tsx) ──
const demoBlocks = [
  { id: "b1", type: "instrument" },
  { id: "b2", type: "audiofx" },
] as unknown as BlockData[];
const demoCables = [{ id: "c1", source: "b1", target: "b2" }] as unknown as CableData[];

function seed(overrides: {
  engineRunning?: boolean;
  transportPlaying?: boolean;
  transportRecording?: boolean;
  sampleRate?: number;
  bufferSize?: number;
  latencyInMs?: number;
  latencyOutMs?: number;
  cpu?: number;
  timeSig?: [number, number];
  bpm?: number;
  outputPeak?: number;
  blocks?: BlockData[];
  cables?: CableData[];
}) {
  useEngineSnapshotStore.setState((s) => ({
    ...s,
    engineRunning: overrides.engineRunning ?? false,
    hasHostData: true,
    transportPlaying: overrides.transportPlaying ?? false,
    transportRecording: overrides.transportRecording ?? false,
    sampleRate: overrides.sampleRate ?? 0,
    bufferSize: overrides.bufferSize ?? 0,
    deviceLatencyInputMs: overrides.latencyInMs ?? 0,
    deviceLatencyOutputMs: overrides.latencyOutMs ?? 0,
    cpu: overrides.cpu ?? 0,
    timeSig: overrides.timeSig ?? [4, 4],
  }));
  usePerformStore.setState((s) => ({
    ...s,
    liveHealth: {
      ...s.liveHealth,
      bpm: overrides.bpm ?? 120,
      outputPeak: overrides.outputPeak ?? 0,
    },
  }));
  useGraphStore.setState({
    nodes: overrides.blocks ?? [],
    edges: overrides.cables ?? [],
  });
}

// ── Review steps ──
interface Step {
  key: string;
  name: string;
  seed: () => void;
  mockupImg: string | null;
  mockupNote?: string;
  changed: string[];
  judge: string[];
}

const STEPS: Step[] = [
  {
    key: "running",
    name: "Running — engine live, master VU lit",
    seed: () =>
      seed({
        engineRunning: true,
        transportPlaying: true,
        sampleRate: 48000,
        bufferSize: 256,
        latencyInMs: 2.6,
        latencyOutMs: 2.7,
        cpu: 0.234,
        timeSig: [4, 4],
        bpm: 124,
        outputPeak: 0.78,
        blocks: demoBlocks,
        cables: demoCables,
      }),
    mockupImg: null,
    mockupNote:
      "Mockup reference (mindful-studio :6008 not running at authoring time).\n\nThe mindful-studio BottomStrip shows:\n• Transport cluster left — Rewind, Play (active/pulse), Stop, Record buttons with consistent neumorphic insets\n• Dual master VU ladder (L + R) — 8-segment horizontal bars, green→amber→red, lit into the amber band at healthy signal\n• BPM readout with tap-tempo affordance\n• Slim status fields right — ENGINE, SR, BUF, LAT, CPU, BLOCKS, CABLES in muted uppercase caps\n• Height ≈ 54px, single-chassis dark surface, no transparency\n\nJudge our implementation against that intent.",
    changed: [
      "BottomStrip (verdict #22, MERGE 50/50): mockup transport cluster + dual master VU merged onto Element chassis.",
      "Transport driven by useEngineSnapshotStore (play/record state are real engine truth via 4 Hz snapshot poll).",
      "Master VU ladder driven by usePerformStore.outputPeak — single aggregate host peak; both rows reflect it (no fake L/R split).",
      "Engine stats (SR / BUF / LAT / CPU / BLOCKS / CABLES) from live stores.",
    ],
    judge: [
      "Transport + master meter match the mockup's visual weight at a glance?",
      "VU ladder lit correctly into amber at 0.78 peak?",
      "Real engine data (48k / 256 / 5.3ms / 23%) readable at strip height?",
      "Strip coheres with the one-chassis neu palette — no transparency, no glow leaking?",
    ],
  },
  {
    key: "recording",
    name: "Recording — record active, hot CPU",
    seed: () =>
      seed({
        engineRunning: true,
        transportPlaying: true,
        transportRecording: true,
        sampleRate: 44100,
        bufferSize: 128,
        latencyInMs: 1.4,
        latencyOutMs: 1.3,
        cpu: 0.876,
        timeSig: [4, 4],
        bpm: 90,
        outputPeak: 0.97,
        blocks: demoBlocks,
        cables: demoCables,
      }),
    mockupImg: null,
    mockupNote:
      "Mockup reference (text target — :6008 not running).\n\nExpected recording state:\n• Record button pressed-inset with red accent / pulse\n• VU ladders at near-clip level (red segments lit)\n• CPU field in error-red (>80%)\n• BPM 90, 44.1k / 128 / 2.7ms\n\nThe mockup's mindful-studio recording state was never separately screenshotted — judge ours against intent above.",
    changed: [
      "Record button flips to 'Stop recording' affordance while transportRecording=true.",
      "VU ladders climb into the clip/red band (outputPeak 0.97).",
      "CPU field switches to error-red at >80% — real engine truth, not decoration.",
      "Buffer drops to 128, SR to 44.1k — all real snapshot fields.",
    ],
    judge: [
      "Record button visually armed / pulsing red — obvious vs playing-only state?",
      "VU ladders convincingly near-clip (red segments) at 0.97 peak?",
      "CPU 88% in error-red — clear danger signal without overwhelming the strip?",
      "Strip still reads in one sweep at 54px height in this hot state?",
    ],
  },
  {
    key: "idle",
    name: "Idle — stopped, meters at -∞",
    seed: () =>
      seed({
        engineRunning: false,
        transportPlaying: false,
        transportRecording: false,
        sampleRate: 0,
        bufferSize: 0,
        latencyInMs: 0,
        latencyOutMs: 0,
        cpu: 0,
        bpm: 120,
        outputPeak: 0,
        blocks: [],
        cables: [],
      }),
    mockupImg: null,
    mockupNote:
      "Mockup reference (text target — :6008 not running).\n\nExpected idle / off state:\n• Engine indicator: OFF\n• VU ladders fully dark — no segments lit (−∞)\n• Transport: Play button (not Pause), record button default\n• All stat fields show em-dash fallbacks where no engine data\n• BLOCKS 0 / CABLES 0\n\nThe strip must never animate or fake signal when the engine is off.",
    changed: [
      "Engine off → ENGINE: OFF, all stats em-dash, Play affordance (not Pause).",
      "Master VU fully dark — no segments lit, aria-valuenow='0'.",
      "BLOCKS/CABLES counters at 0 — real graph state, nothing fake.",
      "Proves the strip never invents motion without real engine data.",
    ],
    judge: [
      "Strip feels complete and intentional at idle — not broken or empty?",
      "VU fully dark (−∞) without looking glitched?",
      "ENGINE: OFF clearly distinguished from ENGINE: OK at a glance?",
      "Em-dash fallbacks in stat fields readable + on-brand?",
    ],
  },
];

const SEVERITIES = ["P0", "P1", "P2", "P3"] as const;

// ── Live pane: BottomStrip at its natural 54px height ──
function LivePane({ step }: { step: Step }) {
  // Reseed before render (mirrors _ReviewToolbar / _ReviewInspector pattern).
  step.seed();
  return (
    <div style={{ width: "100%" }}>
      <div key={step.key} style={{ height: 54 }} className="w-full">
        <BottomStrip />
      </div>
    </div>
  );
}

// ── Wizard ──
function ReviewWizard() {
  const [i, setI] = useState(0);
  const [text, setText] = useState("");
  const [sev, setSev] = useState<(typeof SEVERITIES)[number]>("P2");
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const step = STEPS[i];
  const total = STEPS.length;
  const done = i >= total;

  // Reseed when step changes (keeps live pane in sync without forced remount).
  useEffect(() => {
    step?.seed();
  }, [i, step]);

  async function submit(advance: boolean) {
    if (text.trim() && step) {
      setBusy(true);
      try {
        await fetch("/__ui_comment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storyId: `review:bottomstrip:${step.key}`,
            title: "🔍 Review/BottomStrip",
            name: step.name,
            severity: sev,
            text: text.trim(),
          }),
        });
        setSaved((s) => ({ ...s, [step.key]: true }));
      } catch {
        /* dev-server only; ignore */
      }
      setBusy(false);
    }
    if (advance) {
      setText("");
      setSev("P2");
      setI((n) => n + 1);
    }
  }

  if (done) {
    return (
      <div style={wrap}>
        <div style={{ textAlign: "center", maxWidth: 440 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <h2 style={{ color: "#E5E5EA", fontSize: 18, marginBottom: 8 }}>Review complete</h2>
          <p style={{ color: "#8E8E93", fontSize: 13, lineHeight: 1.5 }}>
            {Object.keys(saved).length} of {total} steps with feedback, saved to{" "}
            <code style={{ color: "#4A90D9" }}>.omo/audit/ui-comments.jsonl</code>. Tell me "done"
            and I'll read + apply them.
          </p>
          <button style={btnPrimary} onClick={() => setI(0)}>
            ↻ Review again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        height: "100vh",
        overflow: "hidden",
        background: "#161619",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div style={topBar}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#8E8E93", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>
            STEP {i + 1} / {total}
          </span>
          <span style={{ color: "#E5E5EA", fontSize: 14, fontWeight: 700 }}>{step.name}</span>
          {saved[step.key] && (
            <span style={{ color: "#34D399", fontSize: 11 }}>✓ feedback saved</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {STEPS.map((s, n) => (
            <div
              key={s.key}
              title={s.name}
              style={{
                width: 26,
                height: 4,
                borderRadius: 2,
                background: n === i ? "#4A90D9" : saved[s.key] ? "#34D399" : "#3A3A3E",
              }}
            />
          ))}
        </div>
      </div>

      {/* Split — live Element (left) | mockup / text-target (right).
          The strip is only 54px tall so both panes align it at the top. */}
      <div style={{ flex: "1 1 0", minHeight: 90, display: "flex" }}>
        <div style={pane}>
          <div style={paneLabel}>ELEMENT (live)</div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              padding: 12,
              background: "#1E1E22",
              display: "flex",
              alignItems: "flex-start",
            }}
          >
            <LivePane step={step} />
          </div>
        </div>
        <div style={{ ...pane, borderLeft: "1px solid #2A2A2E" }}>
          <div style={paneLabel}>MOCKUP (target)</div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              background: "#1E1E22",
              padding: 12,
            }}
          >
            {step.mockupImg ? (
              <img
                src={step.mockupImg}
                alt="mockup target"
                style={{ maxWidth: "100%", objectFit: "contain", borderRadius: 6 }}
              />
            ) : (
              <div
                style={{
                  color: "#8E8E93",
                  fontSize: 12,
                  textAlign: "left",
                  padding: 16,
                  whiteSpace: "pre-line",
                  maxWidth: 380,
                  lineHeight: 1.6,
                }}
              >
                {step.mockupNote ??
                  "No mockup reference for this state — judge against the intent in the brief below."}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={bottom}>
        <div style={{ display: "flex", gap: 24, marginBottom: 12, maxHeight: "24vh", overflowY: "auto" }}>
          <div style={{ flex: 1 }}>
            <div style={briefHead}>WHAT CHANGED</div>
            <ul style={ul}>
              {step.changed.map((c, n) => (
                <li key={n} style={li}>
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ ...briefHead, color: "#4A90D9" }}>JUDGE THIS</div>
            <ul style={ul}>
              {step.judge.map((c, n) => (
                <li key={n} style={li}>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ color: "#8E8E93", fontSize: 10, fontWeight: 700 }}>SEVERITY</span>
            <select
              value={sev}
              onChange={(e) => setSev(e.target.value as (typeof SEVERITIES)[number])}
              style={select}
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Your feedback on "${step.name}" (leave blank to skip)…`}
            style={textarea}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              style={{ ...btnGhost, opacity: i === 0 ? 0.4 : 1 }}
              disabled={i === 0}
              onClick={() => setI((n) => Math.max(0, n - 1))}
            >
              ← Prev
            </button>
            <button style={btnPrimary} disabled={busy} onClick={() => submit(true)}>
              {busy ? "Saving…" : text.trim() ? "Save + Next →" : "Skip →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Styles (identical to _ReviewToolbar / _ReviewInspector) ──
const wrap: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "#161619",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "Inter, system-ui, sans-serif",
};
const topBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 16px",
  background: "#1E1E22",
  borderBottom: "1px solid #2A2A2E",
  flexShrink: 0,
};
const pane: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  background: "#1A1A1E",
};
const paneLabel: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.1em",
  color: "#6E6E73",
  borderBottom: "1px solid #26262A",
};
const bottom: React.CSSProperties = {
  padding: "12px 16px 14px",
  background: "#1E1E22",
  borderTop: "1px solid #2A2A2E",
  flexShrink: 0,
};
const briefHead: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.1em",
  color: "#8E8E93",
  marginBottom: 6,
};
const ul: React.CSSProperties = { margin: 0, paddingLeft: 16 };
const li: React.CSSProperties = { color: "#C7C7CF", fontSize: 12, lineHeight: 1.5, marginBottom: 3 };
const textarea: React.CSSProperties = {
  flex: 1,
  height: 52,
  resize: "none",
  background: "#121214",
  border: "1px solid #2E2E33",
  borderRadius: 6,
  color: "#E5E5EA",
  fontSize: 13,
  padding: "8px 10px",
  fontFamily: "inherit",
};
const select: React.CSSProperties = {
  background: "#121214",
  border: "1px solid #2E2E33",
  borderRadius: 6,
  color: "#E5E5EA",
  fontSize: 12,
  padding: "8px 6px",
};
const btnPrimary: React.CSSProperties = {
  background: "#4A90D9",
  color: "#0B0B0E",
  border: "none",
  borderRadius: 6,
  padding: "9px 14px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const btnGhost: React.CSSProperties = {
  background: "#26262A",
  color: "#E5E5EA",
  border: "1px solid #34343A",
  borderRadius: 6,
  padding: "7px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const meta = {
  title: "🔍 Review/BottomStrip",
  parameters: {
    layout: "fullscreen",
    options: { showPanel: false },
    chromatic: { disableSnapshot: true },
  },
  tags: ["!autodocs", "!test"],
} as Meta;

export default meta;
type Story = StoryObj;

export const StartReview: Story = {
  name: "▶ Start review",
  render: () => <ReviewWizard />,
};
