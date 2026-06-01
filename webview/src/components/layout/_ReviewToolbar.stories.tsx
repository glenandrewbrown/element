import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Toolbar } from "./Toolbar";
import { useAppStore } from "../../stores/useAppStore";
import { useGraphStore } from "../../stores/useGraphStore";
import { usePerformStore } from "../../stores/usePerformStore";
import { useSessionStore } from "../../stores/useSessionStore";
import { useEngineSnapshotStore } from "../../stores/useEngineSnapshotStore";

/**
 * 🔍 Review/Toolbar — guided one-at-a-time review wizard.
 *
 * ONE story, ONE url. Glen steps through each Toolbar state I need judged:
 * left = the live Element Toolbar (Edit-only command centre), right = the
 * mindful-studio mockup target (static PNG, or a text target where the mockup
 * never modelled that state), per-step brief + feedback box → ui-comments.jsonl.
 *
 * Reuses the exact ReviewWizard infra from _ReviewBlock.stories.tsx.
 */

// ── Seed (cribbed from Toolbar.stories.tsx — matches the component's real
//    five-store reads; native bridge calls no-op without a JUCE backend) ──
const defaultHealth = {
  cpu: 12.3,
  buffer: 256,
  latency: 4.2,
  clock: "Built-in Output",
  bpm: 120,
  timecode: "1.1.0",
  sampleRateLabel: "44.1 kHz",
  alerts: [],
  ioActivity: "nominal" as const,
  outputPeak: 0.4,
};

function seedEdit() {
  useAppStore.setState({ mode: "edit", cableRouting: "manhattan", activeScene: 0 });
  useGraphStore.setState({ breadcrumbStack: ["Main Project"] });
  usePerformStore.setState((s) => ({ liveHealth: { ...s.liveHealth, ...defaultHealth } }));
  useEngineSnapshotStore.setState({
    engineRunning: true,
    transportPlaying: false,
    transportRecording: false,
    tempoBpm: 120,
    timeSig: [4, 4] as [number, number],
    sampleRate: 44100,
    bufferSize: 256,
    deviceLatencyInputMs: 2.1,
    deviceLatencyOutputMs: 2.1,
  });
  useSessionStore.setState({
    filePath: "/Users/glen/Music/Demo.els",
    dirty: false,
    graphs: [{ id: "g1", name: "Main Board", index: 0, active: true }],
  });
}

// ── Review steps ──
interface Step {
  key: string;
  name: string;
  /** Width the toolbar bar is rendered at (responsive flex behaviour). */
  width: number;
  seed: () => void;
  mockupImg: string | null;
  mockupNote?: string;
  changed: string[];
  judge: string[];
}

