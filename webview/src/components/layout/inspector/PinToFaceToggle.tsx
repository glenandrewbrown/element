import { NeuToggle } from "../../neu/NeuToggle";

/**
 * PinToFaceToggle — the per-param "📌 pin to Block face" control (Wave-3 Task 3.E,
 * left-panel brief §3.3 / §6 Phase E).
 *
 * A THIN wrapper over the existing {@link NeuToggle} that reframes the Block's
 * `hiddenParams` substrate as a *positive* "pinned" affordance for the Inspector:
 *
 *   pinned (toggle ON)  = the param is SURFACED on the Block's Macro tier
 *                         (i.e. NOT in `hiddenParams`)
 *   unpinned (toggle OFF) = the param is hidden from the Macro face
 *                         (i.e. present in `hiddenParams`)
 *
 * The inversion lives in the CALLER (InspectorHub maps `pinned = !hiddenSet.has(id)`
 * and persists the FULL hidden set via `useGraphStore.setHiddenParams`, exactly as
 * `ParamConfigPopover` does) so this component stays a pure presentational toggle —
 * it never touches the store, never re-derives a name, and renders nothing
 * fabricated.
 *
 * NOTHING-fake (Glen's hard rule): the pin affordance is only ever rendered for a
 * param that REALLY exists (a real Value/CV param port on the node). It surfaces
 * the param itself on the face — it does not invent a knob, a value, or a slot.
 *
 * Accessibility: NeuToggle is a `role="switch"` with `aria-checked`; we layer a
 * descriptive `aria-label` ("Pin <param> to Block face" / "Unpin …") via a
 * wrapping group so screen-reader users hear WHAT the switch governs, and a
 * 📌 glyph (decorative, `aria-hidden`) gives the sighted, at-a-glance cue the
 * brief's wireframe specifies. The 📌 is a LABEL glyph next to the switch — the
 * control itself is the neumorphic NeuToggle (no new icon-allowlist entry).
 */
export interface PinToFaceToggleProps {
  /** True when the param is currently surfaced on the Block face (pinned). */
  pinned: boolean;
  /** Called with the NEXT pinned state when the user toggles the pin. */
  onChange: (pinned: boolean) => void;
  /**
   * Human param name (the real port label) — woven into the accessible label so
   * the switch announces what it pins. Required: an unlabelled pin toggle is an
   * a11y failure.
   */
  label: string;
  /**
   * Accent hue for the active (pinned) track. These params are Value/CV ports,
   * so the honest default is `orange` (the Value/CV signal colour) — matching
   * `ParamConfigPopover`'s amber LED and the orange "▸ N params" lane on the
   * Block. Override only with a real reason.
   */
  color?: "blue" | "orange" | "teal";
  /** Optional className appended to the wrapping control group. */
  className?: string;
}

export function PinToFaceToggle({
  pinned,
  onChange,
  label,
  color = "orange",
  className = "",
}: PinToFaceToggleProps) {
  const switchLabel = pinned
    ? `Unpin ${label} from Block face`
    : `Pin ${label} to Block face`;
  return (
    <span
      role="group"
      aria-label={switchLabel}
      className={["inline-flex items-center gap-1 shrink-0", className].join(" ")}
    >
      {/* 📌 — decorative at-a-glance pin cue (brief wireframe). Dims when the
          param is not pinned so the lit/unlit state reads without colour alone. */}
      <span
        aria-hidden
        className="text-[10px] leading-none select-none transition-opacity duration-150"
        style={{ opacity: pinned ? 1 : 0.4 }}
        title={pinned ? "Pinned to Block face" : "Pin to Block face"}
      >
        📌
      </span>
      {/* The switch carries its OWN accessible name (not just the wrapping
          group) so AT announces what it governs when focused directly. */}
      <NeuToggle
        active={pinned}
        onChange={onChange}
        color={color}
        aria-label={switchLabel}
      />
    </span>
  );
}
