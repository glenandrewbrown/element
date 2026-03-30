#!/usr/bin/env python3
"""
element_verify.py -- UI verification orchestrator for Element.app.

Launches Element (if not running), runs AX-based assertion suites,
and outputs structured JSON results to stdout.

Usage:
    python3 element_verify.py --suite all
    python3 element_verify.py --suite plugin-browser
    python3 element_verify.py --suite session-browser
    python3 element_verify.py --suite navigation
    python3 element_verify.py --suite toolbar
"""

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Import assertion library from the same directory
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.dirname(__file__))
from element_assertions import (
    assert_window_exists,
    assert_element_exists,
    get_element_app,
    _collect_windows,
    _ax_attr,
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BUILD_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "build-merged"
)
APP_PATH = os.path.join(BUILD_DIR, "element_app_artefacts", "Element.app")

# ---------------------------------------------------------------------------
# Role-only assertion (for elements with no title, e.g. the search text area)
# ---------------------------------------------------------------------------

def assert_role_exists(role, description, timeout_s=3.0):
    """Poll for an element with a specific AXRole anywhere in the window tree."""
    start = time.time()
    while time.time() - start < timeout_s:
        ax_app, _ = get_element_app()
        if ax_app is not None:
            for win in _collect_windows(ax_app):
                queue = [(win, 0)]
                while queue:
                    current, depth = queue.pop(0)
                    if depth > 5:
                        continue
                    if _ax_attr(current, "AXRole") == role:
                        latency = (time.time() - start) * 1000
                        return {
                            "check": "element_exists",
                            "target": description,
                            "expected": True,
                            "observed": True,
                            "passed": True,
                            "method": f"BFS role search ({role})",
                            "latency_ms": round(latency, 1),
                        }
                    children = _ax_attr(current, "AXChildren")
                    if children:
                        for child in children:
                            queue.append((child, depth + 1))
        time.sleep(0.1)

    latency = (time.time() - start) * 1000
    return {
        "check": "element_exists",
        "target": description,
        "expected": True,
        "observed": False,
        "passed": False,
        "method": f"BFS role search ({role})",
        "latency_ms": round(latency, 1),
    }


def assert_value_contains(substring, description, timeout_s=3.0):
    """Poll for an element whose AXValue contains the given substring."""
    start = time.time()
    while time.time() - start < timeout_s:
        ax_app, _ = get_element_app()
        if ax_app is not None:
            for win in _collect_windows(ax_app):
                queue = [(win, 0)]
                while queue:
                    current, depth = queue.pop(0)
                    if depth > 5:
                        continue
                    val = _ax_attr(current, "AXValue")
                    if val and isinstance(val, str) and substring in val:
                        latency = (time.time() - start) * 1000
                        return {
                            "check": "element_exists",
                            "target": description,
                            "expected": True,
                            "observed": True,
                            "passed": True,
                            "method": f"BFS AXValue search ('{substring}')",
                            "latency_ms": round(latency, 1),
                        }
                    children = _ax_attr(current, "AXChildren")
                    if children:
                        for child in children:
                            queue.append((child, depth + 1))
        time.sleep(0.1)

    latency = (time.time() - start) * 1000
    return {
        "check": "element_exists",
        "target": description,
        "expected": True,
        "observed": False,
        "passed": False,
        "method": f"BFS AXValue search ('{substring}')",
        "latency_ms": round(latency, 1),
    }


# ---------------------------------------------------------------------------
# Suite definitions
# ---------------------------------------------------------------------------
SUITES = ["plugin-browser", "session-browser", "navigation", "toolbar"]


def _ensure_element_running():
    """Launch Element.app if it is not already running. Returns the startup check result."""
    ax_app, _ = get_element_app()
    if ax_app is not None:
        return {
            "check": "launch",
            "target": "Element.app",
            "passed": True,
            "detail": "already running",
            "latency_ms": 0,
        }

    if not os.path.isdir(APP_PATH):
        return {
            "check": "launch",
            "target": "Element.app",
            "passed": False,
            "detail": f"app bundle not found at {APP_PATH}",
            "latency_ms": 0,
        }

    subprocess.Popen(["open", APP_PATH])
    result = assert_window_exists("Element", timeout_s=10.0)
    return {
        "check": "launch",
        "target": "Element.app",
        "passed": result["passed"],
        "detail": "launched" if result["passed"] else "failed to appear after launch",
        "latency_ms": result["latency_ms"],
    }


