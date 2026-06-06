import { afterEach, describe, expect, it } from "vitest";
import {
  installIfJuceHosted,
  installNativeContextMenuSuppressor,
  isJuceHosted,
} from "../suppressNativeContextMenu";

function fireContextMenu(target: Element): MouseEvent {
  const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  return ev;
}

describe("suppressNativeContextMenu", () => {
  let uninstall: (() => void) | null = null;

  afterEach(() => {
    uninstall?.();
    uninstall = null;
    document.body.innerHTML = "";
  });

  it("prevents default on non-editable targets (kills the native menu)", () => {
    uninstall = installNativeContextMenuSuppressor();
    const ev = fireContextMenu(document.body);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("does NOT prevent default on input fields (native edit menu kept)", () => {
    uninstall = installNativeContextMenuSuppressor();
    const input = document.createElement("input");
    document.body.appendChild(input);
    expect(fireContextMenu(input).defaultPrevented).toBe(false);
  });

  it("does NOT prevent default on textarea or contenteditable", () => {
    uninstall = installNativeContextMenuSuppressor();
    const ta = document.createElement("textarea");
    const ce = document.createElement("div");
    ce.setAttribute("contenteditable", "true");
    document.body.append(ta, ce);
    expect(fireContextMenu(ta).defaultPrevented).toBe(false);
    expect(fireContextMenu(ce).defaultPrevented).toBe(false);
  });

  it("carves out children of editable containers (e.g. span inside contenteditable)", () => {
    uninstall = installNativeContextMenuSuppressor();
    const ce = document.createElement("div");
    ce.setAttribute("contenteditable", "true");
    const span = document.createElement("span");
    ce.appendChild(span);
    document.body.appendChild(ce);
    expect(fireContextMenu(span).defaultPrevented).toBe(false);
  });

  it("leaves propagation intact — element handlers still receive the event", () => {
    uninstall = installNativeContextMenuSuppressor();
    const div = document.createElement("div");
    document.body.appendChild(div);
    let received = false;
    div.addEventListener("contextmenu", () => {
      received = true;
    });
    fireContextMenu(div);
    expect(received).toBe(true);
  });

  it("uninstall removes the listener", () => {
    uninstall = installNativeContextMenuSuppressor();
    uninstall();
    uninstall = null;
    const ev = fireContextMenu(document.body);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("isJuceHosted detects the JUCE backend object", () => {
    const fakeJuce = { __JUCE__: { backend: {} } } as unknown as Window;
    const noJuce = {} as Window;
    expect(isJuceHosted(fakeJuce)).toBe(true);
    expect(isJuceHosted(noJuce)).toBe(false);
  });

  it("installIfJuceHosted is a no-op outside the JUCE host", () => {
    uninstall = installIfJuceHosted({} as Window);
    const ev = fireContextMenu(document.body);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("installIfJuceHosted installs inside the JUCE host", () => {
    const fakeJuce = { __JUCE__: { backend: {} } } as unknown as Window;
    uninstall = installIfJuceHosted(fakeJuce);
    const ev = fireContextMenu(document.body);
    expect(ev.defaultPrevented).toBe(true);
  });
});
