/**
 * Element UI-feedback addon — a Storybook MANAGER panel (not an in-canvas
 * overlay), so it never hides the component under review. Lets Glen leave
 * per-component feedback AND see a persistent, tracked history of every note.
 *
 * Backed by the dev-server sink (ui-comment-sink.ts → .omo/audit/
 * ui-comments.jsonl). The agent reads that same file. Status is the shared
 * truth: Glen sets open/fixed, the agent flips to in-progress/fixed as it works.
 *
 * React MUST be imported in a manager entry (manager JSX → React.createElement);
 * without it the panel builds clean but throws "This addon has errors".
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  addons,
  types,
  useStorybookApi,
  useStorybookState,
} from "storybook/manager-api";

const ADDON_ID = "element/feedback";
const PANEL_ID = `${ADDON_ID}/panel`;
const API = "/__ui_comment";
const SEVERITIES = ["P0", "P1", "P2", "P3"] as const;
const STATUSES = ["open", "in-progress", "fixed", "wontfix"] as const;

interface CommentRecord {
  id: string;
  ts: string;
  storyId: string | null;
  title: string | null;
  name: string | null;
  severity: string | null;
  text: string;
  status: string;
}

const sevColor: Record<string, string> = {
  P0: "#d9534a",
  P1: "#E8A838",
  P2: "#2BC4C4",
  P3: "#8E8E93",
};
const statusColor: Record<string, string> = {
  open: "#8E8E93",
  "in-progress": "#4A90D9",
  fixed: "#3FB950",
  wontfix: "#5a5a60",
};

function timeAgo(ts: string): string {
  const d = Date.parse(ts);
  if (!d) return "";
  const s = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function CommentItem({
  c,
  showComponent,
  onPatch,
  onDelete,
}: {
  c: CommentRecord;
  showComponent?: boolean;
  onPatch: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      style={{
        padding: "8px 10px",
        marginBottom: 8,
        background: "#1f1f23",
        border: "1px solid #2a2a2e",
        borderRadius: 8,
        borderLeft: `3px solid ${sevColor[c.severity ?? "P3"] ?? "#8E8E93"}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: sevColor[c.severity ?? "P3"] ?? "#8E8E93",
          }}
        >
          {c.severity ?? "—"}
        </span>
        {showComponent && (
          <span style={{ fontSize: 11, color: "#8e8e93" }}>
            {c.title}
            {c.name ? ` · ${c.name}` : ""}
          </span>
        )}
        <span style={{ fontSize: 10, color: "#5a5a60", marginLeft: "auto" }}>
          {timeAgo(c.ts)}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: "#e5e5ea", whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
        {c.text}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
        <span
          style={{
            fontSize: 10,
            padding: "2px 7px",
            borderRadius: 999,
            color: "#15151a",
            background: statusColor[c.status] ?? "#8E8E93",
            fontWeight: 600,
          }}
        >
          {c.status}
        </span>
        <select
          value={c.status}
          onChange={(e) => onPatch(c.id, e.target.value)}
          title="Set status"
          style={{
            fontSize: 11,
            background: "#15151a",
            border: "1px solid #2a2a2e",
            borderRadius: 6,
            color: "#e5e5ea",
            padding: "2px 4px",
          }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          onClick={() => onDelete(c.id)}
          title="Delete"
          style={{
            marginLeft: "auto",
            fontSize: 11,
            background: "transparent",
            border: "1px solid #2a2a2e",
            borderRadius: 6,
            color: "#8e8e93",
            padding: "2px 8px",
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function FeedbackPanel() {
  useStorybookState(); // re-render on story change
  const api = useStorybookApi();
  const story = api.getCurrentStoryData?.() as
    | { id?: string; title?: string; name?: string }
    | undefined;
  const storyId = story?.id ?? "";
  const title = story?.title ?? "";
  const name = story?.name ?? "";

  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>("P2");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [showAll, setShowAll] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(API);
      if (r.ok) {
        const j = await r.json();
        setComments(Array.isArray(j.comments) ? j.comments : []);
      }
    } catch {
      /* dev server only */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function send() {
    if (!text.trim() || !storyId) return;
    setState("saving");
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId,
          title,
          name,
          severity,
          text: text.trim(),
          ts: new Date().toISOString(),
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setText("");
      setState("idle");
      refresh();
    } catch {
      setState("error");
    }
  }

  async function patch(id: string, status: string) {
    try {
      await fetch(`${API}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      refresh();
    } catch {
      /* ignore */
    }
  }

  async function remove(id: string) {
    try {
      await fetch(`${API}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, delete: true }),
      });
      refresh();
    } catch {
      /* ignore */
    }
  }

  const byNewest = (a: CommentRecord, b: CommentRecord) =>
    (Date.parse(b.ts) || 0) - (Date.parse(a.ts) || 0);
  const mine = comments.filter((c) => c.storyId === storyId).sort(byNewest);
  const all = [...comments].sort(byNewest);
  const openCount = comments.filter((c) => c.status === "open").length;

  return (
    <div
      style={{
        padding: 16,
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        color: "#e5e5ea",
        maxWidth: 560,
        height: "100%",
        overflowY: "auto",
        boxSizing: "border-box",
      }}
    >
      {/* compose */}
      <div style={{ fontSize: 12, color: "#8e8e93" }}>Feedback for</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>
        {storyId ? (
          <>
            {title} · <span style={{ color: "#2bc4c4" }}>{name}</span>
          </>
        ) : (
          <span style={{ color: "#8e8e93" }}>Select a story</span>
        )}
      </div>
      {storyId && (
        <div style={{ fontSize: 11, color: "#5a5a60", marginBottom: 8 }}>
          {storyId}
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="what's wrong → what you want"
        rows={3}
        disabled={!storyId}
        style={{
          width: "100%",
          boxSizing: "border-box",
          resize: "vertical",
          background: "#1a1a1e",
          border: "1px solid #2a2a2e",
          borderRadius: 8,
          color: "#e5e5ea",
          fontSize: 13,
          padding: "8px 10px",
          outline: "none",
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        <label style={{ fontSize: 12, color: "#8e8e93" }}>Severity</label>
        <select
          value={severity}
          onChange={(e) =>
            setSeverity(e.target.value as (typeof SEVERITIES)[number])
          }
          style={{
            background: "#1a1a1e",
            border: "1px solid #2a2a2e",
            borderRadius: 8,
            color: "#e5e5ea",
            fontSize: 13,
            padding: "6px 10px",
          }}
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          onClick={send}
          disabled={state === "saving" || !text.trim() || !storyId}
          style={{
            marginLeft: "auto",
            background: state === "error" ? "#5a1f1f" : "#2a2a2e",
            border: "1px solid #34343a",
            borderRadius: 8,
            color: "#e5e5ea",
            fontSize: 13,
            padding: "7px 16px",
            cursor: text.trim() && storyId ? "pointer" : "default",
          }}
        >
          {state === "saving" ? "Saving…" : state === "error" ? "Retry" : "Send"}
        </button>
      </div>
      <div style={{ fontSize: 11, color: "#5a5a60", marginTop: 8 }}>
        ⌘/Ctrl+Enter to send · persisted to .omo/audit/ui-comments.jsonl
      </div>

      {/* history — this component */}
      <div
        style={{
          marginTop: 18,
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderTop: "1px solid #2a2a2e",
          paddingTop: 14,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>This component</span>
        <span style={{ fontSize: 11, color: "#8e8e93" }}>({mine.length})</span>
        <button
          onClick={refresh}
          title="Refresh"
          style={{
            marginLeft: "auto",
            fontSize: 11,
            background: "transparent",
            border: "1px solid #2a2a2e",
            borderRadius: 6,
            color: "#8e8e93",
            padding: "2px 8px",
            cursor: "pointer",
          }}
        >
          ↻
        </button>
      </div>
      {mine.length === 0 && (
        <div style={{ fontSize: 12, color: "#5a5a60" }}>
          No feedback yet for this component.
        </div>
      )}
      {mine.map((c) => (
        <CommentItem key={c.id} c={c} onPatch={patch} onDelete={remove} />
      ))}

      {/* history — all */}
      <div
        style={{
          marginTop: 14,
          borderTop: "1px solid #2a2a2e",
          paddingTop: 12,
        }}
      >
        <button
          onClick={() => setShowAll((v) => !v)}
          style={{
            background: "transparent",
            border: "none",
            color: "#e5e5ea",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            padding: 0,
          }}
        >
          {showAll ? "▾" : "▸"} All feedback ({all.length})
          {openCount > 0 && (
            <span style={{ color: "#8e8e93", fontWeight: 400 }}>
              {" "}
              · {openCount} open
            </span>
          )}
        </button>
        {showAll && (
          <div style={{ marginTop: 10 }}>
            {all.length === 0 && (
              <div style={{ fontSize: 12, color: "#5a5a60" }}>
                No feedback captured yet.
              </div>
            )}
            {all.map((c) => (
              <CommentItem
                key={c.id}
                c={c}
                showComponent
                onPatch={patch}
                onDelete={remove}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

addons.register(ADDON_ID, () => {
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: "💬 Feedback",
    match: ({ viewMode }) => viewMode === "story",
    render: ({ active }) => (active ? <FeedbackPanel /> : null),
  });
});