const STEPS: Step[] = [
  {
    key: "default",
    name: "Default — saved Project, one Board",
    width: 1440,
    seed: () => seedEdit(),
    mockupImg: "/review-mockups/toolbar-default.png",
    changed: [
      "Reskinned to the mockup's command-centre bar: ELEMENT wordmark, file actions, single breadcrumb pill, ⌘K search, transport, tempo, metric fields, About/Preferences, red PANIC.",
      "Perform mode is SHELVED (decision D3) — Element's toolbar has NO Edit/Perform toggle (the mockup still shows one; that pair is intentionally dropped on our side).",
      "SAMPLE / BUFFER / LATENCY / SIG metric fields now read directly from useEngineSnapshotStore (real engine truth, not faked).",
    ],
    judge: [
      "Bar reads as cleanly as the mockup at a glance?",
      "Single breadcrumb pill + ⌘K affordance match?",
      "Dropping the EDIT/PERFORM toggle (vs mockup) the right call, or do you miss it here?",
      "PANIC prominent + unmistakable in the one-chassis palette?",
    ],
  },
  {
    key: "multiboard",
    name: "Multi-board — depth-hue breadcrumb pills",
    width: 1680,
    seed: () => {
      seedEdit();
      useSessionStore.setState({
        filePath: "/Users/glen/Music/Demo.els",
        dirty: true,
        graphs: [
          { id: "g1", name: "Main Board", index: 0, active: true },
          { id: "g2", name: "FX Chain", index: 1, active: false },
          { id: "g3", name: "Drums", index: 2, active: false },
        ],
      });
      useGraphStore.setState({
        breadcrumbStack: ["Main Project", "Synth Layer", "Reverb Send"],
      });
    },
    mockupImg: "/review-mockups/toolbar-multiboard.png",
    changed: [
      "Deeper breadcrumb (Main Project › Synth Layer › Reverb Send) with PER-LEVEL DEPTH-HUE pills — each nesting level gets its own tint, deepest = active.",
      "Board switcher appears (multi-Board only); a dirty-file dot shows on the name.",
      "Mockup shows L0/L1/L2 depth pills — ours mirrors that depth-hue trail.",
    ],
    judge: [
      "Depth-hue pills read as well as the mockup's L0/L1/L2 trail (clear level hierarchy)?",
      "Active/deepest pill obvious vs ancestors?",
      "Board switcher discoverable + on-brand?",
      "At a real desktop width does the trail hold without crowding the controls?",
    ],
  },
  {
    key: "recording",
    name: "Recording — transport live (playing + armed)",
    width: 1440,
    seed: () => {
      seedEdit();
      useEngineSnapshotStore.setState({
        transportPlaying: true,
        transportRecording: true,
        sampleRate: 48000,
        bufferSize: 128,
      });
    },
    mockupImg: null,
    mockupNote:
      "No mockup reference for this state.\n\nThe mindful-studio TopToolbar never modelled a live-transport / recording state — its transport cluster is static, and its toolbar centres on the (shelved) EDIT/PERFORM toggle instead.\n\nJudge ours against intent:\n• Play flips to PAUSE while playing\n• Record dot pulses red while armed\n• SAMPLE/BUFFER update live (now 48k / 128)\n\nIs the live-transport feedback legible + correctly driven by engine truth?",
    changed: [
      "Transport is wired to useEngineSnapshotStore: playing → play icon becomes Pause; recording → the record dot pulses red.",
      "SAMPLE/BUFFER reflect the (changed) engine snapshot live — here 48k / 128.",
      "This is the engine-truth transport path, not a decorative toggle.",
    ],
    judge: [
      "Play→Pause flip clear while playing?",
      "Record dot pulse obvious as 'armed/recording' (not just decorative)?",
      "Live SAMPLE/BUFFER readout legible at a glance?",
    ],
  },
];

const SEVERITIES = ["P0", "P1", "P2", "P3"] as const;

// ── Live pane: the Toolbar in a 40px bg-panel bar at the step's width ──
function LivePane({ step }: { step: Step }) {
  step.seed();
  // The toolbar is a wide bar; show it on a scroll-x track so the full width is
  // reachable inside the narrower review pane without squashing the layout.
  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <div
        key={step.key}
        style={{ width: step.width, height: 40 }}
        className="bg-panel flex items-center px-2"
      >
        <Toolbar />
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

  // Reseed when the step changes so the live pane is correct even without a remount.
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
            storyId: `review:toolbar:${step.key}`,
            title: "🔍 Review/Toolbar",
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
            <code style={{ color: "#4A90D9" }}>.omo/audit/ui-comments.jsonl</code>. Tell me “done” and
            I’ll read + apply them.
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
          {saved[step.key] && <span style={{ color: "#34D399", fontSize: 11 }}>✓ feedback saved</span>}
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

      {/* Split — live (left) | mockup (right). The toolbar is a horizontal bar,
          so each pane stacks its content at the top. */}
      <div style={{ flex: "1 1 0", minHeight: 90, display: "flex" }}>
        <div style={pane}>
          <div style={paneLabel}>ELEMENT (live)</div>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12, background: "#1E1E22", display: "flex", alignItems: "flex-start" }}>
            <LivePane step={step} />
          </div>
        </div>
        <div style={{ ...pane, borderLeft: "1px solid #2A2A2E" }}>
          <div style={paneLabel}>MOCKUP (target)</div>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", background: "#1E1E22", padding: 12 }}>
            {step.mockupImg ? (
              <img
                src={step.mockupImg}
                alt="mockup target"
                style={{ maxWidth: "100%", objectFit: "contain", borderRadius: 6 }}
              />
            ) : (
              <div style={{ color: "#8E8E93", fontSize: 12, textAlign: "left", padding: 16, whiteSpace: "pre-line", maxWidth: 380, lineHeight: 1.6 }}>
                {step.mockupNote ?? "No mockup reference for this state — judge against the intent in the brief below."}
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
            placeholder={`Your feedback on “${step.name}” (leave blank to skip)…`}
            style={textarea}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button style={{ ...btnGhost, opacity: i === 0 ? 0.4 : 1 }} disabled={i === 0} onClick={() => setI((n) => Math.max(0, n - 1))}>
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

// ── styles (identical to _ReviewBlock) ──
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
  title: "🔍 Review/Toolbar",
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
