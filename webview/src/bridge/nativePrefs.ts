import { invokeElementNative } from "./juceBackend";
import type {
  AudioSetupSnapshot,
  OscHostSnapshot,
} from "../stores/useHostExtrasStore";

export async function nativeAudioApplySetup(
  setup: Partial<AudioSetupSnapshot>,
): Promise<boolean> {
  const r = await invokeElementNative("elementAudioApplySetup", [setup]);
  return r === true;
}

export async function nativeOscApplyHost(
  osc: OscHostSnapshot,
): Promise<boolean> {
  const r = await invokeElementNative("elementOscApplyHost", [
    osc.enabled,
    osc.port,
  ]);
  return r === true;
}

/**
 * G3c item 1: apply MIDI device changes (enable/disable inputs, set default
 * output) to the host MidiEngine. Mirrors nativeAudioApplySetup — the host
 * round-trips the snapshot so useHostExtrasStore.midiSetup reflects the result.
 *
 * C++ bridge: elementMidiApplySetup
 * arg[0] = { inputEnables?: [{identifier, enabled}], defaultOutputId?: string }
 */
export async function nativeMidiApplySetup(setup: {
  inputEnables?: Array<{ identifier: string; enabled: boolean }>;
  defaultOutputId?: string;
}): Promise<boolean> {
  const r = await invokeElementNative("elementMidiApplySetup", [setup]);
  return r === true;
}

export async function nativeMappingSetLearning(on: boolean): Promise<boolean> {
  const r = await invokeElementNative("elementMappingSetLearning", [on]);
  return r === true;
}

export async function nativeMappingRemoveMap(index: number): Promise<boolean> {
  const r = await invokeElementNative("elementMappingRemoveMap", [index]);
  return r === true;
}

export async function nativeWebDismissOverlay(): Promise<void> {
  await invokeElementNative("elementWebDismissOverlay", []);
}

export async function nativeOpenLuaConsole(): Promise<void> {
  await invokeElementNative("elementOpenLuaConsole", []);
}

export async function nativeOpenGraphMixer(): Promise<void> {
  await invokeElementNative("elementOpenGraphMixer", []);
}

/**
 * US-004: Hide (close visually) all open plugin editor windows.
 * Maps to GuiService::closeAllPluginWindows(true) — state is preserved,
 * windows can be re-opened from the node context menu.
 */
export async function nativeHideAllPluginWindows(): Promise<boolean> {
  const r = await invokeElementNative("elementHideAllPluginWindows", []);
  return r === true;
}

/**
 * Re-open editor windows for every node in the active graph that has an editor.
 * Iterates all nodes, calling GuiService::presentPluginWindow(node) for each
 * node where node.hasEditor() is true. Returns false if no active graph.
 */
export async function nativeHostShowAllPluginWindows(): Promise<boolean> {
  const r = await invokeElementNative("elementHostShowAllPluginWindows", []);
  return r === true;
}

/**
 * U9: Open the native key-command editor window.
 * Maps to GuiService::showKeymapEditorWindow() on the C++ side.
 * No-op-safe: resolves undefined when the JUCE bridge is absent (Vite dev).
 *
 * C++ bridge message name: "elementOpenKeymapEditor"
 * Handler shape: withNativeFunction("elementOpenKeymapEditor", [](var, auto complete) { complete({}); })
 */
export async function nativeOpenKeymapEditor(): Promise<void> {
  await invokeElementNative("elementOpenKeymapEditor", []);
}
