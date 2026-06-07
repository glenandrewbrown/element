import { useEffect, useRef, useState } from "react";
import {
  nativeSessionNew,
  nativeSessionOpen,
  nativeSessionSave,
  nativeSessionSaveAs,
  nativeSessionSaveNamed,
} from "../../bridge/nativeSession";
import {
  useSessionStore,
  selectSavedAtMs,
  selectSessionFilePath,
} from "../../stores/useSessionStore";

/** Project file-name shown next to the save actions. */
function sessionDisplayName(filePath: string, dirty: boolean): string {
  if (!filePath || filePath.length === 0)
    return dirty ? "Untitled •" : "Untitled";
  const base = filePath.replace(/^.*[/\\]/, "");
  const stem = base.replace(/\.els$/i, "");
  return dirty ? `${stem} •` : stem;
}

/**
 * Save cluster for the toolbar (4b — E6 named-save + G3 save-pulse).
 *
 * - "Save" on a NEVER-NAMED project opens an INLINE in-app name field (NOT an OS
 *   file chooser) → `nativeSessionSaveNamed`; once named, Save is silent
 *   (`nativeSessionSave`).
 * - "As…" stays an explicit save-as (the native chooser is acceptable there).
 * - On a successful autosave / silent save the host bumps `session.savedAtMs`;
 *   we render a brief non-modal "Saved" pulse near the project name (~2s fade),
 *   never a dialog. This is what makes silent saving trustworthy.
 */
export function SaveControl() {
  const filePath = useSessionStore(selectSessionFilePath);
  const dirty = useSessionStore((s) => s.dirty);
  const savedAtMs = useSessionStore(selectSavedAtMs);

  const [naming, setNaming] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [pulse, setPulse] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ignore the very first savedAtMs we observe (hydration), only pulse on a real
  // INCREASE after mount so we don't flash on load.
  const lastSavedRef = useRef<number | null>(null);

  useEffect(() => {
    if (lastSavedRef.current === null) {
      lastSavedRef.current = savedAtMs;
      return;
    }
    if (savedAtMs > lastSavedRef.current) {
      lastSavedRef.current = savedAtMs;
      setPulse(true);
      if (pulseTimerRef.current !== null) clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = setTimeout(() => {
        setPulse(false);
        pulseTimerRef.current = null;
      }, 2000);
    }
  }, [savedAtMs]);

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current !== null) clearTimeout(pulseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (naming) nameRef.current?.focus();
  }, [naming]);

  const isNamed = filePath.length > 0;

  const handleSave = () => {
    if (isNamed) {
      void nativeSessionSave(); // silent overwrite, no dialog
    } else {
      // Never named — open the inline name field (no OS dialog).
      setNameInput("");
      setNaming(true);
    }
  };

  const commitName = async () => {
    const trimmed = nameInput.trim();
    if (trimmed.length === 0) {
      setNaming(false);
      return;
    }
    const ok = await nativeSessionSaveNamed(trimmed);
    if (ok) setNaming(false);
    // if !ok, leave the field open so the user can retry or press Esc
  };

  return (
    <>
      {/* File actions — pressed segmented well (neu-pressed-shallow) */}
      <div className="flex items-center rounded-[5px] overflow-hidden neu-pressed-shallow bg-pressed">
        <button
          type="button"
          className="px-2 h-7 text-[10px] font-semibold uppercase tracking-wider text-text-secondary hover:text-text-primary hover:bg-elevated transition-colors t-precision"
          title="New Project"
          onClick={() => void nativeSessionNew()}
        >
          New
        </button>
        <button
          type="button"
          className="px-2 h-7 text-[10px] font-semibold uppercase tracking-wider text-text-secondary hover:text-text-primary hover:bg-elevated transition-colors t-precision"
          title="Open Project…"
          onClick={() => void nativeSessionOpen()}
        >
          Open
        </button>
        <button
          type="button"
          className="px-2 h-7 text-[10px] font-semibold uppercase tracking-wider text-text-secondary hover:text-text-primary hover:bg-elevated transition-colors t-precision"
          title={isNamed ? "Save Project" : "Save Project (name it first)"}
          onClick={handleSave}
        >
          Save
        </button>
        <button
          type="button"
          className="px-2 h-7 text-[10px] font-semibold uppercase tracking-wider text-text-secondary hover:text-text-primary hover:bg-elevated transition-colors t-precision"
          title="Save Project As…"
          onClick={() => void nativeSessionSaveAs()}
        >
          As…
        </button>
      </div>

      {/* Inline name prompt (E6) — small in-app field, NOT an OS dialog. Traps
          keys so a keystroke never leaks to a global shortcut. */}
      {naming ? (
        <input
          ref={nameRef}
          type="text"
          value={nameInput}
          placeholder="Name this project…"
          aria-label="Project name"
          className="bg-pressed text-text-primary text-[11px] w-[160px] px-2 h-7 rounded-[5px] neu-pressed-shallow border-none outline-none focus:ring-1 focus:ring-accent-blue placeholder:text-text-dim"
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commitName();
            else if (e.key === "Escape") setNaming(false);
          }}
          onBlur={() => setNaming(false)}
        />
      ) : (
        <>
          {/* Active project file name + non-modal save-pulse (G3) */}
          <span
            className="text-[11px] text-accent-orange max-w-[150px] truncate"
            title={filePath || "No file on disk"}
          >
            {sessionDisplayName(filePath, dirty)}
          </span>
          <span
            role="status"
            aria-live="polite"
            className="text-[10px] font-semibold text-accent-teal transition-opacity duration-500 ease-out select-none"
            style={{ opacity: pulse ? 1 : 0 }}
          >
            {pulse ? "Saved ✓" : ""}
          </span>
        </>
      )}
    </>
  );
}
