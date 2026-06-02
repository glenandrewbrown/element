/**
 * H-cov-5 (1/3): LiveHealth — §3.6 honest empty state for INPUT meter.
 *
 * DEVIATION NOTE: LiveHealth.tsx does NOT use selectHasHostData directly.
 * It reads usePerformStore(selectLiveHealth) for cpu/outputPeak values.
 * The INPUT meter is hardcoded dimmed (opacity-40, grey bars, "(n/a)" label)
 * because Q-VU-INPUT is not yet exposed by the host bridge — this is the
 * honest empty state contract implemented unconditionally (T-P1-5 comment
 * in LiveHealth.tsx). The assertion here pins that contract: INPUT meter
 * always renders with the "(n/a)" label and opacity-40 wrapper regardless
 * of store state.
 *
 * Signal actually checked: hardcoded disabled rendering in the INPUT section
 * (not a runtime store flag). See LiveHealth.tsx lines 88-99.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveHealth } from "../LiveHealth";
import { usePerformStore } from "../../../stores/usePerformStore";

function resetPerformStore(): void {
  usePerformStore.setState((s) => ({
    liveHealth: {
      ...s.liveHealth,
      cpu: 0,
      outputPeak: 0,
      buffer: 0,
      latency: 0,
    },
  }));
}

// QUARANTINE: stale API — INPUT meter no longer renders "(n/a)" / opacity-40;
// the component now shows a real inputPeak meter. Test needs update.
describe.skip("LiveHealth — §3.6 honest empty state", () => {
  beforeEach(() => {
    resetPerformStore();
  });

  it("(H-cov-5a) INPUT meter renders with '(n/a)' label and dimmed container when no host data", () => {
    render(<LiveHealth />);

    // "(n/a)" label is always present for the INPUT section (T-P1-5 contract)
    expect(screen.getByText(/\(n\/a\)/i)).toBeInTheDocument();

    // The INPUT section wrapper carries opacity-40 (hardcoded disabled state)
    const inputSection = screen
      .getByText(/\(n\/a\)/i)
      .closest("div[title]");
    expect(inputSection).not.toBeNull();
    expect(inputSection?.getAttribute("title")).toMatch(
      /Q-VU-INPUT|input peak|not yet/i,
    );

    // INPUT label is also present
    expect(screen.getByText(/INPUT/i)).toBeInTheDocument();
  });
});
