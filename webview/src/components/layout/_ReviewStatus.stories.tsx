import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

/**
 * 🔍 Review/① Status — live dashboard of all review feedback.
 *
 * Fetches GET /__ui_comments (or /__ui_comment) on mount, takes the LATEST
 * record per storyId, and renders:
 *   - Outstanding (open / in-progress) — prominently, needs action
 *   - Addressed (resolved / fixed / wontfix) — collapsed, de-emphasised
 *
 * Sorts first alphabetically to `"🔍 Review/① Status"` so it appears at the
 * top of the Review group in the Storybook sidebar.
 *
 * NOTHING fake: all data comes from the real .omo/audit/ui-comments.jsonl via
 * the dev-server endpoint. Under vitest (no Vite dev-server) the fetch 404s
 * and the component shows an honest empty state — no throw, no fake rows.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommentRecord {
  id: string;
  ts: string;
  storyId: string | null;
  title: string | null;
  name: string | null;
  severity: string | null;
  text: string;
  status: string;
  resolvedAt?: string;
  resolvedNote?: string;
  resolvedCommit?: string;
}

type FetchState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "empty" }
  | { phase: "ready"; outstanding: CommentRecord[]; addressed: CommentRecord[] };

// ── Helpers ───────────────────────────────────────────────────────────────────

const ADDRESSED_STATUSES = new Set(["resolved", "fixed", "wontfix"]);

function isAddressed(r: CommentRecord): boolean {
  return ADDRESSED_STATUSES.has(r.status);
}

/** Take the chronologically latest record per storyId. */
function latestPerStory(records: CommentRecord[]): CommentRecord[] {
  const map = new Map<string, CommentRecord>();
  for (const r of records) {
    const key = r.storyId ?? `__no_story_${r.id}`;
    const existing = map.get(key);
    if (!existing || r.ts > existing.ts) {
      map.set(key, r);
    }
  }
  return Array.from(map.values());
}

async function fetchComments(): Promise<CommentRecord[]> {
  // Try the plural alias first (preferred), fall back to singular.
  for (const url of ["/__ui_comments", "/__ui_comment"]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json() as { comments?: CommentRecord[] };
        return Array.isArray(data.comments) ? data.comments : [];
      }
    } catch {
      // network error or timeout — try next url
    }
  }
  return [];
}

// ── Severity colour map ───────────────────────────────────────────────────────

function sevColor(sev: string | null): string {
  switch (sev) {
    case "P0": return "#FF453A";
    case "P1": return "#FF9F0A";
    case "P2": return "#4A90D9";
    case "P3": return "#8E8E93";
    default:   return "#8E8E93";
  }
}

function sevLabel(sev: string | null): string {
  return sev ?? "–";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function OutstandingRow({ r }: { r: CommentRecord }) {
  const [expanded, setExpanded] = useState(false);
  const shortText = r.text.length > 160 ? r.text.slice(0, 160) + "…" : r.text;

  return (
    <div style={outstandingCard}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {/* Severity badge */}
        <span
          style={{
            ...sevBadge,
            background: sevColor(r.severity),
            color: r.severity === "P3" ? "#E5E5EA" : "#0B0B0E",
          }}
        >
          {sevLabel(r.severity)}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Story / component label */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={storyLabel}>{r.storyId ?? "(no story)"}</span>
            {r.name && <span style={nameChip}>{r.name}</span>}
            <span style={{ ...statusDot, background: "#FF9F0A" }} title={r.status} />
          </div>
          {/* Feedback text */}
          <p style={feedbackText}>
            {expanded ? r.text : shortText}
            {r.text.length > 160 && (
              <button
                onClick={() => setExpanded((x) => !x)}
                style={expandBtn}
              >
                {expanded ? " less" : " more"}
              </button>
            )}
          </p>
        </div>

        {/* Timestamp */}
        <span style={tsLabel}>{formatDate(r.ts)}</span>
      </div>
    </div>
  );
}

function AddressedRow({ r }: { r: CommentRecord }) {
  return (
    <div style={addressedCard}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ ...sevBadge, background: "#2A2A2E", color: "#6E6E73" }}>
          {sevLabel(r.severity)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ ...storyLabel, color: "#6E6E73" }}>{r.storyId ?? "(no story)"}</span>
            {r.name && <span style={{ ...nameChip, color: "#6E6E73", borderColor: "#2E2E33" }}>{r.name}</span>}
            <span style={{ ...statusDot, background: "#34D399" }} title={r.status} />
          </div>
          <p style={{ ...feedbackText, color: "#555560", WebkitLineClamp: 2 }}>
            {r.text.length > 100 ? r.text.slice(0, 100) + "…" : r.text}
          </p>
          {(r.resolvedNote || r.resolvedCommit) && (
            <div style={resolvedMeta}>
              {r.resolvedNote && <span>✅ {r.resolvedNote}</span>}
              {r.resolvedCommit && (
                <code style={commitCode}>{r.resolvedCommit.slice(0, 10)}</code>
              )}
            </div>
          )}
        </div>
        <span style={{ ...tsLabel, color: "#3A3A40" }}>{formatDate(r.resolvedAt ?? r.ts)}</span>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "–";
  }
}

