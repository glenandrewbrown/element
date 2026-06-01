import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Node } from "@xyflow/react";
import { MiniFlow } from "../../../.storybook/decorators";
import { Block } from "./Block";
import { useParameterStore } from "../../stores/useParameterStore";
import type { BlockData, Port } from "../../data/types";

/**
 * 🔍 Review/Block — guided one-at-a-time review wizard.
 *
 * ONE story, ONE url. Glen steps through each Block state I need judged: left =
 * the live Element Block, right = the mindful-studio mockup target (iframe to
 * :6008), with a per-step brief (what changed / what to judge) and a feedback
 * box that writes straight to .omo/audit/ui-comments.jsonl. No tab-jumping.
 */

// ── Local block factory (kept independent of Block.stories) ──
let uid = 0;
function makeBlock(over: Partial<BlockData> = {}): BlockData {
  uid += 1;
  return {
    id: `rv${uid}`,
    name: "Block",
    category: "instrument",
    format: "VST3",
    position: { x: 0, y: 0 },
    ports: [
      { id: "in", type: "audio", direction: "input", label: "In", connected: true },
      { id: "out", type: "audio", direction: "output", label: "Out", connected: false },
    ],
    cpuLoad: 22,
    latencyMs: 3,
    bypassed: false,
    error: false,
    isMacroTagged: false,
    ...over,
  };
}
function flowNode(data: BlockData, selected = false): Node {
  return { id: data.id, type: "block", position: { x: 0, y: 0 }, data, selected };
}
const nodeTypes = { block: Block };

// ── Review steps (ONLY the components I need feedback on right now) ──
interface Step {
  key: string;
  name: string;
  data: BlockData;
  selected?: boolean;
  params?: number[];
  /** Static mockup reference screenshot under /public, or null if none for this
   *  state. Static PNG (not a live :6008 iframe) so the wizard never CORS-fails. */
  mockupImg: string | null;
  changed: string[];
  judge: string[];
}

const PRO_Q_PORTS: Port[] = [
  { id: "in", type: "audio", direction: "input", label: "In", connected: true },
  { id: "sc", type: "audio", direction: "input", label: "Sidechain", connected: false },
  { id: "out", type: "audio", direction: "output", label: "Out", connected: true },
];

