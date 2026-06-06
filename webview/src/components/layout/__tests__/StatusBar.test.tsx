/**
 * StatusBar tests — engine state indicator, CPU colouring, latency/buffer/
 * sampleRate display, and the isPlaying fallback (BUG-014 regression guard).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBar } from "../StatusBar";
import { usePerformStore } from "../../../stores/usePerformStore";
import { useEngineSnapshotStore } from "../../../stores/useEngineSnapshotStore";
import { useAppStore } from "../../../stores/useAppStore";

// Icon renders lucide SVG — stub it out so tests are shape-agnostic.
vi.mock("../../neu", () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

// ── helpers ──────────────────────────────────────────────────────────────────

function resetStores() {
  usePerformStore.setState((s) => ({
    ...s,
    isPlaying: false,
    liveHealth: {
      ...s.liveHealth,
      cpu: 0,
      buffer: 0,
      latency: 0,
      clock: "—",
      sampleRateLabel: "—",
      timecode: "",
    },
  }));
  useEngineSnapshotStore.setState((s) => ({
    ...s,
    engineRunning: false,
    hasHostData: false,
  }));
  useAppStore.setState({ canvasHint: null });
}

beforeEach(resetStores);

// ── engine state indicator ────────────────────────────────────────────────────

describe("engine state indicator", () => {
  it("shows STOPPED when engineRunning=false and isPlaying=false", () => {
    render(<StatusBar />);
    expect(screen.getByText("STOPPED")).toBeInTheDocument();
    expect(screen.queryByText("RUNNING")).not.toBeInTheDocument();
  });

  it("shows RUNNING when engineRunning=true", () => {
    useEngineSnapshotStore.setState((s) => ({
      ...s,
      engineRunning: true,
      hasHostData: true,
    }));
    render(<StatusBar />);
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
  });

  it("shows RUNNING when isPlaying=true and engineRunning=false (BUG-014 fallback)", () => {
    // BUG-014: StatusBar must fall back to usePerformStore.isPlaying when the
    // snapshot store hasn't received a push yet.
    usePerformStore.setState((s) => ({ ...s, isPlaying: true }));
    useEngineSnapshotStore.setState((s) => ({
      ...s,
      engineRunning: false,
      hasHostData: false,
    }));
    render(<StatusBar />);
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
  });

  it("aria-label reflects running state", () => {
    useEngineSnapshotStore.setState((s) => ({
      ...s,
      engineRunning: true,
      hasHostData: true,
    }));
    render(<StatusBar />);
    expect(
      screen.getByRole("status", { name: /engine running/i }),
    ).toBeInTheDocument();
  });

  it("aria-label reflects stopped state", () => {
    render(<StatusBar />);
    expect(
      screen.getByRole("status", { name: /engine stopped/i }),
    ).toBeInTheDocument();
  });
});

// ── device name display ───────────────────────────────────────────────────────

describe("device name", () => {
  it("shows 'Default Device' when clock is '—'", () => {
    render(<StatusBar />);
    expect(screen.getByText("Default Device")).toBeInTheDocument();
  });

  it("shows clock name when set", () => {
    usePerformStore.setState((s) => ({
      ...s,
      liveHealth: { ...s.liveHealth, clock: "Scarlett 2i2" },
    }));
    render(<StatusBar />);
    expect(screen.getByText("Scarlett 2i2")).toBeInTheDocument();
  });

  it("shows 'Default Device' when clock is empty string", () => {
    usePerformStore.setState((s) => ({
      ...s,
      liveHealth: { ...s.liveHealth, clock: "" },
    }));
    render(<StatusBar />);
    expect(screen.getByText("Default Device")).toBeInTheDocument();
  });
});

// ── sample rate / buffer ──────────────────────────────────────────────────────

describe("sample rate and buffer", () => {
  it("shows '—' for sample rate when not set", () => {
    render(<StatusBar />);
    // There should be a '—' next to SAMPLE label
    const sampleLabel = screen.getByText("SAMPLE");
    expect(sampleLabel.nextSibling?.textContent).toBe("—");
  });

  it("shows sampleRateLabel when set", () => {
    usePerformStore.setState((s) => ({
      ...s,
      liveHealth: { ...s.liveHealth, sampleRateLabel: "48.0 kHz" },
    }));
    render(<StatusBar />);
    expect(screen.getByText("48.0 kHz")).toBeInTheDocument();
  });

  it("shows buffer in samples when positive", () => {
    usePerformStore.setState((s) => ({
      ...s,
      liveHealth: { ...s.liveHealth, buffer: 256 },
    }));
    render(<StatusBar />);
    expect(screen.getByText("256 smp")).toBeInTheDocument();
  });

  it("shows '—' for buffer when 0", () => {
    render(<StatusBar />);
    const bufferLabel = screen.getByText("BUFFER");
    expect(bufferLabel.nextSibling?.textContent).toBe("—");
  });
});

// ── latency display ───────────────────────────────────────────────────────────

describe("latency display", () => {
  it("shows latency in ms when positive", () => {
    usePerformStore.setState((s) => ({
      ...s,
      liveHealth: { ...s.liveHealth, latency: 5.3 },
    }));
    render(<StatusBar />);
    expect(screen.getByText("5.3 ms")).toBeInTheDocument();
  });

  it("shows '—' when latency is 0", () => {
    render(<StatusBar />);
    const latencyLabel = screen.getByText("LATENCY");
    expect(latencyLabel.nextSibling?.textContent).toBe("—");
  });
});

// ── CPU colouring ─────────────────────────────────────────────────────────────

describe("CPU display", () => {
  it("renders 0.0% at rest", () => {
    render(<StatusBar />);
    expect(screen.getByText("0.0%")).toBeInTheDocument();
  });

  it("uses text-accent-teal class when cpu ≤ 50", () => {
    usePerformStore.setState((s) => ({
      ...s,
      liveHealth: { ...s.liveHealth, cpu: 30 },
    }));
    const { container } = render(<StatusBar />);
    // Multiple .text-accent-teal spans exist (latency too); find the one with '%'
    const cpuEl = Array.from(container.querySelectorAll(".text-accent-teal")).find(
      (el) => el.textContent?.includes("%"),
    );
    expect(cpuEl).toBeTruthy();
    expect(cpuEl?.textContent).toContain("30.0%");
  });

  it("uses text-accent-orange class when cpu 51–80", () => {
    usePerformStore.setState((s) => ({
      ...s,
      liveHealth: { ...s.liveHealth, cpu: 60 },
    }));
    const { container } = render(<StatusBar />);
    // Find the CPU span specifically (not the latency span which is also text-accent-teal)
    const spans = Array.from(container.querySelectorAll(".text-accent-orange"));
    const cpuSpan = spans.find((s) => s.textContent?.includes("%"));
    expect(cpuSpan).toBeTruthy();
  });

  it("uses text-error class when cpu > 80", () => {
    usePerformStore.setState((s) => ({
      ...s,
      liveHealth: { ...s.liveHealth, cpu: 90 },
    }));
    const { container } = render(<StatusBar />);
    const errorEl = container.querySelector(".text-error");
    expect(errorEl?.textContent).toContain("90.0%");
  });
});

// ── timecode display ──────────────────────────────────────────────────────────

describe("timecode", () => {
  it("shows fallback 00:00:00:00 when timecode not set", () => {
    render(<StatusBar />);
    expect(screen.getByText("00:00:00:00")).toBeInTheDocument();
  });

  it("shows timecode from health", () => {
    usePerformStore.setState((s) => ({
      ...s,
      liveHealth: { ...s.liveHealth, timecode: "01:02:03:04" },
    }));
    render(<StatusBar />);
    expect(screen.getByText("01:02:03:04")).toBeInTheDocument();
  });
});

// ── canvasHint (T3 — transient cable-drag coaching hint) ──────────────────────

describe("canvasHint", () => {
  it("renders the hint and HIDES the engine cluster when canvasHint is set", () => {
    useAppStore.setState({
      canvasHint: "Drop on a port to connect · hold ⌥ and release to add a block",
    });
    render(<StatusBar />);
    expect(
      screen.getByText(
        "Drop on a port to connect · hold ⌥ and release to add a block",
      ),
    ).toBeInTheDocument();
    // The left vitals cluster (engine RUNNING/STOPPED) is replaced while a hint
    // is showing.
    expect(screen.queryByText("STOPPED")).not.toBeInTheDocument();
    expect(screen.queryByText("RUNNING")).not.toBeInTheDocument();
  });

  it("shows the normal engine cluster when canvasHint is null", () => {
    useAppStore.setState({ canvasHint: null });
    render(<StatusBar />);
    expect(screen.getByText("STOPPED")).toBeInTheDocument();
  });
});