// ── Main dashboard component ──────────────────────────────────────────────────

function ReviewStatusDashboard() {
  const [state, setState] = useState<FetchState>({ phase: "loading" });
  const [showAddressed, setShowAddressed] = useState(false);

  const load = () => {
    setState({ phase: "loading" });
    fetchComments()
      .then((all) => {
        if (all.length === 0) {
          setState({ phase: "empty" });
          return;
        }
        const latest = latestPerStory(all);
        const outstanding = latest
          .filter((r) => !isAddressed(r))
          .sort((a, b) => {
            // P0 first, then P1, then by ts desc
            const sevOrder = ["P0", "P1", "P2", "P3"];
            const ai = sevOrder.indexOf(a.severity ?? "");
            const bi = sevOrder.indexOf(b.severity ?? "");
            if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
            return b.ts.localeCompare(a.ts);
          });
        const addressed = latest
          .filter((r) => isAddressed(r))
          .sort((a, b) => (b.resolvedAt ?? b.ts).localeCompare(a.resolvedAt ?? a.ts));
        setState({ phase: "ready", outstanding, addressed });
      })
      .catch((e: unknown) =>
        setState({ phase: "error", message: String(e) })
      );
  };

  useEffect(() => { load(); }, []);

  const n = state.phase === "ready" ? state.outstanding.length : 0;
  const m = state.phase === "ready" ? state.addressed.length : 0;

  return (
    <div style={shell}>
      {/* Header */}
      <div style={header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={headerTitle}>Review Status</span>
          {state.phase === "ready" && (
            <span style={summaryPill}>
              <span style={{ color: n > 0 ? "#FF9F0A" : "#34D399" }}>
                {n} outstanding
              </span>
              <span style={{ color: "#3A3A40" }}> · </span>
              <span style={{ color: "#34D399" }}>{m} addressed</span>
            </span>
          )}
        </div>
        <button onClick={load} style={refreshBtn} title="Reload from .omo/audit/ui-comments.jsonl">
          ↻ Refresh
        </button>
      </div>

      {/* Body */}
      <div style={body}>
        {state.phase === "loading" && (
          <div style={centred}>
            <div style={spinner} />
            <span style={{ color: "#6E6E73", fontSize: 13, marginTop: 12 }}>
              Loading reviews…
            </span>
          </div>
        )}

        {state.phase === "error" && (
          <div style={centred}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
            <p style={{ color: "#FF453A", fontSize: 13, textAlign: "center", maxWidth: 360 }}>
              Could not fetch reviews: {state.message}
            </p>
            <button onClick={load} style={{ ...refreshBtn, marginTop: 12 }}>Retry</button>
          </div>
        )}

        {state.phase === "empty" && (
          <div style={centred}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <p style={{ color: "#6E6E73", fontSize: 13, textAlign: "center", maxWidth: 340 }}>
              No reviews logged yet.
            </p>
            <p style={{ color: "#3A3A40", fontSize: 12, textAlign: "center", maxWidth: 340, marginTop: 6 }}>
              Open a{" "}
              <code style={{ color: "#4A90D9" }}>🔍 Review/*</code>{" "}
              wizard story and submit feedback — it will appear here.
            </p>
          </div>
        )}

        {state.phase === "ready" && (
          <>
            {/* Outstanding */}
            <section style={section}>
              <div style={sectionHead}>
                <span style={{ color: n > 0 ? "#FF9F0A" : "#6E6E73" }}>
                  {n > 0 ? "🆕" : "✓"} OUTSTANDING ({n})
                </span>
                {n === 0 && (
                  <span style={{ color: "#6E6E73", fontSize: 11, fontWeight: 400 }}>
                    — all feedback addressed
                  </span>
                )}
              </div>
              {n === 0 ? (
                <div style={{ padding: "20px 0", color: "#4A4A52", fontSize: 13, textAlign: "center" }}>
                  Nothing outstanding — every logged review has been addressed.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {state.outstanding.map((r) => (
                    <OutstandingRow key={r.id} r={r} />
                  ))}
                </div>
              )}
            </section>

            {/* Addressed */}
            <section style={section}>
              <button
                style={sectionToggle}
                onClick={() => setShowAddressed((x) => !x)}
              >
                <span style={{ color: "#34D399" }}>✅ ADDRESSED ({m})</span>
                <span style={{ color: "#3A3A40", fontSize: 11 }}>
                  {showAddressed ? "▲ hide" : "▼ show"}
                </span>
              </button>
              {showAddressed && m === 0 && (
                <div style={{ padding: "12px 0", color: "#4A4A52", fontSize: 12, textAlign: "center" }}>
                  No addressed feedback yet.
                </div>
              )}
              {showAddressed && m > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                  {state.addressed.map((r) => (
                    <AddressedRow key={r.id} r={r} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Footer — endpoint info */}
      <div style={footer}>
        <span style={{ color: "#3A3A40", fontSize: 10 }}>
          Source:{" "}
          <code style={{ color: "#4A90D9", fontSize: 10 }}>
            GET /__ui_comments
          </code>{" "}
          → <code style={{ color: "#555560", fontSize: 10 }}>.omo/audit/ui-comments.jsonl</code>
          {" "}· latest record per storyId shown
        </span>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const shell: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "#161619",
  display: "flex",
  flexDirection: "column",
  fontFamily: "Inter, system-ui, sans-serif",
  color: "#E5E5EA",
  overflow: "hidden",
};

const header: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 18px",
  background: "#1E1E22",
  borderBottom: "1px solid #2A2A2E",
  flexShrink: 0,
};

const headerTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#E5E5EA",
  letterSpacing: "-0.01em",
};

const summaryPill: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "3px 10px",
  background: "#222226",
  borderRadius: 20,
  border: "1px solid #2E2E33",
  /* neumorphic inset */
  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.4), inset 0 -1px 1px rgba(255,255,255,0.03)",
};

const refreshBtn: React.CSSProperties = {
  background: "#26262A",
  color: "#8E8E93",
  border: "1px solid #34343A",
  borderRadius: 6,
  padding: "6px 12px",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow:
    "2px 2px 4px rgba(0,0,0,0.35), -1px -1px 2px rgba(255,255,255,0.04)",
};

const body: React.CSSProperties = {
  flex: "1 1 0",
  overflowY: "auto",
  padding: "16px 18px",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const centred: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 200,
};

const section: React.CSSProperties = {
  background: "#1E1E22",
  borderRadius: 8,
  border: "1px solid #2A2A2E",
  padding: "14px 16px",
  boxShadow:
    "2px 2px 6px rgba(0,0,0,0.4), -1px -1px 3px rgba(255,255,255,0.03)",
};

const sectionHead: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.08em",
  color: "#8E8E93",
  marginBottom: 12,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const sectionToggle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.08em",
  padding: 0,
  marginBottom: 0,
};

const outstandingCard: React.CSSProperties = {
  background: "#222226",
  borderRadius: 6,
  border: "1px solid #2E2E33",
  padding: "10px 12px",
  boxShadow:
    "inset 0 1px 3px rgba(0,0,0,0.5), inset 0 -1px 1px rgba(255,255,255,0.03)",
};

const addressedCard: React.CSSProperties = {
  background: "#1A1A1E",
  borderRadius: 6,
  border: "1px solid #26262A",
  padding: "8px 10px",
  opacity: 0.7,
};

const sevBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 28,
  height: 20,
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.04em",
  flexShrink: 0,
  marginTop: 1,
};

const storyLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#8E8E93",
  fontFamily: "ui-monospace, 'SF Mono', monospace",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: 320,
};

const nameChip: React.CSSProperties = {
  fontSize: 10,
  color: "#8E8E93",
  border: "1px solid #2E2E33",
  borderRadius: 3,
  padding: "1px 5px",
  whiteSpace: "nowrap",
};

const statusDot: React.CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: "50%",
  flexShrink: 0,
};

const feedbackText: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "#C7C7CF",
  lineHeight: 1.55,
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const expandBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#4A90D9",
  fontSize: 11,
  cursor: "pointer",
  padding: 0,
  fontWeight: 600,
};

const tsLabel: React.CSSProperties = {
  fontSize: 10,
  color: "#4A4A52",
  whiteSpace: "nowrap",
  flexShrink: 0,
  marginTop: 2,
};

const resolvedMeta: React.CSSProperties = {
  marginTop: 5,
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 10,
  color: "#34D399",
  flexWrap: "wrap",
};

const commitCode: React.CSSProperties = {
  fontFamily: "ui-monospace, 'SF Mono', monospace",
  fontSize: 10,
  color: "#4A90D9",
  background: "#1A1A2A",
  padding: "1px 5px",
  borderRadius: 3,
};

const footer: React.CSSProperties = {
  padding: "8px 18px",
  borderTop: "1px solid #222226",
  background: "#1A1A1E",
  flexShrink: 0,
};

// Simple CSS spinner (no animation lib dependency)
const spinner: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  border: "2px solid #2A2A2E",
  borderTopColor: "#4A90D9",
  animation: "spin 0.8s linear infinite",
};

// ── Storybook meta ────────────────────────────────────────────────────────────

const meta = {
  title: "🔍 Review/① Status",
  parameters: {
    layout: "fullscreen",
    options: { showPanel: false },
    // Don't snapshot — this is a live-data surface.
    chromatic: { disableSnapshot: true },
  },
  // Keep out of vitest story runner — it fetches live endpoints.
  // The component handles 404 gracefully (empty state, no throw).
  tags: ["!autodocs", "!test"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Dashboard: Story = {
  name: "▶ Open dashboard",
  render: () => (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <ReviewStatusDashboard />
    </>
  ),
};