const STEPS: Step[] = [
  {
    key: "audiofx-knobs",
    name: "Audio FX — knob deck + ports",
    data: makeBlock({ name: "Pro-Q 4", category: "audiofx", format: "AU", ports: PRO_Q_PORTS }),
    selected: true,
    params: [0.62, 0.4, 0.78],
    mockupImg: "/review-mockups/audiofx-knobs.png",
    changed: [
      "VU METERS added (your call) — digital-VU LED ramp green→amber→red. Idle here; animates when the per-block meter bridge wires real levels.",
      "Header glyph is now a MEANINGFUL function icon (EQ/reverb/synth…), not an abstract shape.",
      "CPU % moved into the HEADER (more visible); latency in its tooltip.",
      "Ports are now recessed PHYSICAL wells (signal-coloured pip); sidechain = dashed socket + bold orange label.",
      "Hover = subtle glow only — block no longer changes shape on hover.",
    ],
    judge: [
      "VU meters — useful + faithful LED colours? Size/placement right?",
      "Function icon actually a useful cue now?",
      "Port wells read as physical sockets (not cheap circles)?",
      "Sidechain obvious enough?",
    ],
  },
  {
    key: "instrument-clean",
    name: "Instrument — clean / no params",
    data: makeBlock({ name: "Kick Synth", category: "instrument", format: "VST3" }),
    mockupImg: "/review-mockups/instrument-clean.png",
    changed: [
      "Removed the meaningless centre glyph → now a synth function icon + VU meters.",
      "No shape-change on hover (your P0) — fixed; hover is glow-only.",
      "OPEN: MIDI-vs-audio port differentiation + midi-activity feedback for instruments — not done yet, want your steer.",
    ],
    judge: [
      "Better than the empty box? VU meters appropriate for a synth?",
      "What MIDI feedback do you want on an instrument (it receives MIDI + outputs audio)?",
    ],
  },
  {
    key: "midifx-ports",
    name: "MIDI FX — multi-port labels",
    data: makeBlock({
      name: "Splitter",
      category: "midifx",
      format: "INT",
      ports: [
        { id: "ai", type: "audio", direction: "input", label: "Audio In", connected: true },
        { id: "mi", type: "midi", direction: "input", label: "MIDI In", connected: true },
        { id: "mo", type: "midi", direction: "output", label: "Ch 1", connected: false },
        { id: "vo", type: "value", direction: "output", label: "Gate", connected: false },
      ],
    }),
    mockupImg: "/review-mockups/audiofx-knobs.png",
    changed: [
      "Physical recessed wells + stronger signal colour-coding of labels/wells (blue audio / teal midi / orange value).",
      "Function icon (MIDI transform) in header; no VU (carries no audio).",
      "NOTED (backlog): max exposed ports must be adjustable per block (some plugins = hundreds of channels) — not built yet.",
    ],
    judge: [
      "Wells + colour-coding right now?",
      "4-port lane density — clean?",
    ],
  },
  {
    key: "muted",
    name: "Muted — red + heavy overlay",
    data: makeBlock({ name: "Reverb", category: "audiofx", muted: true }),
    mockupImg: null,
    changed: [
      "REDONE per your note: full-block RED GRADIENT wash over the WHOLE block (incl header) — no cheap red border/stripes.",
      "Header B/M still clickable (overlay is click-through) to un-mute.",
    ],
    judge: ["Right now? Red gradient read clearly as muted/blocked?"],
  },
  {
    key: "bypassed",
    name: "Bypassed — grey + heavy overlay",
    data: makeBlock({ name: "Reverb", category: "audiofx", bypassed: true }),
    mockupImg: null,
    changed: ["REDONE per your note: the WHOLE block — including its coloured title bar — is now desaturated + greyed out (grayscale backdrop), heavier grey."],
    judge: ["Right now? Whole block incl header reads as greyed/bypassed?"],
  },
];

const SEVERITIES = ["P0", "P1", "P2", "P3"] as const;

// ── Prior-feedback hook ──
// Fetches all comments once per wizard mount and surfaces the latest record for
// a given storyId. Silently returns null when the dev-server isn't running
// (vitest / build-storybook contexts) — no throw, no fake data.
interface PriorRecord {
  text: string;
  status: string;
  severity: string | null;
  resolvedNote?: string;
  resolvedCommit?: string;
}

function usePriorFeedback(): (storyId: string) => PriorRecord | null {
  const [byStory, setByStory] = useState<Map<string, PriorRecord>>(new Map());

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/__ui_comments", { signal: AbortSignal.timeout(2000) });
        if (!res.ok) return;
        const data = (await res.json()) as {
          comments?: Array<{
            storyId?: string | null;
            text?: string;
            status?: string;
            severity?: string | null;
            ts?: string;
            resolvedNote?: string;
            resolvedCommit?: string;
          }>;
        };
        if (!Array.isArray(data.comments)) return;
        // Latest record per storyId (sort ascending, last wins)
        const sorted = [...data.comments].sort((a, b) =>
          (a.ts ?? "").localeCompare(b.ts ?? ""),
        );
        const m = new Map<string, PriorRecord>();
        for (const c of sorted) {
          if (!c.storyId) continue;
          m.set(c.storyId, {
            text: String(c.text ?? ""),
            status: String(c.status ?? "open"),
            severity: c.severity ?? null,
            resolvedNote: c.resolvedNote,
            resolvedCommit: c.resolvedCommit,
          });
        }
        setByStory(m);
      } catch {
        /* dev-server not running — ignore */
      }
    })();
  }, []);

  return (storyId: string) => byStory.get(storyId) ?? null;
}

