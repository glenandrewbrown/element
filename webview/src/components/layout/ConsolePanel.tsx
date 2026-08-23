import { useState, useRef, useEffect, useCallback } from "react";
import { NeuButton, NeuToggle } from "../neu";
import { useHostExtrasStore } from "../../stores/useHostExtrasStore";

// ── Icons ──

const ICON_TERMINAL =
  "M20 19V7H4v12h16m0-16a2 2 0 012 2v14a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h16m-7 14v-2h5v2h-5m-3.42-4L5.57 9H8.4l3.3 3.3c.39.39.39 1.03 0 1.42L8.42 17H5.59l4-4z";
const ICON_CLEAR =
  "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z";
const ICON_DOWNLOAD =
  "M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z";
const ICON_PLAY = "M8 5v14l11-7z";

type LogLevel = "info" | "warn" | "error" | "debug" | "result";

interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  message: string;
}

function Icon({
  d,
  size = 14,
  className = "",
}: {
  d: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

// ── Log level styles ──

const levelStyles: Record<LogLevel, { color: string; prefix: string }> = {
  info: { color: "text-generator", prefix: "[INFO]" },
  warn: { color: "text-modifier", prefix: "[WARN]" },
  error: { color: "text-error", prefix: "[ERR]" },
  debug: { color: "text-text-dim", prefix: "[DBG]" },
  result: { color: "text-logic", prefix: ">>>" },
};

// ── LogLine component ──

function LogLine({ entry }: { entry: LogEntry }) {
  const { color, prefix } = levelStyles[entry.level] || levelStyles.info;
  return (
    <div className="flex gap-2 py-0.5 border-b border-white/5 hover:bg-white/5 font-mono text-[10px]">
      <span className="text-text-dim shrink-0 w-16">{entry.timestamp}</span>
      <span className={`${color} shrink-0 w-12`}>{prefix}</span>
      <span className="text-text-primary flex-1 whitespace-pre-wrap break-words">
        {entry.message}
      </span>
    </div>
  );
}

// ── ConsolePanel component ──

type ConsoleTab = "console" | "log";

export function ConsolePanel() {
  const [activeTab, setActiveTab] = useState<ConsoleTab>("console");
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idCounter = useRef(0);

  // Get log lines from host
  const hostLogLines = useHostExtrasStore((s) => s.logLines);

  // Sync host logs
  useEffect(() => {
    const newLogs: LogEntry[] = hostLogLines.map((line, i) => ({
      id: i,
      timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }).slice(0, 8),
      level: line.toLowerCase().includes("error")
        ? "error"
        : line.toLowerCase().includes("warn")
          ? "warn"
          : "info",
      message: line,
    }));
    setLogs(newLogs);
  }, [hostLogLines]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const addLog = useCallback((level: LogLevel, message: string) => {
    const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false }).slice(0, 8);
    setLogs((prev) => [
      ...prev,
      { id: idCounter.current++, timestamp, level, message },
    ]);
  }, []);

  const executeCommand = useCallback(
    (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed) return;

      // Add to history
      setHistory((prev) => [...prev.slice(-49), trimmed]);
      setHistoryIndex(-1);

      // Log the input
      addLog("debug", `> ${trimmed}`);

      // In real implementation, send to native Lua engine:
      // void nativeLuaExecute(trimmed);

      // Demo: simulate some responses
      if (trimmed === "help") {
        addLog("result", "Available commands: help, clear, status, nodes, version");
      } else if (trimmed === "clear") {
        setLogs([]);
      } else if (trimmed === "status") {
        addLog("result", "Engine: running | CPU: 12.4% | Buffer: 256 spl");
      } else if (trimmed === "nodes") {
        addLog("result", "Active nodes: 5 (2 generators, 2 modifiers, 1 logic)");
      } else if (trimmed === "version") {
        addLog("result", "Element Lua Console v1.0.0 | LuaJIT 2.1.0");
      } else if (trimmed.startsWith("print(")) {
        // Simple print simulation
        const match = trimmed.match(/print\(["'](.*)["']\)/);
        if (match) {
          addLog("result", match[1]);
        } else {
          addLog("result", "[value]");
        }
      } else {
        // Unknown command
        addLog("info", `Executing: ${trimmed}`);
        // Simulate async response
        setTimeout(() => {
          addLog("result", "nil");
        }, 50);
      }

      setInput("");
    },
    [addLog]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      executeCommand(input);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = historyIndex < history.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIndex);
        setInput(history[history.length - 1 - newIndex] || "");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(history[history.length - 1 - newIndex] || "");
      } else {
        setHistoryIndex(-1);
        setInput("");
      }
    }
  };

  const filteredLogs = filter
    ? logs.filter((l) => l.message.toLowerCase().includes(filter.toLowerCase()))
    : logs;

  const downloadLogs = () => {
    const content = logs
      .map((l) => `${l.timestamp} ${levelStyles[l.level].prefix} ${l.message}`)
      .join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `element-console-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-panel">
      {/* Header with tabs */}
      <div className="flex items-center justify-between px-3 py-2 bg-pressed border-b border-white/5">
        <div className="flex items-center gap-1">
          <Icon d={ICON_TERMINAL} size={14} className="text-logic mr-2" />
          {(["console", "log"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={[
                "px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded transition-colors",
                activeTab === tab
                  ? "bg-surface text-text-primary shadow-[inset_2px_2px_6px_rgba(0,0,0,0.4)]"
                  : "text-text-secondary hover:text-text-primary hover:bg-white/5",
              ].join(" ")}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "log" && (
            <>
              <input
                type="text"
                placeholder="Filter..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-24 bg-pressed text-[10px] px-2 py-1 rounded border border-white/10 text-text-primary placeholder:text-text-dim"
              />
              <NeuToggle
                active={autoScroll}
                onChange={setAutoScroll}
                color="teal"
              />
              <span className="text-[9px] text-text-secondary">Auto</span>
            </>
          )}
          <NeuButton size="sm" onClick={() => setLogs([])}>
            <Icon d={ICON_CLEAR} size={12} />
          </NeuButton>
          <NeuButton size="sm" onClick={downloadLogs}>
            <Icon d={ICON_DOWNLOAD} size={12} />
          </NeuButton>
        </div>
      </div>

      {/* Log output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 bg-[#131317]"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-[10px] text-text-dim text-center py-8 uppercase tracking-widest">
            {activeTab === "console"
              ? "Lua console ready. Type 'help' for commands."
              : "No log entries yet."}
          </div>
        ) : (
          filteredLogs.map((entry) => <LogLine key={entry.id} entry={entry} />)
        )}
      </div>

      {/* Input area (console tab only) */}
      {activeTab === "console" && (
        <div className="flex items-center gap-2 px-3 py-2 bg-pressed border-t border-white/5">
          <span className="text-logic font-mono text-[11px]">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter Lua command..."
            className="flex-1 bg-transparent text-[11px] font-mono text-text-primary placeholder:text-text-dim focus:outline-none"
            autoFocus
          />
          <NeuButton size="sm" onClick={() => executeCommand(input)}>
            <Icon d={ICON_PLAY} size={12} />
          </NeuButton>
        </div>
      )}
    </div>
  );
}
