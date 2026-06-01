import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QuickAddPopup } from "./QuickAddPopup";
import {
  usePluginBrowserStore,
  type BrowserPlugin,
} from "../../stores/usePluginBrowserStore";
import type { SignalType } from "../../data/types";

/**
 * 🔍 Review/QuickAdd — guided one-at-a-time review wizard.
 *
 * ONE story, ONE url. Glen steps through each QuickAddPopup mode I need judged:
 * left = the live Element QuickAddPopup, right = the mindful-studio mockup
 * target (static PNG, or a text target where the mockup never modelled that
 * mode), per-step brief + feedback box → ui-comments.jsonl.
 *
 * Reuses the exact ReviewWizard infra from _ReviewBlock.stories.tsx.
 *
 * NOTE on containment: QuickAddPopup renders `position: fixed` with a
 * full-viewport `inset-0` backdrop. The live pane wraps it in a
 * `transform`-bearing element, which makes those fixed descendants resolve
 * against THAT box (CSS containing-block rule) — so the backdrop fills only the
 * pane, never the wizard chrome. onClose is a no-op (as the real story does),
 * so the backdrop click can't dismiss the popup mid-review.
 */

// ── Seed (cribbed from QuickAddPopup.stories.tsx — matches the component's
//    real usePluginBrowserStore reads; nativeGraphAddPlugin no-ops) ──
const demoPlugins: BrowserPlugin[] = [
  { identifier: "com.vendor.SurgeXT", name: "Surge XT", manufacturer: "Surge Synth Team", format: "VST3", category: "Synth", blockCategory: "instrument" },
  { identifier: "com.vendor.ProQ4", name: "Pro-Q 4", manufacturer: "FabFilter", format: "AU", category: "EQ", blockCategory: "audiofx" },
  { identifier: "com.vendor.Stepic", name: "Stepic", manufacturer: "Audiomodern", format: "CLAP", category: "MIDI", blockCategory: "midifx" },
  { identifier: "com.vendor.LFOTool", name: "LFOTool", manufacturer: "Xfer", format: "VST3", category: "Modulator", blockCategory: "modulator" },
  { identifier: "com.vendor.Diva", name: "Diva", manufacturer: "u-he", format: "VST3", category: "Synth", blockCategory: "instrument" },
  { identifier: "com.vendor.ValhallaVV", name: "ValhallaVintageVerb", manufacturer: "Valhalla DSP", format: "AU", category: "Reverb", blockCategory: "audiofx" },
];

function seed(plugins: BrowserPlugin[], favorites: string[] = []) {
  usePluginBrowserStore.setState({
    plugins,
    favoriteIdentifiers: new Set(favorites),
    recentIdentifiers: [],
  });
}

// ── Review steps ──
interface Step {
  key: string;
  name: string;
  /** undefined → generic (right-click) mode; set → port-type-aware mode. */
  portType?: SignalType;
  favorites: string[];
  mockupImg: string | null;
  mockupNote?: string;
  changed: string[];
  judge: string[];
}

const STEPS: Step[] = [
  {
    key: "audio",
    name: "Port-type AUDIO — filtered (dragged off an audio port)",
    portType: "audio",
    favorites: [],
    mockupImg: "/review-mockups/quickadd-audio.png",
    changed: [
      "PORT-TYPE-AWARE mode: opened by dragging a Cable off an AUDIO port. Header reads 'ADD BLOCK ACCEPTING AUDIO' with a blue signal pill.",
      "List is FILTERED to Blocks that pass audio (instruments + audio FX); MIDI FX + modulators are hidden.",
      "Results are shape + colour-coded by category (● instrument / ◆ audio FX / ▲ MIDI FX / ⬡ modulator), matching the mockup's glyph system.",
      "Keyboard-first: opens focused on the search box, arrow-key navigable.",
    ],
    judge: [
      "Header + tinted AUDIO pill match the mockup?",
      "Shape/colour glyphs per row faithful (● / ◆ / ⬡) and legible?",
      "Filtered list (audio-passers only) correct + the right density?",
      "Popup chassis (neu shadow + hairline outline) coheres with the one-chassis tokens?",
    ],
  },
  {
    key: "generic",
    name: "Generic — right-click empty canvas (full list)",
    portType: undefined,
    favorites: ["com.vendor.SurgeXT"],
    mockupImg: null,
    mockupNote:
      "No mockup reference for this mode.\n\nThe mindful-studio QuickAddPopup ONLY modelled the port-type-aware variants (audio / midi / cv / empty) — it never modelled the GENERIC right-click-canvas flow (full plugin list, no port-type header, Favorites pinned on top).\n\nThis is an Element-specific affordance. Judge ours against intent:\n• NO 'accepting <type>' header (it's the unfiltered add)\n• A 'Favorites' section pinned above the rest (Surge XT is starred here)\n• All four categories visible, each shape/colour-coded\n• Same keyboard-first popup chassis as the AUDIO step\n\nDoes the generic mode read as the 'fast add anything' path, clearly distinct from the filtered port-drag mode?",
    changed: [
      "GENERIC mode: the right-click-empty-canvas path. NO port-type header — the full scanned plugin list.",
      "A 'Favorites' section is pinned on top (here: Surge XT) above the rest of the catalogue.",
      "Same shape/colour-coded rows + keyboard-first chassis as the filtered mode.",
      "This mode has no mockup counterpart (mockup only did port-typed variants) — flagging that gap.",
    ],
    judge: [
      "Generic mode clearly distinct from the filtered port-drag mode (no type header)?",
      "Favorites-pinned-on-top useful + visually separated?",
      "Worth building a mockup for this mode, or is the current treatment enough?",
    ],
  },
];

const SEVERITIES = ["P0", "P1", "P2", "P3"] as const;

// ── Live pane: contains the fixed-position popup via a transform wrapper ──
function LivePane({ step }: { step: Step }) {
  seed(demoPlugins, step.favorites);
  return (
    <div
      key={step.key}
      style={{
        // transform establishes the containing block for the popup's
        // position:fixed backdrop + body, keeping them inside this pane.
        transform: "translateZ(0)",
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 360,
        overflow: "hidden",
      }}
      className="bg-canvas"
    >
      <QuickAddPopup x={24} y={24} portType={step.portType} onClose={() => {}} />
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
            storyId: `review:quickadd:${step.key}`,
            title: "🔍 Review/QuickAdd",
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

      <div style={{ flex: "1 1 0", minHeight: 90, display: "flex" }}>
        <div style={pane}>
          <div style={paneLabel}>ELEMENT (live)</div>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", background: "#1E1E22" }}>
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
  title: "🔍 Review/QuickAdd",
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
