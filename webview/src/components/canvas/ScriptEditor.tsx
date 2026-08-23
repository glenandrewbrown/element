// Copyright 2026 Kushview, LLC
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "react";
import {
  nativeScriptGetSource,
  nativeScriptGetRuntimeState,
  nativeScriptSetSource,
  type ScriptCompileResult,
  type ScriptRuntimeVar,
} from "../../bridge/nativeGraph";

const MONO_FONT =
  "'SF Mono', Menlo, Consolas, 'Courier New', monospace";

function buildLineNumbers(source: string): string[] {
  const count = source.split("\n").length;
  return Array.from({ length: count }, (_, i) => String(i + 1));
}

interface ScriptEditorProps {
  /** Id of the Lua Script Block being edited. Source + runtime variables are fetched from / pushed to the native bridge for this Block. */
  nodeId: string;
  /** Optional dismiss callback; when provided a close (×) button is shown in the editor's top bar. */
  onClose?: () => void;
}

/**
 * ScriptEditor — the embedded Lua source editor for a Script Block. Use it to
 * author and live-compile the Lua that drives a `el.Script` Block without
 * leaving Element: a line-numbered textarea with Cmd/Ctrl+Enter to
 * "Save & Compile", inline compile-success/error status, and a live variable
 * inspector polled at ~1 Hz from the running script so an expert can watch
 * state change as they iterate. Mount it inside an Inspector tab or a Block's
 * detail pane; it loads source and runtime state for `nodeId` over the native
 * bridge and is `h-full`, so give it a sized container.
 */
export function ScriptEditor({ nodeId, onClose }: ScriptEditorProps) {
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ScriptCompileResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [vars, setVars] = useState<ScriptRuntimeVar[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumRef = useRef<HTMLDivElement>(null);

  // Load source on mount
  useEffect(() => {
    setLoading(true);
    void nativeScriptGetSource(nodeId).then((src) => {
      setSource(src);
      setLoading(false);
    });
  }, [nodeId]);

  // Poll runtime state at ~1Hz while editor is active
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      const r = await nativeScriptGetRuntimeState(nodeId);
      if (!alive) return;
      setVars(r.ok && r.vars ? r.vars : []);
    };
    void tick();
    const id = setInterval(() => { void tick(); }, 1000);
    return () => { alive = false; clearInterval(id); };
  }, [nodeId]);

  // Sync line numbers scroll with textarea scroll
  const syncScroll = useCallback(() => {
    if (textareaRef.current && lineNumRef.current) {
      lineNumRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const handleCompile = useCallback(async () => {
    setSaving(true);
    setResult(null);
    const r = await nativeScriptSetSource(nodeId, source);
    setResult(r);
    setSaving(false);
  }, [nodeId, source]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Cmd+Enter or Ctrl+Enter: compile
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void handleCompile();
        return;
      }
      // Tab: insert 2 spaces
      if (e.key === "Tab") {
        e.preventDefault();
        const el = e.currentTarget;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const next = source.slice(0, start) + "  " + source.slice(end);
        setSource(next);
        // Restore cursor after state update
        requestAnimationFrame(() => {
          el.selectionStart = start + 2;
          el.selectionEnd = start + 2;
        });
      }
    },
    [source, handleCompile],
  );

  const lineNumbers = buildLineNumbers(source);
  const hasError = result !== null && !result.ok;
  const isOk = result !== null && result.ok;

  return (
    <div className="flex flex-col h-full bg-pressed border border-white/5 rounded-lg overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-panel border-b border-white/5 shrink-0">
        <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest flex-1">
          Script Editor
        </span>
        <button
          onClick={() => void handleCompile()}
          disabled={saving || loading}
          className={[
            "px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wide transition-colors",
            saving || loading
              ? "bg-surface text-text-dim cursor-not-allowed"
              : "bg-generator/20 border border-generator/40 text-generator hover:bg-generator/30 cursor-pointer",
          ].join(" ")}
        >
          {saving ? "Compiling…" : "Save & Compile"}
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded text-text-secondary hover:text-text-primary hover:bg-white/5 text-[14px] leading-none cursor-pointer"
            aria-label="Close script editor"
          >
            ×
          </button>
        )}
      </div>

      {/* Status row */}
      {(isOk || hasError) && (
        <div
          className={[
            "px-3 py-1 text-[10px] font-mono shrink-0",
            hasError
              ? "bg-red-900/20 border-b border-red-500/40 text-red-400"
              : "bg-green-900/20 border-b border-green-500/30 text-green-400",
          ].join(" ")}
          style={{ fontFamily: MONO_FONT }}
        >
          {isOk ? "Compiled successfully." : result.error || "Compile error."}
        </div>
      )}

      {/* Editor body */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-[10px] text-text-dim">
            Loading…
          </div>
        ) : (
          <>
            {/* Line numbers */}
            <div
              ref={lineNumRef}
              className="select-none overflow-hidden shrink-0 text-right pr-2 pl-2 pt-2 text-text-dim text-[11px] tabular-nums leading-5 bg-surface border-r border-white/5"
              style={{ fontFamily: MONO_FONT, minWidth: "2.8rem" }}
              aria-hidden
            >
              {lineNumbers.map((n) => (
                <div key={n} className="leading-5">
                  {n}
                </div>
              ))}
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setResult(null);
              }}
              onScroll={syncScroll}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className={[
                "flex-1 resize-none outline-none bg-transparent text-text-primary text-[11px] leading-5 p-2 overflow-auto",
                hasError ? "border-r-2 border-red-500/60" : "",
              ].join(" ")}
              style={{ fontFamily: MONO_FONT, tabSize: 2 }}
              aria-label="Lua script source"
            />
          </>
        )}
      </div>

      {/* Variables strip */}
      {vars.length > 0 && (
        <div className="px-3 py-1.5 bg-surface border-t border-white/5 shrink-0 max-h-32 overflow-y-auto" style={{ fontFamily: MONO_FONT }}>
          <div className="text-[9px] font-bold text-text-secondary uppercase tracking-widest mb-1">Variables</div>
          {vars.slice(0, 8).map(v => (
            <div key={v.name} className="text-[10px] text-text-primary truncate">
              <span className="text-text-secondary">{v.name}</span> = <span>{v.value.slice(0, 40)}</span>
              <span className="text-text-dim ml-2">[{v.type}]</span>
            </div>
          ))}
        </div>
      )}

      {/* Bottom hint */}
      <div className="px-3 py-1 text-[9px] text-text-dim border-t border-white/5 shrink-0 tabular-nums">
        {saving ? "Compiling…" : "Cmd+Enter to compile · Tab inserts 2 spaces"}
      </div>
    </div>
  );
}
