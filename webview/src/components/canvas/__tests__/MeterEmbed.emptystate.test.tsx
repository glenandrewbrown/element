/**
 * H-cov-5 (2/3): MeterEmbed — §3.6 honest empty state.
 *
 * DEVIATION NOTE: MeterEmbed (exported from BlockEmbed.tsx) does NOT use
 * selectHasHostData or any store. It is a pure presentational component that
 * accepts leftLevel/rightLevel/leftPeak/rightPeak props (all defaulting to 0).
 * The honest empty state is the default-props behaviour: with no live data
 * passed, all levels render as 0 (silent). This matches the §3.6 pattern:
 * "when no host data → disabled/honest rendering" — here expressed as
 * default-zero rendering rather than a store selector guard.
 *
 * We render MeterEmbed with no props and assert it displays the "L R" label
 * (confirming the component is present) with zero-height fill bars.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MeterEmbed } from "../BlockEmbed";

describe("MeterEmbed — §3.6 honest empty state", () => {
  it("(H-cov-5b) renders with default zero levels when no live data is passed", () => {
    const { container } = render(<MeterEmbed />);

    expect(screen.getByText("L R")).toBeInTheDocument();

    // Both level-fill divs should have height "0%" when no data is passed
    const fillDivs = container.querySelectorAll<HTMLElement>(
      "div[style*='height: 0%']",
    );
    expect(fillDivs.length).toBeGreaterThanOrEqual(2);
  });
});
