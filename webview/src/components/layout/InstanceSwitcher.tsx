// U11 — InstanceSwitcher (Toolbar right-cluster control).
//
// Lists the OTHER live Element plugin instances in this host process and lets
// the user open a read-only Mirror of one. "Instance" = an Element
// PluginProcessor in the same host OS process (true when a DAW loads 2+ Element
// instances).
//
// NOTHING fake: every row comes from the real C++ registry payload. In the
// standalone app / single-instance host (`instances.length <= 1`) the control
// renders an honest DISABLED "1×" pill with no dropdown — it never invents
// peer instances. Selecting a peer sets the mirror target; the MirrorPanel
// (mounted in AppShell) shows that peer's live graph read-only.
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  useInstancesStore,
  selectOtherInstances,
  selectHasMultipleInstances,
  selectMirrorTargetId,
} from "../../stores/useInstancesStore";
import { Icon } from "../neu";

export function InstanceSwitcher() {
  const others = useInstancesStore(useShallow(selectOtherInstances));
  const hasMultiple = useInstancesStore(selectHasMultipleInstances);
  const mirrorTargetId = useInstancesStore(selectMirrorTargetId);
  const setMirrorTarget = useInstancesStore((s) => s.setMirrorTarget);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Honest single-instance state: disabled "1×" pill, no dropdown. This is the
  // standalone app AND the single-Element-in-a-host case — never fabricated.
  if (!hasMultiple) {
    return (
      <button
        type="button"
        disabled
        aria-label="Only this Element instance is running"
        title="Only this Element instance is running"
        className="flex items-center gap-1 h-7 px-2 rounded-[5px] neu-raised bg-surface text-[10px] uppercase tracking-wider text-text-secondary opacity-50 cursor-default t-precision"
      >
        <Icon name="Layers" size={12} aria-hidden />
        <span className="tabular-nums">1×</span>
      </button>
    );
  }

  const peerCount = others.length;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Element instances — ${peerCount} other${peerCount === 1 ? "" : "s"}`}
        title={`${peerCount} other Element instance${peerCount === 1 ? "" : "s"} — mirror a peer's board`}
        className={`flex items-center gap-1 h-7 px-2 rounded-[5px] neu-raised bg-surface text-[10px] uppercase tracking-wider t-precision ${
          mirrorTargetId != null
            ? "text-accent-blue"
            : "text-text-secondary hover:text-text-primary"
        }`}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="Layers" size={12} aria-hidden />
        <span className="tabular-nums">{peerCount + 1}×</span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Element instances"
          className="absolute right-0 top-[calc(100%+4px)] z-[60] min-w-[200px] rounded-[6px] neu-raised bg-panel p-1 flex flex-col gap-0.5"
        >
          <div className="px-2 py-1 text-[9px] uppercase tracking-widest text-text-dim">
            Mirror an instance
          </div>
          {others.map((inst) => {
            const active = inst.id === mirrorTargetId;
            return (
              <button
                key={inst.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={`flex items-center gap-2 px-2 h-7 rounded-[4px] text-[11px] text-left t-precision ${
                  active
                    ? "neu-pressed-shallow bg-pressed text-accent-blue"
                    : "text-text-secondary hover:text-text-primary hover:bg-elevated"
                }`}
                onClick={() => {
                  setMirrorTarget(inst.id);
                  setOpen(false);
                }}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    inst.hasGraph ? "bg-accent-blue" : "bg-text-dim/40"
                  }`}
                  aria-hidden
                />
                <span className="flex-1 truncate normal-case tracking-normal">
                  {inst.name}
                </span>
                <span className="text-[9px] text-text-dim tabular-nums">
                  #{inst.id}
                </span>
              </button>
            );
          })}
          {mirrorTargetId != null ? (
            <button
              type="button"
              role="menuitem"
              className="flex items-center gap-2 px-2 h-7 rounded-[4px] text-[11px] text-left text-text-secondary hover:text-text-primary hover:bg-elevated t-precision normal-case tracking-normal"
              onClick={() => {
                setMirrorTarget(null);
                setOpen(false);
              }}
            >
              <Icon name="X" size={11} aria-hidden />
              Close mirror
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default InstanceSwitcher;
