type JuceBackend = {
  invokeNativeFunction?: (name: string, args: unknown[]) => Promise<unknown>;
};

function getJuceBackend(): JuceBackend | undefined {
  const root = window as unknown as { __JUCE__?: { backend?: JuceBackend } };
  return root.__JUCE__?.backend;
}

/** Call a C++ `withNativeFunction` from JUCE WebBrowser native integration (no-op in dev). */
export async function invokeElementNative(
  name: string,
  args: unknown[] = [],
): Promise<unknown> {
  const backend = getJuceBackend();
  if (typeof backend?.invokeNativeFunction === "function")
    return backend.invokeNativeFunction(name, args);
  return undefined;
}