# ---------------------------------------------------------------------------
# Suite runners
# ---------------------------------------------------------------------------


def _run_plugin_browser():
    """Verify plugin browser panel elements: All, Favorites, Recent buttons + search box."""
    checks = []
    for label in ("All", "Favorites", "Recent"):
        checks.append(assert_element_exists(label, role="AXButton", timeout_s=3.0))
    checks.append(assert_role_exists("AXTextArea", "Search box (text entry area)", timeout_s=3.0))
    return checks


def _run_session_browser():
    """Verify session browser panel elements: All Files, Recent buttons + search box."""
    checks = []
    for label in ("All Files", "Recent"):
        checks.append(assert_element_exists(label, role="AXButton", timeout_s=3.0))
    checks.append(assert_role_exists("AXTextArea", "Search box (text entry area)", timeout_s=3.0))
    return checks


def _run_navigation():
    """Verify the navigation panel buttons exist."""
    checks = []
    # Element exposes "Plugins" and "Sessions" as sidebar nav buttons,
    # plus "view" for the view switcher and "Graph" in the window title.
    for label in ("Plugins", "Sessions", "view", "Graph"):
        checks.append(assert_element_exists(label, timeout_s=3.0))
    return checks


def _run_toolbar():
    """Verify toolbar status bar labels exist."""
    checks = []
    # Element's status bar uses AXStaticText with AXValue (not AXTitle).
    checks.append(assert_value_contains("Device:", "Status bar device label", timeout_s=3.0))
    return checks


SUITE_RUNNERS = {
    "plugin-browser": _run_plugin_browser,
    "session-browser": _run_session_browser,
    "navigation": _run_navigation,
    "toolbar": _run_toolbar,
}

# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


def run_suites(suite_names):
    """Run the requested suites and return the full results dict."""
    timestamp = datetime.now(timezone.utc).isoformat()
    overall_start = time.time()

    # Ensure Element is running
    launch_result = _ensure_element_running()
    if not launch_result["passed"]:
        return {
            "timestamp": timestamp,
            "launch": launch_result,
            "suites": {},
            "summary": {"total": 0, "passed": 0, "failed": 0, "result": "BLOCKED"},
            "elapsed_s": round(time.time() - overall_start, 2),
        }

    suite_results = {}
    total_checks = 0
    total_passed = 0

    for name in suite_names:
        runner = SUITE_RUNNERS[name]
        checks = runner()
        suite_passed = sum(1 for c in checks if c["passed"])
        suite_total = len(checks)
        total_checks += suite_total
        total_passed += suite_passed

        suite_results[name] = {
            "checks": checks,
            "passed": suite_passed,
            "total": suite_total,
            "result": "PASS" if suite_passed == suite_total else "FAIL",
        }

    total_failed = total_checks - total_passed
    overall_result = "PASS" if total_failed == 0 else "FAIL"

    return {
        "timestamp": timestamp,
        "launch": launch_result,
        "suites": suite_results,
        "summary": {
            "total": total_checks,
            "passed": total_passed,
            "failed": total_failed,
            "result": overall_result,
        },
        "elapsed_s": round(time.time() - overall_start, 2),
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Element UI verification orchestrator"
    )
    parser.add_argument(
        "--suite",
        type=str,
        default="all",
        choices=["all"] + SUITES,
        help="Which suite to run (default: all)",
    )
    args = parser.parse_args()

    if args.suite == "all":
        suite_names = list(SUITES)
    else:
        suite_names = [args.suite]

    results = run_suites(suite_names)
    print(json.dumps(results, indent=2))

    sys.exit(0 if results["summary"]["result"] in ("PASS",) else 1)


if __name__ == "__main__":
    main()
