import { invokeElementNative } from "./juceBackend";

/**
 * US-006: Virtual Keyboard bridge.
 *
 * Maps to AudioEngine::getKeyboardState() → juce::MidiKeyboardState.
 * noteOn/noteOff on MidiKeyboardState inject MIDI events directly into the
 * engine graph — confirmed in include/element/audioengine.hpp line 67.
 */

/**
 * Send a MIDI note-on event to the engine.
 * @param note     MIDI note number 0–127
 * @param velocity Normalised velocity 0.0–1.0
 * @param channel  MIDI channel 1–16
 */
export async function nativeVirtualKeyboardNoteOn(
  note: number,
  velocity: number,
  channel: number,
): Promise<boolean> {
  const r = await invokeElementNative("elementVirtualKeyboardNoteOn", [
    note,
    velocity,
    channel,
  ]);
  return r === true;
}

/**
 * Send a MIDI note-off event to the engine.
 * @param note    MIDI note number 0–127
 * @param channel MIDI channel 1–16
 */
export async function nativeVirtualKeyboardNoteOff(
  note: number,
  channel: number,
): Promise<boolean> {
  const r = await invokeElementNative("elementVirtualKeyboardNoteOff", [
    note,
    channel,
  ]);
  return r === true;
}
