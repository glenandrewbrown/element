/**
 * Suppress the host WebView's native context menu (WKWebView "Reload" etc.).
 *
 * JUCE 8's WebBrowserComponent exposes no Options API to disable the native
 * context menu (verified element_webview_host.cpp:1094-1125), so suppression
 * must happen in JS. A capture-phase listener on `document` calls
 * `preventDefault()` BEFORE any element handler — that alone kills the native
 * menu. Propagation is deliberately left intact so React's synthetic
 * `onContextMenu` handlers (pane / node / edge menus in GraphCanvas) still
 * fire and open the intentional custom menus.
 *
 * Carve-out: editable targets (input / textarea / contenteditable) keep the
 * native menu — on WKWebView that is the text-editing menu (Cut/Copy/Paste),
 * not the page "Reload" menu.
 *
 * Only installed when running inside the JUCE host (window.__JUCE__ present)
 * so Storybook / dev-browser sessions keep right-click → Inspect Element.
 */

const EDITABLE_SELECTOR = "input, textarea, [contenteditable='true']";

/** True when the webview is hosted inside JUCE (same detection as juceBackend.ts). */
export function isJuceHosted(w: Window = window): boolean {
  return Boolean((w as Window & { __JUCE__?: { backend?: unknown } }).__JUCE__?.backend);
}

/**
 * Install the capture-phase suppressor. Returns an uninstall function.
 * Idempotence is the caller's responsibility (main.tsx installs once at boot).
 */
export function installNativeContextMenuSuppressor(doc: Document = document): () => void {
  const handler = (e: Event) => {
    const target = e.target as Element | null;
    if (target && typeof target.closest === "function" && target.closest(EDITABLE_SELECTOR)) {
      return; // keep the native text-editing menu in editable fields
    }
    e.preventDefault();
  };
  doc.addEventListener("contextmenu", handler, { capture: true });
  return () => doc.removeEventListener("contextmenu", handler, { capture: true });
}

/** Boot hook: install only inside the JUCE host. Returns uninstall (or no-op). */
export function installIfJuceHosted(w: Window = window, doc: Document = document): () => void {
  if (!isJuceHosted(w)) return () => {};
  return installNativeContextMenuSuppressor(doc);
}
