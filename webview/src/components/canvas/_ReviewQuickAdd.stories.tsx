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
  { identifier: "com.vendor.SurgeXT",    name: "Surge XT",            manufacturer: "Surge Synth Team", format: "VST3", category: "Synth",      blockCategory: "instrument", signalOut: "audio", usageCount: 9 },
  { identifier: "com.vendor.ProQ4",      name: "Pro-Q 4",             manufacturer: "FabFilter",        format: "AU",   category: "EQ",          blockCategory: "audiofx",   signalOut: "audio", usageCount: 5 },
  { identifier: "com.vendor.Stepic",     name: "Stepic",              manufacturer: "Audiomodern",      format: "CLAP", category: "MIDI",         blockCategory: "midifx",   signalOut: "midi",  usageCount: 3 },
  { identifier: "com.vendor.LFOTool",    name: "LFOTool",             manufacturer: "Xfer",             format: "VST3", category: "Modulator",   blockCategory: "modulator", signalOut: "value", usageCount: 2 },
  { identifier: "com.vendor.Diva",       name: "Diva",                manufacturer: "u-he",             format: "VST3", category: "Synth",        blockCategory: "instrument", signalOut: "audio", usageCount: 4 },
  { identifier: "com.vendor.ValhallaVV", name: "ValhallaVintageVerb", manufacturer: "Valhalla DSP",     format: "AU",   category: "Reverb",       blockCategory: "audiofx",   signalOut: "audio", usageCount: 1 },
  { identifier: "com.vendor.ProC2",      name: "Pro-C 2",             manufacturer: "FabFilter",        format: "AU",   category: "Compressor",   blockCategory: "audiofx",   signalOut: "audio", usageCount: 0 },
];

function seed(plugins: BrowserPlugin[], favorites: string[] = [], recents: string[] = []) {
  usePluginBrowserStore.setState({
    plugins,
    favoriteIdentifiers: new Set(favorites),
    recentIdentifiers: recents,
  });
}