// ── Prior-feedback banner ──
function PriorBanner({ record }: { record: PriorRecord | null }) {
  if (!record) return null;

  const isAddressed =
    record.status === "resolved" ||
    record.status === "fixed" ||
    record.status === "wontfix";

  const sevColors: Record<string, string> = {
    P0: "#FF453A",
    P1: "#FF9F0A",
    P2: "#4A90D9",
    P3: "#8E8E93",
  };
  const accentColor = sevColors[record.severity ?? ""] ?? "#8E8E93";

  const short =
    record.text.length > 120
      ? record.text.slice(0, 120) + "…"
      : record.text;

  return (
    <div
      style={{
        borderRadius: 5,
        border: `1px solid ${isAddressed ? "#2A3A2A" : "#2E2A1E"}`,
        background: isAddressed ? "#1A221A" : "#1E1C14",
        padding: "7px 10px",
        marginBottom: 8,
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>
        {isAddressed ? "✅" : "💬"}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: "0.06em",
              color: isAddressed ? "#34D399" : "#FF9F0A",
            }}
          >
            {isAddressed ? "ADDRESSED" : "OPEN FEEDBACK"}
          </span>
          {record.severity && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: accentColor,
                border: `1px solid ${accentColor}44`,
                borderRadius: 3,
                padding: "0 4px",
              }}
            >
              {record.severity}
            </span>
          )}
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: isAddressed ? "#4A5A4A" : "#9E9080",
            lineHeight: 1.45,
          }}
        >
          {short}
        </p>
        {isAddressed && record.resolvedNote && (
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 10,
              color: "#34D399",
            }}
          >
            ↳ {record.resolvedNote}
            {record.resolvedCommit && (
              <code
                style={{
                  marginLeft: 6,
                  fontSize: 10,
                  color: "#4A90D9",
                  background: "#1A1A2A",
                  padding: "1px 4px",
                  borderRadius: 3,
                }}
              >
                {record.resolvedCommit.slice(0, 10)}
              </code>
            )}
          </p>
        )}
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
  const getPrior = usePriorFeedback();

  const step = STEPS[i];
  const total = STEPS.length;
  const done = i >= total;

  // Seed live param values for this step's knobs.
  useEffect(() => {
    const st = useParameterStore.getState();
    st.clear();
    if (step?.params) step.params.forEach((v, idx) => st.setLocal(step.data.id, idx, v));
  }, [i, step]);

  async function submit(advance: boolean) {
    if (text.trim() && step) {
      setBusy(true);
      try {
        await fetch("/__ui_comment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storyId: `review:block:${step.key}`,
            title: "🔍 Review/Block",
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
      {/* Top bar — progress */}
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

      {/* Split — mine | mockup. Flexes to fill whatever height remains so the
          nav bar below is ALWAYS visible (Storybook's preview pane is shorter
          than a full window). */}
      <div style={{ flex: "1 1 0", minHeight: 90, display: "flex" }}>
        <div style={pane}>
          <div style={paneLabel}>ELEMENT (live)</div>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <MiniFlow nodes={[flowNode(step.data, step.selected)]} nodeTypes={nodeTypes} height={312} />
          </div>
        </div>
        <div style={{ ...pane, borderLeft: "1px solid #2A2A2E" }}>
          <div style={paneLabel}>MOCKUP (target)</div>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#1E1E22" }}>
            {step.mockupImg ? (
              <img
                src={step.mockupImg}
                alt="mockup target"
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            ) : (
              <div style={{ color: "#8E8E93", fontSize: 12, textAlign: "center", padding: 20, whiteSpace: "pre-line" }}>
                No mockup reference for this state —{"\n"}judge against the intent in the brief below.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Brief + feedback — pinned at the bottom, always visible. */}
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

        {/* Prior feedback for this step — null when none or server unavailable */}
        <PriorBanner record={getPrior(`review:block:${step.key}`)} />

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

// ── styles ──
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
  title: "🔍 Review/Block",
  parameters: {
    layout: "fullscreen",
    options: { showPanel: false },
    chromatic: { disableSnapshot: true },
  },
  // !test → kept out of the vitest story runner (it fetches :6008 + iframes,
  // which is a live review surface, not an automated assertion target).
  tags: ["!autodocs", "!test"],
} as Meta;

export default meta;
type Story = StoryObj;

export const StartReview: Story = {
  name: "▶ Start review",
  render: () => <ReviewWizard />,
};
