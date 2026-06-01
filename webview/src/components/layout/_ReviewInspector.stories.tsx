import { useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { InspectorHub } from "./InspectorHub";
import { useGraphStore } from "../../stores/useGraphStore";
import { usePerformStore } from "../../stores/usePerformStore";
import { useEngineSnapshotStore } from "../../stores/useEngineSnapshotStore";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";
import { useBusStore } from "../../stores/useBusStore";
import { useCableMeterStore } from "../../stores/useCableMeterStore";
import type { BlockData } from "../../data/types";

/**
 * 🔍 Review/Inspector — guided one-at-a-time review wizard.
 *
 * ONE story, ONE url. Glen steps through each InspectorHub tab I need judged:
 * left = the live Element InspectorHub (the docked Block / Bus / Cable / Health
 * tabbed shell), right = the mindful-studio mockup target (static PNG), with a
 * per-step brief (what to check) and a feedback box that writes straight to
 * .omo/audit/ui-comments.jsonl. No tab-jumping — the wizard drives the tab.
 *
 * Reuses the exact ReviewWizard infra from _ReviewBlock.stories.tsx.
 */

// ── Seed data (cribbed from InspectorHub.stories.tsx so it matches the
//    component's real store reads — no invented shapes) ──
const defaultHealth = {
  cpu: 8.5,
  buffer: 256,
  latency: 5.2,
  clock: "Built-in Output",
  bpm: 120,
  timecode: "1.1.0",
  sampleRateLabel: "44.1 kHz",
  alerts: [],
  ioActivity: "nominal" as const,
  outputPeak: 0.2,
};

const selectedModifier: BlockData = {
  id: "sel-1",
  name: "Pro-Q 3",
  category: "audiofx",
  format: "VST3",
  position: { x: 200, y: 120 },
  ports: [
    { id: "in-l", type: "audio", direction: "input", label: "In L", connected: true },
    { id: "in-r", type: "audio", direction: "input", label: "In R", connected: true },
    { id: "out-l", type: "audio", direction: "output", label: "Out L", connected: true },
    { id: "out-r", type: "audio", direction: "output", label: "Out R", connected: true },
  ],
  cpuLoad: 2.3,
  latencyMs: 0,
  bypassed: false,
  muted: false,
  muteInput: false,
  error: false,
  isMacroTagged: false,
  note: "High-pass at 80 Hz, surgical peak around 3 kHz",
};

const selectedGenerator: BlockData = {
  id: "sel-2",
  name: "Mini V3",
  category: "instrument",
  format: "AU",
  position: { x: 100, y: 80 },
  ports: [
    { id: "out-l", type: "audio", direction: "output", label: "Out L", connected: true },
    { id: "out-r", type: "audio", direction: "output", label: "Out R", connected: true },
    { id: "midi-in", type: "midi", direction: "input", label: "MIDI In", connected: true },
  ],
  cpuLoad: 4.1,
  latencyMs: 0,
  bypassed: false,
  muted: false,
  muteInput: false,
  error: false,
  isMacroTagged: false,
  note: "",
};

function seedProjectOverview() {
  useGraphStore.setState((s) => ({
    ...s,
    nodes: [selectedModifier, selectedGenerator],
    edges: [
      {
        id: "e1",
        source: "sel-2",
        sourcePort: "out-l",
        target: "sel-1",
        targetPort: "in-l",
        signalType: "audio" as const,
        channelCount: 2 as const,
        isSidechain: false,
      },
    ],
    selectedNodeId: null,
  }));
  usePerformStore.setState((s) => ({
    sessionName: "Demo Session",
    liveHealth: { ...s.liveHealth, ...defaultHealth },
  }));
  useEngineSnapshotStore.setState({
    cpu: 8.5,
    sampleRate: 44100,
    bufferSize: 256,
    deviceName: "Built-in Output",
    deviceLatencyInputMs: 5.2,
    deviceLatencyOutputMs: 5.2,
    hasHostData: true,
    engineRunning: true,
    transportPlaying: false,
    transportRecording: false,
    tempoBpm: 120,
    timeSig: [4, 4] as [number, number],
    transportFrame: 0,
    transportTimecode: "1.1.0",
    lastUpdated: Date.now(),
  });
  useHostExtrasStore.setState((s) => ({ ...s, logLines: [] }));
  useBusStore.setState({ cableBus: {} });
  useCableMeterStore.setState((s) => ({ ...s, levels: {} }));
}

function seedNodeSelected(node: BlockData) {
  seedProjectOverview();
  useGraphStore.setState((s) => {
    const nodes = s.nodes.some((n) => n.id === node.id) ? s.nodes : [...s.nodes, node];
    return { ...s, nodes, selectedNodeId: node.id };
  });
}

// ── Review steps ──
interface Step {
  key: string;
  name: string;
  /** Tab to click in the live pane once mounted (role="tab" name). */
  tab: "BLOCK" | "BUS" | "CABLE" | "HEALTH";
  /** Reseeds the stores for this step's state. */
  seed: () => void;
  /** Static mockup reference under /public, or null → text-panel target. */
  mockupImg: string | null;
  /** When mockupImg is null, the text target shown on the right. */
  mockupNote?: string;
  changed: string[];
  judge: string[];
}

const STEPS: Step[] = [
  {
    key: "block",
    name: "BLOCK tab — per-Block detail",
    tab: "BLOCK",
    seed: () => seedNodeSelected(selectedModifier),
    mockupImg: "/review-mockups/inspector-block.png",
    changed: [
      "Docked tabbed shell (verdict #6): BLOCK / BUS / CABLE / HEALTH — replaces the old free-floating inspector.",
      "Gradient header with the function-inferred glyph (◆ audio FX), editable Block name, A/B preset compare, live ACTIVE/BYPASS state.",
      "Parameter sliders are the REAL wired list (BlockParameterList → bridge); empty here because Storybook has no JUCE backend.",
      "I/O ports list + per-Block CPU / latency read from the live graph + engine stores.",
    ],
    judge: [
      "Tabbed shell match the mockup's docked inspector?",
      "Gradient header + glyph + A/B strip read right against the mockup?",
      "Coheres with the one-chassis neu tokens (no glass, narrow tonal range)?",
      "Param-group + I/O-port layout faithful (mockup groups SPATIAL/TONE/GENERAL — ours is bridge-driven)?",
    ],
  },
  {
    key: "bus",
    name: "BUS tab — IO send/receive auditor",
    tab: "BUS",
    seed: () => {
      seedNodeSelected(selectedModifier);
      useBusStore.setState({ cableBus: { e1: "Reverb Send A" } });
      useCableMeterStore.setState((s) => ({ ...s, levels: { e1: 0.55 } }));
    },
    mockupImg: "/review-mockups/inspector-bus.png",
    changed: [
      "REWORKED off the 'wireless bus' model → IO send/receive (Wizard R1 #4): a Bus is a named rail blocks SEND TO / RECEIVE FROM (Bus Send / Bus Receive), never a wireless cable. All copy reworded.",
      "SEPARATE live Send + Receive activity meters per bus (R2) — real per-cable RMS from useCableMeterStore, with a dBFS / % read-out per side.",
      "Sidechain DISPLAY badge where any feed is a sidechain; signal-type colour + meaningful glyph.",
      "Direct 'Open editor' affordance dives the bus's destination block (e.g. the reverb) into the Block tab.",
    ],
    judge: [
      "Do the separate Send + Receive meters read clearly + light from real level?",
      "Is the IO send/receive framing unambiguous (no 'wireless' anywhere)?",
      "Sidechain badge + signal colour legible in the one-chassis palette?",
      "Open-editor affordance discoverable + on-brand?",
    ],
  },
  {
    key: "cable",
    name: "CABLE tab — live signal monitor",
    tab: "CABLE",
    seed: () => {
      seedProjectOverview();
      useGraphStore.setState((s) => ({ ...s, selectedNodeId: null, selectedEdgeId: "e1" }));
      useCableMeterStore.setState((s) => ({ ...s, levels: { e1: 0.62 } }));
    },
    mockupImg: "/review-mockups/inspector-cable.png",
    changed: [
      "REWORKED into a live signal MONITOR (Wizard R1 P1 — it was 'wrong on both Element AND mockup'): NOT a routing editor.",
      "AUTO-displays the selected cable's full detail (no extra click) — faithful digital-VU ladder + peak-hold, dBFS, signal type, channels, sidechain — all from the real 60Hz useCableMeterStore feed.",
      "R2 enrichment: MIDI + logic/utility/command flow metadata — carried-event tags (Gate/Trigger/CC/Note/Clock…) inferred from the real port wiring, with a Conditional flag for gate/trigger/command wires.",
      "Honest gaps (spectrum / phase / per-message counters) show explicit 'not wired' tiles — nothing faked.",
    ],
    judge: [
      "Does the auto-shown monitor read as a real signal meter (VU ramp faithful, dBFS right)?",
      "Is the MIDI / control flow metadata genuinely useful for flow-debugging?",
      "Are the honest 'not wired' gaps acceptable, or which one should be bridged first?",
    ],
  },
  {
    key: "health",
    name: "HEALTH tab — engine vitals + meters + log",
    tab: "HEALTH",
    seed: () => {
      seedProjectOverview();
      useHostExtrasStore.setState((s) => ({
        ...s,
        logLines: [
          "[engine] audio device opened: Built-in Output @ 44.1 kHz",
          "[graph] rebuilt: 2 blocks, 1 cable",
        ],
      }));
    },
    mockupImg: "/review-mockups/inspector-health.png",
    changed: [
      "HEALTH consolidates the engine vitals (LiveHealth: CPU, I/O ladders, buffer, latency, alerts), host meters, and the engine log into one scrollable column.",
      "The old shell's separate Log + Meters tabs now live here.",
      "Wired to useEngineSnapshotStore + usePerformStore + useHostExtrasStore.",
    ],
    judge: [
      "Does our consolidated vitals column read as clearly as the mockup's CPU/RAM/VOICES/XRUN gauges?",
      "Are CPU/latency/buffer the right at-a-glance metrics, or do you want the mockup's VOICES/XRUN too?",
      "Log + meters belong here, or split back out?",
    ],
  },
];

const SEVERITIES = ["P0", "P1", "P2", "P3"] as const;
const PANEL = { width: 320, height: 660 } as const;

// ── Live pane: mounts InspectorHub at the panel size + drives the tab ──
function LivePane({ step }: { step: Step }) {
  const ref = useRef<HTMLDivElement>(null);
  // Reseed for this step before the InspectorHub (re)mounts.
  step.seed();
  // Click the target tab once mounted (InspectorHub tab state is internal).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      const tabs = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
      const target = tabs.find((t) => t.textContent?.trim() === step.tab);
      if (target && target.getAttribute("aria-selected") !== "true") target.click();
    });
    return () => cancelAnimationFrame(id);
  }, [step]);

  return (
    <div ref={ref} style={PANEL} className="bg-panel">
      {/* key forces a fresh mount per step so the tab resets cleanly before
          the effect re-drives it. */}
      <InspectorHub key={step.key} />
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

  async function submit(advance: boolean) {
    if (text.trim() && step) {
      setBusy(true);
      try {
        await fetch("/__ui_comment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storyId: `review:inspector:${step.key}`,
            title: "🔍 Review/Inspector",
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

      {/* Split — live Element (left) | mockup (right). Both panes scroll
          internally; the bottom nav stays pinned. */}
      <div style={{ flex: "1 1 0", minHeight: 90, display: "flex" }}>
        <div style={pane}>
          <div style={paneLabel}>ELEMENT (live)</div>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", justifyContent: "center", padding: 12, background: "#1E1E22" }}>
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
              <div style={{ color: "#8E8E93", fontSize: 12, textAlign: "left", padding: 20, whiteSpace: "pre-line", maxWidth: 360 }}>
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
  title: "🔍 Review/Inspector",
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
