/**
 * Snapshot + behaviour tests for <EmptyState /> (Phase F.0.10).
 *
 * Per autonomy-execution-spec, "small subset is fine" — we cover four
 * representative size+tone combinations rather than the full 4×4 grid, plus
 * the structural a11y contract (role=status, aria-live, hidden illustration).
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../EmptyState";

describe("<EmptyState />", () => {
  it("renders title with role=status and aria-live=polite", () => {
    render(<EmptyState title="No plugins yet" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status).toHaveTextContent("No plugins yet");
  });

  it("renders description and CTA when provided (md / neutral)", () => {
    const { container } = render(
      <EmptyState
        title="No plugins yet"
        description="Drag a plugin from the browser to get started."
        action={<button type="button">Add Plugin</button>}
      />,
    );
    expect(screen.getByText(/Drag a plugin/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Plugin" }),
    ).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders a string illustration as a hidden <img> with the registry path", () => {
    render(
      <EmptyState illustration="no-plugins" title="No plugins yet" size="sm" />,
    );
    const img = screen.getByRole("status").querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("aria-hidden")).toBe("true");
    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.getAttribute("src")).toBe("/illustrations/no-plugins.webp");
    expect(img?.getAttribute("width")).toBe("64"); // sm token
  });

  it("renders a ReactNode illustration with aria-hidden wrapper (lg / audio)", () => {
    const { container } = render(
      <EmptyState
        illustration={<svg data-testid="custom-svg" />}
        title="No connections"
        size="lg"
        tone="audio"
      />,
    );
    const wrapper = container
      .querySelector("svg")
      ?.closest("[aria-hidden='true']");
    expect(wrapper).not.toBeNull();
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders sm size with cv tone correctly", () => {
    const { container } = render(
      <EmptyState
        title="No CV input"
        description="Connect a CV source."
        size="sm"
        tone="cv"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders lg size with midi tone correctly", () => {
    const { container } = render(
      <EmptyState title="No MIDI" size="lg" tone="midi" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
