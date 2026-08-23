#!/usr/bin/env python3
"""
qa2_runtime_suite.py — runtime verification suite for QA2 cycle 2 fixes.

Targets F-101, F-104, F-105, F-204. Uses element_assertions.py primitives.

Element.app must be running. Output is JSON to stdout, exit 0 = all pass,
1 = any fail.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
from element_assertions import (  # type: ignore[import-not-found]
    assert_window_exists,
    assert_element_exists,
    get_element_app,
    _collect_windows,
    _ax_attr,
)


# ── Helpers ──────────────────────────────────────────────────────────────────


def _bfs_walk(root, max_depth=8):
    """Yield all descendants up to max_depth."""
    queue = [(root, 0)]
    while queue:
        node, depth = queue.pop(0)
        yield node, depth
        if depth >= max_depth:
            continue
        children = _ax_attr(node, "AXChildren")
        if children:
            for c in children:
                queue.append((c, depth + 1))


def _all_buttons_with_titles(timeout_s=4.0):
    """Return list of (title, role) for every titled element in window tree."""
    start = time.time()
    found = []
    while time.time() - start < timeout_s:
        ax_app, _ = get_element_app()
        if ax_app is None:
            time.sleep(0.1)
            continue
        for win in _collect_windows(ax_app):
            for node, _depth in _bfs_walk(win):
                title = _ax_attr(node, "AXTitle")
                role = _ax_attr(node, "AXRole")
                if title and isinstance(title, str) and len(title) > 0:
                    found.append((title, role))
            if found:
                return found
        time.sleep(0.2)
    return found


def assert_no_demo_plugins(timeout_s=3.0):
    """F-101: confirm none of the demo-fallback names appear in the AX tree."""
    forbidden = (
        "OSCILLATOR_CORE_V3",
        "WAVETABLE_GEN",
        "LADDER_FILTER_24DB",
        "PEAK_LIMITER",
    )
    titles = _all_buttons_with_titles(timeout_s=timeout_s)
    leaked = [t for (t, _r) in titles for f in forbidden if f in t]
    return {
        "check": "demo_plugin_strings_absent",
        "target": "F-101 — pluginsDemoFallback removed",
        "expected": True,
        "observed": len(leaked) == 0,
        "passed": len(leaked) == 0,
        "method": "AX BFS scan for forbidden strings",
        "leaked_titles": leaked,
    }


def assert_tap_button_exists():
    """F-104: TAP button must still be reachable as AXButton."""
    return assert_element_exists("TAP", role="AXButton", timeout_s=3.0)


def assert_record_button_renders():
    """F-204: After build, expect Record button. With Lucide icon-only it
    surfaces as untitled AXButton, but the aria-label may be exposed via
    AXDescription on some macOS versions. Best-effort: scan for any
    AXButton whose AXRoleDescription or AXDescription contains "record".
    """
    start = time.time()
    timeout_s = 4.0
    while time.time() - start < timeout_s:
        ax_app, _ = get_element_app()
        if ax_app is None:
            time.sleep(0.2)
            continue
        for win in _collect_windows(ax_app):
            for node, _depth in _bfs_walk(win, max_depth=8):
                role = _ax_attr(node, "AXRole")
                if role != "AXButton":
                    continue
                desc = _ax_attr(node, "AXDescription") or ""
                title = _ax_attr(node, "AXTitle") or ""
                role_desc = _ax_attr(node, "AXRoleDescription") or ""
                pool = " ".join(
                    str(x).lower() for x in (desc, title, role_desc) if x
                )
                if "record" in pool:
                    return {
                        "check": "record_button_exists",
                        "target": "F-204 — Record button reachable",
                        "expected": True,
                        "observed": True,
                        "passed": True,
                        "method": "AX BFS for AXButton with 'record' in description/title",
                        "found_pool": pool,
                    }
        time.sleep(0.2)
    return {
        "check": "record_button_exists",
        "target": "F-204 — Record button reachable",
        "expected": True,
        "observed": False,
        "passed": False,
        "method": "AX BFS for AXButton with 'record' in description/title",
        "note": "Record button may exist in DOM but be opaque to AX (icon-only).",
    }


def assert_block_double_click_bridge_exists():
    """F-105: static check — confirm the bridge identifier appears in the
    built JS bundle so production webview will dispatch on double-click."""
    bundle_dir = os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
        "build-merged",
        "element_app_artefacts",
        "Element.app",
        "Contents",
        "Resources",
        "webview",
        "assets",
    )
    if not os.path.isdir(bundle_dir):
        # Try the source dist as fallback (still indicates webview is built)
        bundle_dir = os.path.join(
            os.path.dirname(__file__), "..", "..", "webview", "dist", "assets"
        )
    found = False
    if os.path.isdir(bundle_dir):
        for entry in os.listdir(bundle_dir):
            if not entry.endswith(".js"):
                continue
            with open(os.path.join(bundle_dir, entry), "rb") as fh:
                if b"elementPluginEditorOpen" in fh.read():
                    found = True
                    break
    return {
        "check": "plugin_editor_open_in_bundle",
        "target": "F-105 — elementPluginEditorOpen present in shipped JS",
        "expected": True,
        "observed": found,
        "passed": found,
        "method": "Filesystem scan of dist/ JS bundle for bridge identifier",
        "scanned_dir": bundle_dir,
    }


def click_tap_and_check_bpm_changes():
    """F-104 runtime: send AXPress to the TAP button several times via AX,
    then verify the AX tree's BPM static text mutated. This is best-effort —
    timing isn't precise enough to land an exact BPM but a change vs the
    starting value indicates the tap path executed.
    """
    start_bpm = _read_bpm_text()
    ax_app, _ = get_element_app()
    if ax_app is None:
        return {
            "check": "tap_changes_bpm",
            "target": "F-104 — clicking TAP changes BPM",
            "expected": True,
            "observed": False,
            "passed": False,
            "method": "Element.app not running",
        }
    tap_btn = None
    for win in _collect_windows(ax_app):
        for node, _depth in _bfs_walk(win, max_depth=6):
            if (
                _ax_attr(node, "AXRole") == "AXButton"
                and _ax_attr(node, "AXTitle") == "TAP"
            ):
                tap_btn = node
                break
        if tap_btn is not None:
            break
    if tap_btn is None:
        return {
            "check": "tap_changes_bpm",
            "target": "F-104 — clicking TAP changes BPM",
            "expected": True,
            "observed": False,
            "passed": False,
            "method": "AXButton title='TAP' not found",
        }
    import ApplicationServices as AppSvc  # type: ignore
    # Tap 4 times at ~120 BPM (500ms intervals)
    for i in range(4):
        AppSvc.AXUIElementPerformAction(tap_btn, "AXPress")
        time.sleep(0.5)
    time.sleep(0.5)
    end_bpm = _read_bpm_text()
    changed = start_bpm != end_bpm
    return {
        "check": "tap_changes_bpm",
        "target": "F-104 — clicking TAP changes BPM",
        "expected": True,
        "observed": changed,
        "passed": changed,
        "method": "AXPress x4 then compare BPM AXValue",
        "start_bpm": start_bpm,
        "end_bpm": end_bpm,
    }


def _read_bpm_text():
    """Walk AX tree, return AXValue of the first AXStaticText that looks
    like a BPM number (contains '.' and parses to a float between 20-999)."""
    ax_app, _ = get_element_app()
    if ax_app is None:
        return None
    for win in _collect_windows(ax_app):
        for node, _depth in _bfs_walk(win, max_depth=8):
            role = _ax_attr(node, "AXRole")
            if role != "AXStaticText":
                continue
            val = _ax_attr(node, "AXValue")
            if not val or not isinstance(val, str):
                continue
            try:
                parsed = float(val)
                if 20.0 <= parsed <= 999.0 and "." in val:
                    return val
            except ValueError:
                continue
    return None


def run_all():
    timestamp = datetime.now(timezone.utc).isoformat()
    overall_start = time.time()

    # Sanity: window exists
    launch = assert_window_exists("Element", timeout_s=8.0)

    checks = []
    checks.append(launch)
    checks.append(assert_no_demo_plugins())
    checks.append(assert_tap_button_exists())
    checks.append(assert_record_button_renders())
    checks.append(assert_block_double_click_bridge_exists())
    checks.append(click_tap_and_check_bpm_changes())

    total = len(checks)
    passed = sum(1 for c in checks if c["passed"])
    failed = total - passed

    return {
        "timestamp": timestamp,
        "checks": checks,
        "summary": {
            "total": total,
            "passed": passed,
            "failed": failed,
            "result": "PASS" if failed == 0 else "FAIL",
        },
        "elapsed_s": round(time.time() - overall_start, 2),
    }


if __name__ == "__main__":
    results = run_all()
    print(json.dumps(results, indent=2))
    sys.exit(0 if results["summary"]["result"] == "PASS" else 1)
