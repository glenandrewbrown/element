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
