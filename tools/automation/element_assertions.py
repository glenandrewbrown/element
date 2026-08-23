#!/usr/bin/env python3
"""
element_assertions.py -- Deterministic AX-based assertions for verifying Element's UI state.

Provides functions to locate and verify UI elements using macOS Accessibility APIs
with fuzzy matching via rapidfuzz. Every assertion returns a structured result dict.

Usage:
    import element_assertions
    result = element_assertions.assert_window_exists("Element")

    # Or run directly for a self-test:
    python3 element_assertions.py
"""

import json
import time
from typing import Any, Optional

import ApplicationServices as AppSvc
from Cocoa import NSWorkspace
from rapidfuzz import fuzz


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_FUZZY_THRESHOLD = 70


def _ax_attr(element, attr: str):
    """Read a single AX attribute, returning None on any error."""
    err, value = AppSvc.AXUIElementCopyAttributeValue(element, attr, None)
    if err == 0:
        return value
    return None


def _matches_title(element, title: str) -> bool:
    """Check AXTitle, AXIdentifier, and AXDescription for a fuzzy match."""
    for attr in ("AXTitle", "AXIdentifier", "AXDescription"):
        val = _ax_attr(element, attr)
        if val and isinstance(val, str):
            if fuzz.token_set_ratio(val, title) >= _FUZZY_THRESHOLD:
                return True
    return False


def _matches_role(element, role: Optional[str]) -> bool:
    """If a role filter is given, check AXRole matches exactly."""
    if role is None:
        return True
    ax_role = _ax_attr(element, "AXRole")
    return ax_role == role


def _collect_windows(ax_app):
    """
    Gather all accessible windows from the app.

    JUCE apps may return an empty AXWindows list but still expose windows via
    AXMainWindow and AXFocusedWindow. This helper merges all three sources and
    de-duplicates by object identity.
    """
    seen_ids = set()
    windows = []

    def _add(win):
        if win is None:
            return
        obj_id = id(win)
        if obj_id not in seen_ids:
            seen_ids.add(obj_id)
            windows.append(win)

    # Standard list
    ax_windows = _ax_attr(ax_app, "AXWindows")
    if ax_windows:
        for w in ax_windows:
            _add(w)

    # Fallbacks for JUCE-style apps
    _add(_ax_attr(ax_app, "AXMainWindow"))
    _add(_ax_attr(ax_app, "AXFocusedWindow"))

    return windows


# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------


def get_element_app():
    """Return (AXUIElement, pid) for Element.app, or (None, None) if not running."""
    workspace = NSWorkspace.sharedWorkspace()
    for app in workspace.runningApplications():
        name = app.localizedName()
        if name and "Element" in name:
            pid = app.processIdentifier()
            ax_app = AppSvc.AXUIElementCreateApplication(pid)
            return (ax_app, pid)
    return (None, None)


def find_element_by_title(parent, title: str, role: Optional[str] = None, max_depth: int = 5):
    """
    BFS search for an AX element whose title/identifier/description fuzzy-matches *title*.
    Optionally filter by AXRole. Returns the element or None.
    """
    if parent is None:
        return None

    queue = [(parent, 0)]
    while queue:
        current, depth = queue.pop(0)
        if depth > max_depth:
            continue

        if _matches_title(current, title) and _matches_role(current, role):
            return current

        children = _ax_attr(current, "AXChildren")
        if children:
            for child in children:
                queue.append((child, depth + 1))

    return None


def assert_window_exists(title: str, timeout_s: float = 3.0) -> dict:
    """Poll until a window with a fuzzy-matching title is found or timeout."""
    start = time.time()
    while time.time() - start < timeout_s:
        ax_app, _ = get_element_app()
        if ax_app is not None:
            windows = _collect_windows(ax_app)
            for win in windows:
                win_title = _ax_attr(win, "AXTitle")
                if win_title and isinstance(win_title, str):
                    if fuzz.token_set_ratio(win_title, title) >= _FUZZY_THRESHOLD:
                        latency = (time.time() - start) * 1000
                        return {
                            "check": "window_exists",
                            "target": title,
                            "expected": True,
                            "observed": True,
                            "passed": True,
                            "method": "AXWindows search",
                            "latency_ms": round(latency, 1),
                        }
        time.sleep(0.1)

    latency = (time.time() - start) * 1000
    return {
        "check": "window_exists",
        "target": title,
        "expected": True,
        "observed": False,
        "passed": False,
        "method": "AXWindows search",
        "latency_ms": round(latency, 1),
    }