// ── Review steps ──
interface Step {
  key: string;
  name: string;
  /** undefined → generic (right-click) mode; set → port-type-aware mode. */
  portType?: SignalType;
  favorites: string[];
  /** Most-recently-used identifiers, most-recent first. */
  recents: string[];
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
    recents: [],
    mockupImg: "/review-mockups/quickadd-audio.png",
    changed: [
      "PORT-TYPE-AWARE mode: opened by dragging a Cable off an AUDIO port. Header reads 'ADD BLOCK ACCEPTING AUDIO' with a blue signal pill.",
      "List is FILTERED to Blocks that pass audio (instruments + audio FX); MIDI FX + modulators are hidden.",
      "R1 ICON SWAP: category icons now use iconForCategory() (Piano/SlidersHorizontal/GitBranch/Waves) instead of unicode glyphs (●◆▲⬡). Same colour coding, better legibility.",
      "Keyboard-first: opens focused on the search box, arrow-key navigable.",
    ],
    judge: [
      "Header + tinted AUDIO pill match the mockup?",
      "Icon-per-row legible + more meaningful than old unicode glyphs (●/◆/⬡)?",
      "Filtered list (audio-passers only) correct + the right density?",
      "Popup chassis (neu shadow + hairline outline) coheres with the one-chassis tokens?",
    ],
  },
  {
    key: "recents",
    name: "Recents-first on open — browse mode (R1 P2)",
    portType: undefined,
    favorites: ["com.vendor.SurgeXT"],
    recents: ["com.vendor.ValhallaVV", "com.vendor.LFOTool", "com.vendor.Stepic"],
    mockupImg: null,
    mockupNote:
      "No mockup reference for recents-first.\n\nThe mindful-studio mockup never modelled the browse-mode layout (it only showed filtered / empty states). Recents-first is an Element-specific R1 P2 refinement requested by Glen.\n\nJudge ours against intent:\n• 'Favorites' section pinned top (Surge XT starred)\n• 'Recents' section below, most-recently-used first: Valhalla → LFOTool → Stepic\n• 'All' section for the remainder (unlabelled in old code, now clearly labelled)\n• NO port-type header — this is the full unfiltered add\n\nDoes the Favorites → Recents → All layout feel like the right mental model for the 'fast add anything' path?",
    changed: [
      "R1 P2 RECENTS-FIRST: the browse list now leads Favorites → Recents (most-recent first) → All.",
      "A dedicated 'All' section label appears when recents/favorites are present, so the unlabelled tail is clear.",
      "Recents come from the real recentIdentifiers store field (populated by the C++ bridge on plugin use).",
      "The old store already had recentIdentifiers — this just makes the ordering explicit and solid.",
    ],
    judge: [
      "Favorites → Recents → All mental model correct?",
      "'All' label for the tail: helpful or noise?",
      "Most-recently-used at the top of the Recents section (Valhalla first here)?",
      "Does this feel faster than a flat alphabetical list on open?",
    ],
  },
  {
    key: "generic",
    name: "Generic — right-click empty canvas (no recents/favorites)",
    portType: undefined,
    favorites: [],
    recents: [],
    mockupImg: null,
    mockupNote:
      "No mockup reference for this mode.\n\nThe mindful-studio QuickAddPopup ONLY modelled port-type-aware variants — it never modelled the generic right-click-canvas flow.\n\nThis is the fallback state: no favorites, no recents, just the full flat list. Judge against intent:\n• NO port-type header\n• NO section labels (single flat list with no Favorites/Recents to separate)\n• All four categories visible, each icon-coded\n• Same keyboard-first chassis as the filtered mode",
    changed: [
      "GENERIC mode: the right-click-empty-canvas path. NO port-type header.",
      "When no favorites or recents exist, the list is a clean flat catalogue (no empty-section noise).",
      "All four categories visible, each icon-coded via iconForCategory.",
    ],
    judge: [
      "Clean flat list with no section labels when nothing is starred/recent?",
      "Icon density + row height feel right for fast scanning?",
    ],
  },
  {
    key: "metadata",
    name: "Metadata fuzzy search (R2) — manufacturer + category match",
    portType: undefined,
    favorites: [],
    recents: [],
    mockupImg: null,
    mockupNote:
      "R2 METADATA SEARCH — no mockup counterpart.\n\nThe old fuzzy search only matched the display name. R2 extends matching to:\n  • manufacturer  — 'valhalla' finds ValhallaVintageVerb\n  • raw category  — 'reverb' finds all plugins with category='Reverb'\n  • blockCategory — 'audiofx' finds all audio-effect blocks\n  • signal aliases — 'audio fx', 'cv', 'midi' map to the derived signal type\n\nTry searching for each:\n  'valhalla'   → should return ValhallaVintageVerb\n  'reverb'     → should return ValhallaVintageVerb (category match)\n  'fabfilter'  → should return Pro-Q 4 + Pro-C 2\n  'audio fx'   → should return all audiofx + instrument blocks\n  'eq'         → should return Pro-Q 4 (raw category = 'EQ')\n\nDoes the metadata search feel fast + discoverable for real-world plugin hunting?",
    changed: [
      "R2 METADATA FUZZY SEARCH: fuzzyScoreEntry() now scores across name, manufacturer, rawCategory, blockCategory, and signal-type aliases.",
      "Real data sources: manufacturer and category come directly from the C++ plugin scanner (via BrowserPlugin.manufacturer + BrowserPlugin.category).",
      "Signal-type aliases let users type 'audio', 'cv', 'midi' to filter by signal role without knowing the plugin name.",
      "Scoring is weighted: name (1.0) > rawCategory (0.8) > manufacturer (0.7) > blockCategory (0.6) > signal-alias (0.5).",
    ],
    judge: [
      "'valhalla' returns ValhallaVintageVerb (manufacturer match)?",
      "'reverb' returns ValhallaVintageVerb (category match)?",
      "'fabfilter' returns Pro-Q 4 + Pro-C 2 (manufacturer match)?",
      "Signal alias ('audio fx') returns the right set of blocks?",
      "Does weighted multi-field scoring feel accurate — right results near the top?",
    ],
  },
];

const SEVERITIES = ["P0", "P1", "P2", "P3"] as const;

// ── Live pane: contains the fixed-position popup via a transform wrapper ──
function LivePane({ step }: { step: Step }) {
  seed(demoPlugins, step.favorites, step.recents);
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
