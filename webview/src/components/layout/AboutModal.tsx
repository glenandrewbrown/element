/**
 * F-9 (Phase F-block 2): About modal + check-updates UI.
 *
 * Visual chassis matches V3.0 Instrument Paradigm (neumorphic, no glass).
 * Copy reflects the native bridge contract: elementAppCheckForUpdates is
 * fire-and-forget — the host runs the actual updater check in a separate
 * native window (GuiService::checkUpdates). The web modal therefore tracks
 * three visible states:
 *
 *   idle      — initial render, "Check for updates" button is enabled
 *   checking  — the bridge call is in flight (very brief — the native
 *               handler is sync-ish)
 *   requested — the call resolved successfully; the native check window
 *               is now driving the result. We tell the user that.
 *
 * If the bridge throws (e.g. WebView2 not yet wired during scan), we render
 * an error state with a Retry affordance.
 *
 * Build number is intentionally NOT shown — AboutInfo only carries
 * { name, version, copyright }. Adding the build number requires a C++
 * change in element_webview_host.cpp (Team F-cpp scope), tracked via
 * .sisyphus/coordination.md.
 */

import { useEffect, useState } from "react";
import {
  nativeAppCheckForUpdates,
  nativeAppGetAbout,
  type AboutInfo,
} from "../../bridge/nativeApp";

type CheckStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "requested" }
  | { kind: "error"; message: string };

export interface AboutModalProps {
  /**
   * Called when the user dismisses the modal (Close button or ESC key). The
   * parent owns visibility — this component does not unmount itself.
   */
  onClose: () => void;
}

/**
 * Neumorphic "About Element" modal with a Check-for-updates affordance. Show it
 * from the app/Help menu when the user wants the Project's build version,
 * licence line, or to trigger the host's native updater. The bridge call is
 * fire-and-forget: the actual update result surfaces in a separate native
 * window, so the modal tracks idle / checking / requested / error states only.
 */
export function AboutModal({ onClose }: AboutModalProps) {
  const [info, setInfo] = useState<AboutInfo | null>(null);
  const [status, setStatus] = useState<CheckStatus>({ kind: "idle" });

  useEffect(() => {
    void nativeAppGetAbout().then(setInfo);
  }, []);

  // ESC dismisses (F-9 a11y parity with W-1 NeuPromptModal)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onCheckClick = () => {
    setStatus({ kind: "checking" });
    nativeAppCheckForUpdates()
      .then(() => setStatus({ kind: "requested" }))
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Update check failed.";
        setStatus({ kind: "error", message });
      });
  };

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-label="About Element"
    >
      <div className="w-[min(420px,92vw)] rounded-lg bg-surface shadow-[8px_8px_24px_rgba(0,0,0,0.5),-2px_-2px_8px_rgba(255,255,255,0.04)] border border-white/5 p-6 space-y-4">
        <div className="text-center space-y-1">
          <div className="text-lg font-black tracking-tighter text-text-primary">
            {info?.name ?? "Element"}
          </div>
          <div
            className="text-[11px] text-text-secondary tabular"
            data-testid="about-version"
          >
            Version {info?.version ?? "—"}
          </div>
        </div>
        <p className="text-[10px] text-text-dim text-center leading-relaxed">
          {info?.copyright ?? "GPL-3.0-or-later"}
        </p>

        <CheckStatusBanner status={status} />

        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            disabled={status.kind === "checking"}
            className="w-full py-2 rounded bg-elevated shadow-[-2px_-2px_8px_rgba(255,255,255,0.04),2px_2px_8px_rgba(0,0,0,0.35)] text-text-primary text-[11px] font-bold uppercase tracking-wide hover:bg-pressed transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={onCheckClick}
            data-testid="about-check-button"
          >
            {status.kind === "checking" ? "Checking…" : "Check for updates"}
          </button>
          <button
            type="button"
            className="w-full py-2 rounded bg-pressed text-text-secondary text-[11px] uppercase tracking-wide hover:text-text-primary transition-colors"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckStatusBanner({ status }: { status: CheckStatus }) {
  if (status.kind === "idle") return null;

  const tone =
    status.kind === "error"
      ? "text-error border-error/30 bg-error/10"
      : status.kind === "requested"
        ? "text-logic border-logic/30 bg-logic/10"
        : "text-text-secondary border-white/10 bg-pressed";

  const message =
    status.kind === "checking"
      ? "Checking for updates…"
      : status.kind === "requested"
        ? "Update check requested. Element will surface the result in a separate window."
        : status.message;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="about-status-banner"
      data-status={status.kind}
      className={`text-[10px] px-3 py-2 rounded border leading-relaxed ${tone}`}
    >
      {message}
    </div>
  );
}