def assert_element_exists(title: str, role: Optional[str] = None, timeout_s: float = 3.0) -> dict:
    """Poll for an element existing anywhere in the app's window tree."""
    start = time.time()
    while time.time() - start < timeout_s:
        ax_app, _ = get_element_app()
        if ax_app is not None:
            for win in _collect_windows(ax_app):
                found = find_element_by_title(win, title, role=role)
                if found is not None:
                    latency = (time.time() - start) * 1000
                    return {
                        "check": "element_exists",
                        "target": title,
                        "expected": True,
                        "observed": True,
                        "passed": True,
                        "method": "BFS AXChildren search",
                        "latency_ms": round(latency, 1),
                    }
        time.sleep(0.1)

    latency = (time.time() - start) * 1000
    return {
        "check": "element_exists",
        "target": title,
        "expected": True,
        "observed": False,
        "passed": False,
        "method": "BFS AXChildren search",
        "latency_ms": round(latency, 1),
    }


def assert_element_value(title: str, expected_value: Any, role: Optional[str] = None) -> dict:
    """Find element by title, read its AXValue, compare to expected."""
    start = time.time()
    ax_app, _ = get_element_app()
    observed = None
    found = False

    if ax_app is not None:
        for win in _collect_windows(ax_app):
            elem = find_element_by_title(win, title, role=role)
            if elem is not None:
                found = True
                observed = _ax_attr(elem, "AXValue")
                break

    latency = (time.time() - start) * 1000

    if not found:
        return {
            "check": "element_value",
            "target": title,
            "expected": expected_value,
            "observed": None,
            "passed": False,
            "method": "AXValue read (element not found)",
            "latency_ms": round(latency, 1),
        }

    passed = observed == expected_value
    return {
        "check": "element_value",
        "target": title,
        "expected": expected_value,
        "observed": observed,
        "passed": passed,
        "method": "AXValue read",
        "latency_ms": round(latency, 1),
    }


def assert_element_enabled(title: str, expected: bool = True, role: Optional[str] = None) -> dict:
    """Check AXEnabled attribute of the element matching title."""
    start = time.time()
    ax_app, _ = get_element_app()
    observed = None
    found = False

    if ax_app is not None:
        for win in _collect_windows(ax_app):
            elem = find_element_by_title(win, title, role=role)
            if elem is not None:
                found = True
                observed = _ax_attr(elem, "AXEnabled")
                break

    latency = (time.time() - start) * 1000

    if not found:
        return {
            "check": "element_enabled",
            "target": title,
            "expected": expected,
            "observed": None,
            "passed": False,
            "method": "AXEnabled read (element not found)",
            "latency_ms": round(latency, 1),
        }

    # AXEnabled can be an int (0/1) or bool; normalize
    if isinstance(observed, (int, float)):
        observed = bool(observed)

    passed = observed == expected
    return {
        "check": "element_enabled",
        "target": title,
        "expected": expected,
        "observed": observed,
        "passed": passed,
        "method": "AXEnabled read",
        "latency_ms": round(latency, 1),
    }


# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------

def _run_self_test():
    """Run quick assertions when executed as a script."""
    checks = []

    # 1. Window "Element" exists
    checks.append(assert_window_exists("Element", timeout_s=3.0))

    # 2. Look for plugin browser segmented control buttons
    for label in ("All", "Favorites", "Recent"):
        checks.append(assert_element_exists(label, timeout_s=2.0))

    # Print results
    for result in checks:
        status = "PASS" if result["passed"] else "FAIL"
        print(f"[{status}] {result['check']}: {result['target']} "
              f"(latency={result['latency_ms']}ms)")

    # Summary
    total = len(checks)
    passed = sum(1 for r in checks if r["passed"])
    print(f"\n{passed}/{total} checks passed.")

    if passed < total:
        print("\nFailed checks:")
        for r in checks:
            if not r["passed"]:
                print(f"  - {r['check']}: {r['target']} "
                      f"(expected={r['expected']}, observed={r['observed']})")


if __name__ == "__main__":
    _run_self_test()
