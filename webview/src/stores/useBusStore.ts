import { create } from "zustand";
import type { CableData, SignalType } from "../data/types";

/**
 * Wireless Patching (Phase 5B — blueprint §5/§7.2.8).
 *
 * A "wireless cable" is an ordinary edge in the graph whose visual curve is
 * suppressed and replaced with a named-bus badge at each port (e.g.
 * "Reverb Send A"). The underlying engine connection is unaffected — wireless
 * is purely a UX rendering convention to declutter dense boards.
 *
 * Persistence model
 * -----------------
 * The bus name is held client-side in this store, keyed by cable id. The
 * native bridge (`nativeGraphSetCableBus`) fires a best-effort persistence
 * call so the engine can later round-trip the value, but the canonical
 * source of truth for *visual* wireless state is this store. This survives
 * snapshot rebuilds from `hydrateFromEngine` because edges keep their ids.
 *
 * Bus colours
 * -----------
 * Colour is signal-type driven (audio blue / midi teal / cv orange) — the
 * same palette used by drawn cables — so a wireless cable looks like a
 * "named version" of the same cable, not a new visual primitive.
 */

interface BusState {
  /** cableId → bus name (case-preserved). */
  cableBus: Record<string, string>;
}

interface BusActions {
  /** Assign a cable to a named bus. Pass `undefined` to clear (back to wired). */
  setBusForCable: (cableId: string, busName: string | undefined) => void;
  /** Rename every cable currently on `from` to `to`. No-op if names equal. */
  renameBus: (from: string, to: string) => void;
  /** Wipe all wireless flags (e.g. on engine reset). */
  clearAll: () => void;
  /** Read-through helper — `undefined` means wired. */
  getBusForCable: (cableId: string) => string | undefined;
}

type BusStore = BusState & BusActions;

export const useBusStore = create<BusStore>()((set, get) => ({
  cableBus: {},

  setBusForCable: (cableId, busName) =>
    set((s) => {
      const next = { ...s.cableBus };
      const trimmed = busName?.trim();
      if (trimmed && trimmed.length > 0) next[cableId] = trimmed;
      else delete next[cableId];
      return { cableBus: next };
    }),

  renameBus: (from, to) =>
    set((s) => {
      const f = from.trim();
      const t = to.trim();
      if (!f || !t || f === t) return s;
      const next: Record<string, string> = {};
      for (const [id, name] of Object.entries(s.cableBus))
        next[id] = name === f ? t : name;
      return { cableBus: next };
    }),

  clearAll: () => set({ cableBus: {} }),

  getBusForCable: (cableId) => get().cableBus[cableId],
}));

// ── Selectors ──

export const selectCableBusMap = (s: BusStore) => s.cableBus;

/** True when this cable should render as wireless. */
export const selectIsCableWireless = (cableId: string) => (s: BusStore) =>
  Boolean(s.cableBus[cableId]);

/** Bus name for a cable, or `undefined` if wired. */
export const selectBusName = (cableId: string) => (s: BusStore) =>
  s.cableBus[cableId];

// ── Bus list derivation ──

export interface BusEntry {
  /** Bus display name (canonical case). */
  name: string;
  /** Dominant signal type — drives badge colour. */
  signalType: SignalType;
  /** Cable ids on this bus. */
  cableIds: string[];
  /** Endpoints — every (block, port) the bus touches. */
  endpoints: Array<{
    blockId: string;
    portId: string;
    direction: "source" | "target";
  }>;
}

/**
 * Derive the active bus list from the live cable list + the cable→bus map.
 *
 * Buses with zero cables (e.g. the source cable was deleted) are pruned so
 * the inspector never shows ghosts.
 */
export function deriveBuses(
  cables: CableData[],
  cableBus: Record<string, string>,
): BusEntry[] {
  const byName = new Map<string, BusEntry>();
  for (const cable of cables) {
    const busName = cableBus[cable.id];
    if (!busName) continue;
    let entry = byName.get(busName);
    if (!entry) {
      entry = {
        name: busName,
        signalType: cable.signalType,
        cableIds: [],
        endpoints: [],
      };
      byName.set(busName, entry);
    }
    entry.cableIds.push(cable.id);
    entry.endpoints.push(
      { blockId: cable.source, portId: cable.sourcePort, direction: "source" },
      { blockId: cable.target, portId: cable.targetPort, direction: "target" },
    );
  }
  return Array.from(byName.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/**
 * Suggest the next default bus name when a user toggles wireless on a cable
 * with no name yet. Picks "Bus 1", "Bus 2", … skipping any already in use.
 */
export function suggestBusName(existing: Iterable<string>): string {
  const used = new Set<string>();
  for (const name of existing) used.add(name.toLowerCase());
  for (let i = 1; i < 1000; ++i) {
    const candidate = `Bus ${i}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return "Bus";
}
