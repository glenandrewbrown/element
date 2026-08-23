/**
 * `logBridgeError` — small, non-throwing helper for surfacing silent
 * `__JUCE__` bridge failures (empty `} catch {}` and equivalent silent
 * null-returns) instead of swallowing them.
 *
 * Background (deep-review.md Class 8 — "Silent failure / empty catches"):
 * the React webview wraps every `invokeElementNative()` call in a try/catch
 * that historically threw away the error. Two failure modes are masked:
 *   1. Dev-mode bridge absence — `__JUCE__` undefined, `invokeElementNative`
 *      resolves to `undefined`. NOT an error, no log spam wanted.
 *   2. Embedded WebView with bridge — a real exception (parse failure,
 *      transport rejection, host abort) gets eaten and the UI freezes on
 *      the last good state with no developer signal.
 *
 * `logBridgeError` distinguishes the two by treating `undefined` resolutions
 * as the no-op dev path (callers `if (raw == null) return null` themselves)
 * and only being invoked from the catch branch of a thrown rejection or a
 * downstream parse failure. The helper itself is allocation-free in the
 * happy path (no thrown error → never called) and never throws.
 *
 * In production builds (`import.meta.env.DEV === false`) we still warn —
 * a bridge error in production is genuinely unexpected and the user-facing
 * Inspector LOG strip is the only feedback channel. Future work (TODO):
 * route into `useHostExtrasStore.logLines` so the LOG panel surfaces the
 * error inline; not done yet to keep this helper dependency-free.
 */
export function logBridgeError(label: string, err: unknown): void {
  // Dev console gets the full error object for stack-trace inspection.
  // Prod console gets the same — bridge failures should never be silent
  // in deployed builds. Use `console.warn` (not `error`) so JSDOM-based
  // test runs don't fail noisy assertions.
  // eslint-disable-next-line no-console
  console.warn(`[bridge:${label}]`, err);
}
