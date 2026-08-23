/**
 * Snapshot + behaviour tests for <Skeleton /> (Phase F.0.12).
 *
 * Covers each variant + the a11y contract (role, aria-live, sr-only label).
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Skeleton } from "../Skeleton";

describe("<Skeleton />", () => {
  it("renders the block variant with role=status and aria-live=polite", () => {
    const { container } = render(<Skeleton variant="block" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-label")).toBe("Loading");
    // SR-only label is present for assistive tech
    expect(status.querySelector(".sr-only")?.textContent).toBe("Loading");
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders the text variant with custom width", () => {
    const { container } = render(<Skeleton variant="text" width="60%" />);
    const status = screen.getByRole("status");
    expect((status as HTMLElement).style.width).toBe("60%");
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders the circle variant with custom size", () => {
    const { container } = render(<Skeleton variant="circle" size={40} />);
    const status = screen.getByRole("status");
    expect((status as HTMLElement).style.width).toBe("40px");
    expect((status as HTMLElement).style.height).toBe("40px");
    expect((status as HTMLElement).style.borderRadius).toBe("9999px");
    expect(container.firstChild).toMatchSnapshot();
  });

  it("defaults to block variant with width 100% and height 16", () => {
    const { container } = render(<Skeleton />);
    const status = container.querySelector("[role='status']") as HTMLElement;
    expect(status.style.width).toBe("100%");
    expect(status.style.height).toBe("16px");
  });

  it("accepts a custom aria-label override", () => {
    render(<Skeleton variant="text" aria-label="Loading plugins" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-label")).toBe("Loading plugins");
    expect(status.querySelector(".sr-only")?.textContent).toBe(
      "Loading plugins",
    );
  });
});
