// JUCE 8 webview backend bridge.
//
// JUCE 8 does NOT expose `window.__JUCE__.backend.invokeNativeFunction` —
// instead it ships a small JS helper (juce_gui_extra/native/javascript/
// index.js) that wraps the backend event channel:
//
//   1. JS creates a promise with a `resultId`.
//   2. emits `__juce__invoke` with {name, params, resultId} on the backend.
//   3. C++ side dispatches to the matching `withNativeFunction` handler.
//   4. Handler calls its `completion(var)` argument.
//   5. JUCE C++ wrapper emits `__juce__complete` with {promiseId, result}.
//   6. JS resolves the matching promise.
//
// We re-implement that handshake here so we don't have to import the JUCE
// shim (which lives in the JUCE source tree, not in the npm graph). The
// behaviour is identical: callable native functions return a Promise that
// resolves to whatever C++ passed to `completion(...)`.

// `addEventListener` actually returns a `[eventId, id]` tuple in JUCE 8;
// we don't depend on that return value, so the loose `unknown` is fine.
type BackendEvent = {
  addEventListener: (name: string, cb: (payload: unknown) => void) => unknown;
  removeEventListener?: (handle: unknown) => void;
  emitEvent: (name: string, payload: unknown) => void;
};

type JuceWindow = {
  __JUCE__?: {
    backend?: BackendEvent;
  };
};

function getBackend(): BackendEvent | undefined {
  const w = window as unknown as JuceWindow;
  return w.__JUCE__?.backend;
}

let nextPromiseId = 0;
type PendingEntry = {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};
const pendingPromises: Map<number, PendingEntry> = new Map();
let listenerWired = false;

// Drop a bridge call that the host never answers (host not ready, graph
// reload mid-call, host crash) so its Map entry cannot leak for the whole
// session. We RESOLVE `undefined` rather than reject: that matches the
// no-bridge contract callers already handle and avoids unhandled-rejection
// noise on fire-and-forget `void invokeElementNative(...)` paths.
const PENDING_TIMEOUT_MS = 15000;
// Belt-and-suspenders cap in case a burst out-runs the timeouts.
const MAX_PENDING = 4096;

function settlePending(id: number, value: unknown): void {
  const entry = pendingPromises.get(id);
  if (entry == null) return;
  pendingPromises.delete(id);
  clearTimeout(entry.timer);
  entry.resolve(value);
}

function wireCompletionListener(backend: BackendEvent): void {
  if (listenerWired) return;
  listenerWired = true;
  backend.addEventListener("__juce__complete", (payload: unknown) => {
    if (payload == null || typeof payload !== "object") return;
    const obj = payload as { promiseId?: unknown; result?: unknown };
    if (typeof obj.promiseId !== "number") return;
    settlePending(obj.promiseId, obj.result);
  });
}

/** Call a C++ `withNativeFunction` handler. Returns whatever C++ passed to
 *  its `completion` callback. Resolves to `undefined` in pure Vite dev (no
 *  JUCE bridge present). */
export async function invokeElementNative(
  name: string,
  args: unknown[] = [],
): Promise<unknown> {
  const backend = getBackend();
  if (backend == null || typeof backend.emitEvent !== "function") {
    return undefined;
  }
  wireCompletionListener(backend);
  const promiseId = nextPromiseId++;
  const promise = new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => settlePending(promiseId, undefined), PENDING_TIMEOUT_MS);
    pendingPromises.set(promiseId, { resolve, reject, timer });
    // Evict the oldest (lowest id, Map preserves insertion order) if the
    // queue grows past the cap before timeouts fire.
    if (pendingPromises.size > MAX_PENDING) {
      const oldest = pendingPromises.keys().next().value;
      if (typeof oldest === "number" && oldest !== promiseId)
        settlePending(oldest, undefined);
    }
  });
  backend.emitEvent("__juce__invoke", {
    name,
    params: args,
    resultId: promiseId,
  });
  return promise;
}
