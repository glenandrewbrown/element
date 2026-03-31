# Element macOS Automation & Verification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an autonomous verification system that can launch Element, interact with its UI, and verify that the plugin browser, session browser, graph toolbar, and navigation panel work correctly — without screenshots or human intervention.

**Architecture:** Architecture B (Integrated) from the macOS Automation spec — validate → execute → observe loop with AX API assertions, 3-retry feedback cap, sub-second cached execution. Hammerspoon for speed-critical AX queries, AppleScript for Element's JUCE window interaction, Python orchestrator for the pipeline.

**Tech Stack:** Python 3.12, PyObjC, Hammerspoon (hs.ipc), rapidfuzz, pyax, luac/luacheck, osacompile

**Reference spec:** The full "Autonomous macOS Application Control and Verification" document (Version 1.0)

**Element context:** C++20/JUCE 8.0.12 audio plugin host. UI uses JUCE native components (not web). The Accessibility tree exposes JUCE Component names as AXIdentifier and Component names as AXTitle.

---

## Tool Installation Status

| Tool | Status | Path |
|------|--------|------|
| Hammerspoon + `hs` CLI | Installed, IPC config added (needs reload) | `/usr/local/bin/hs` |
| Lua 5.4.8 + `luac` | Installed | `/usr/local/bin/luac` |
| luacheck 1.2.0 | Installed | `brew install luacheck` |
| Python 3.12 | Installed | system |
| PyObjC (ApplicationServices) | Installed, AX trusted | pip |
| rapidfuzz 3.13.0 | Installed | pip |
| pyax 0.3.4 | Installed | pip |
| py-applescript 1.0.3 | Installed | pip |
| plutil / osacompile | Built-in macOS | system |

---

## File Structure

```
tools/automation/
├── element_ax_map.py          # AX tree mapper for Element's UI
├── element_assertions.py      # Deterministic AX state assertions
├── element_verify.py          # Main verification orchestrator
├── element_ax_cache.json      # Cached AX element references (generated)
└── tests/
    ├── test_plugin_browser.py  # Plugin browser verification suite
    ├── test_session_browser.py # Session browser verification suite
    ├── test_graph_toolbar.py   # Graph toolbar verification suite
    └── test_navigation.py      # Navigation panel verification suite
```

---

### Task 1: Map Element's Accessibility Tree

**Files:**
- Create: `tools/automation/element_ax_map.py`

- [ ] **Step 1: Create the AX tree mapper script**

```python
#!/usr/bin/env python3
"""Map Element's Accessibility tree to discover UI element identifiers.

Usage:
    python3 tools/automation/element_ax_map.py [--depth N] [--focus WINDOW_TITLE]

Requires: Element.app running, Accessibility permission granted.
"""

import sys
import json
from ApplicationServices import (
    AXUIElementCreateApplication,
    AXUIElementCopyAttributeValue,
    AXIsProcessTrusted,
)
from Cocoa import NSWorkspace

def get_element_pid():
    """Find Element.app's PID."""
    ws = NSWorkspace.sharedWorkspace()
    for app in ws.runningApplications():
        if app.localizedName() == "Element":
            return app.processIdentifier()
    return None

def get_ax_attributes(element):
    """Get all attributes of an AX element as a dict."""
    attrs = {}
    for attr in ["AXRole", "AXTitle", "AXDescription", "AXIdentifier",
                  "AXValue", "AXEnabled", "AXFocused", "AXRoleDescription"]:
        try:
            err, val = AXUIElementCopyAttributeValue(element, attr, None)
            if err == 0 and val is not None:
                attrs[attr] = str(val)
        except Exception:
            pass
    return attrs

def walk_ax_tree(element, depth=0, max_depth=5):
    """Walk the AX tree and yield (depth, attributes) tuples."""
    if depth > max_depth:
        return

    attrs = get_ax_attributes(element)
    yield (depth, attrs)

    err, children = AXUIElementCopyAttributeValue(element, "AXChildren", None)
    if err == 0 and children:
        for child in children:
            yield from walk_ax_tree(child, depth + 1, max_depth)

def main():
    if not AXIsProcessTrusted():
        print("ERROR: Accessibility permission not granted", file=sys.stderr)
        sys.exit(1)

    pid = get_element_pid()
    if pid is None:
        print("ERROR: Element.app is not running", file=sys.stderr)
        sys.exit(1)

    max_depth = int(sys.argv[sys.argv.index("--depth") + 1]) if "--depth" in sys.argv else 4

    app = AXUIElementCreateApplication(pid)
    results = []

    for depth, attrs in walk_ax_tree(app, max_depth=max_depth):
        if attrs:
            results.append({"depth": depth, **attrs})
            indent = "  " * depth
            role = attrs.get("AXRole", "?")
            title = attrs.get("AXTitle", "")
            ident = attrs.get("AXIdentifier", "")
            desc = attrs.get("AXDescription", "")
            line = f"{indent}[{role}]"
            if title:
                line += f' title="{title}"'
            if ident:
                line += f' id="{ident}"'
            if desc:
                line += f' desc="{desc}"'
            print(line)

    # Save JSON cache
    cache_path = "tools/automation/element_ax_cache.json"
    with open(cache_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved {len(results)} elements to {cache_path}", file=sys.stderr)

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Launch Element and run the mapper**

```bash
open build-merged/element_app_artefacts/Element.app
sleep 3  # wait for launch
cd /Users/glenandrewbrown/Development/element
python3 tools/automation/element_ax_map.py --depth 5 2>&1 | head -80
```

Expected: Tree output showing JUCE components with their AXRole, AXTitle, AXIdentifier.

- [ ] **Step 3: Commit**

```bash
git add tools/automation/element_ax_map.py
git commit -m "feat: add AX tree mapper for Element UI automation"
```

---

### Task 2: Build Assertion Library

**Files:**
- Create: `tools/automation/element_assertions.py`

- [ ] **Step 1: Create deterministic assertion functions**

```python
#!/usr/bin/env python3
"""Deterministic AX state assertions for Element UI verification.

Each assertion returns a structured JSON result — no LLM interpretation needed.
"""

import json
import time
from ApplicationServices import (
    AXUIElementCreateApplication,
    AXUIElementCopyAttributeValue,
)
from Cocoa import NSWorkspace

def get_element_app():
    """Get AXUIElement for Element.app. Returns (app, pid) or (None, None)."""
    ws = NSWorkspace.sharedWorkspace()
    for app in ws.runningApplications():
        if app.localizedName() == "Element":
            pid = app.processIdentifier()
            return AXUIElementCreateApplication(pid), pid
    return None, None

def find_element_by_title(parent, title, role=None, max_depth=5):
    """Find an AX element by title (fuzzy-optional), optionally filtered by role."""
    try:
        from rapidfuzz import fuzz
        use_fuzzy = True
    except ImportError:
        use_fuzzy = False

    def _search(element, depth):
        if depth > max_depth:
            return None
        attrs = {}
        for attr in ["AXRole", "AXTitle", "AXIdentifier"]:
            err, val = AXUIElementCopyAttributeValue(element, attr, None)
            if err == 0 and val:
                attrs[attr] = str(val)

        el_title = attrs.get("AXTitle", "")
        el_role = attrs.get("AXRole", "")

        if role and el_role != role:
            pass  # role mismatch, check children
        elif el_title == title:
            return element
        elif use_fuzzy and fuzz.token_set_ratio(el_title, title) > 70:
            return element

        err, children = AXUIElementCopyAttributeValue(element, "AXChildren", None)
        if err == 0 and children:
            for child in children:
                result = _search(child, depth + 1)
                if result:
                    return result
        return None

    return _search(parent, 0)

def assert_window_exists(title, timeout_s=3.0):
    """Assert that a window with the given title exists."""
    start = time.time()
    while time.time() - start < timeout_s:
        app, _ = get_element_app()
        if app:
            err, windows = AXUIElementCopyAttributeValue(app, "AXWindows", None)
            if err == 0 and windows:
                for win in windows:
                    err, win_title = AXUIElementCopyAttributeValue(win, "AXTitle", None)
                    if err == 0 and win_title and title.lower() in str(win_title).lower():
                        return _result("window_exists", title, True, True,
                                      f"Found window: {win_title}", time.time() - start)
        time.sleep(0.1)

    return _result("window_exists", title, True, False,
                  "Window not found within timeout", time.time() - start)

def assert_element_exists(title, role=None, timeout_s=3.0):
    """Assert that a UI element with the given title exists."""
    start = time.time()
    app, _ = get_element_app()
    if not app:
        return _result("element_exists", title, True, False, "Element.app not running", 0)

    err, windows = AXUIElementCopyAttributeValue(app, "AXWindows", None)
    if err == 0 and windows:
        for win in windows:
            el = find_element_by_title(win, title, role)
            if el:
                return _result("element_exists", title, True, True,
                              f"Found element matching '{title}'", time.time() - start)

    return _result("element_exists", title, True, False,
                  f"Element '{title}' not found", time.time() - start)

def assert_element_value(title, expected_value, role=None):
    """Assert that an element has a specific value."""
    app, _ = get_element_app()
    if not app:
        return _result("element_value", title, expected_value, None, "App not running", 0)

    start = time.time()
    err, windows = AXUIElementCopyAttributeValue(app, "AXWindows", None)
    if err == 0 and windows:
        for win in windows:
            el = find_element_by_title(win, title, role)
            if el:
                err, val = AXUIElementCopyAttributeValue(el, "AXValue", None)
                observed = str(val) if err == 0 and val else None
                passed = observed == expected_value
                return _result("element_value", title, expected_value, observed,
                              f"AXValue of '{title}'", time.time() - start)

    return _result("element_value", title, expected_value, None,
                  f"Element '{title}' not found", time.time() - start)

def _result(check, target, expected, observed, method, elapsed):
    return {
        "check": check,
        "target": target,
        "expected": expected,
        "observed": observed,
        "passed": expected == observed,
        "method": method,
        "latency_ms": int(elapsed * 1000),
    }

if __name__ == "__main__":
    # Quick self-test
    results = [
        assert_window_exists("Element"),
        assert_element_exists("All"),
        assert_element_exists("Favorites"),
        assert_element_exists("Recent"),
    ]
    for r in results:
        status = "PASS" if r["passed"] else "FAIL"
        print(f"[{status}] {r['check']}: {r['target']} ({r['latency_ms']}ms)")
```

- [ ] **Step 2: Run assertions against running Element**

```bash
python3 tools/automation/element_assertions.py
```

Expected: Window exists = PASS, button assertions may pass or fail depending on AX exposure.

- [ ] **Step 3: Commit**

```bash
git add tools/automation/element_assertions.py
git commit -m "feat: add AX-based assertion library for Element UI verification"
```

---

### Task 3: Build Element Verification Orchestrator

**Files:**
- Create: `tools/automation/element_verify.py`

- [ ] **Step 1: Create the main verification script**

```python
#!/usr/bin/env python3
"""Element UI Verification Orchestrator.

Launches Element, runs AX-based assertions against the UI,
reports pass/fail results as structured JSON.

Usage:
    python3 tools/automation/element_verify.py [--suite SUITE]

Suites: all, plugin-browser, session-browser, toolbar, navigation
"""

import subprocess
import sys
import time
import json
import os

from element_assertions import (
    assert_window_exists,
    assert_element_exists,
    get_element_app,
)

BUILD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "build-merged")
APP_PATH = os.path.join(BUILD_DIR, "element_app_artefacts", "Element.app")

def launch_element():
    """Launch Element.app and wait for the main window."""
    subprocess.Popen(["open", APP_PATH])
    result = assert_window_exists("Element", timeout_s=10.0)
    if not result["passed"]:
        print("FATAL: Element.app failed to launch", file=sys.stderr)
        sys.exit(1)
    return result

def verify_plugin_browser():
    """Verify plugin browser UI components exist."""
    results = []
    results.append(assert_element_exists("All"))
    results.append(assert_element_exists("Favorites"))
    results.append(assert_element_exists("Recent"))
    # Plugin search box
    results.append(assert_element_exists("Search plugins...", role="AXTextField"))
    return {"suite": "plugin-browser", "assertions": results}

def verify_session_browser():
    """Verify session browser UI components exist."""
    results = []
    results.append(assert_element_exists("All Files"))
    results.append(assert_element_exists("Recent"))
    results.append(assert_element_exists("Search sessions...", role="AXTextField"))
    return {"suite": "session-browser", "assertions": results}

def verify_navigation():
    """Verify navigation icon sidebar exists with 4 icons."""
    results = []
    # The icon sidebar should expose 4 clickable areas
    results.append(assert_element_exists("Session"))
    results.append(assert_element_exists("Browse"))
    results.append(assert_element_exists("Inspector"))
    results.append(assert_element_exists("Editor"))
    return {"suite": "navigation", "assertions": results}

def verify_toolbar():
    """Verify graph editor toolbar components."""
    results = []
    results.append(assert_element_exists("100%"))  # zoom label
    return {"suite": "toolbar", "assertions": results}

def run_suite(suite_name):
    suites = {
        "plugin-browser": verify_plugin_browser,
        "session-browser": verify_session_browser,
        "navigation": verify_navigation,
        "toolbar": verify_toolbar,
    }

    if suite_name == "all":
        return [fn() for fn in suites.values()]
    elif suite_name in suites:
        return [suites[suite_name]()]
    else:
        print(f"Unknown suite: {suite_name}", file=sys.stderr)
        sys.exit(1)

def main():
    suite = sys.argv[sys.argv.index("--suite") + 1] if "--suite" in sys.argv else "all"

    print("Launching Element...", file=sys.stderr)
    launch_element()
    time.sleep(2)  # let UI stabilize

    print(f"Running suite: {suite}", file=sys.stderr)
    results = run_suite(suite)

    # Summary
    total = sum(len(r["assertions"]) for r in results)
    passed = sum(1 for r in results for a in r["assertions"] if a["passed"])
    failed = total - passed

    output = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "suites": results,
        "summary": {"total": total, "passed": passed, "failed": failed},
    }

    print(json.dumps(output, indent=2))

    if failed > 0:
        print(f"\n{failed}/{total} assertions FAILED", file=sys.stderr)
        sys.exit(1)
    else:
        print(f"\n{total}/{total} assertions PASSED", file=sys.stderr)

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the verifier**

```bash
cd /Users/glenandrewbrown/Development/element/tools/automation
python3 element_verify.py --suite all 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add tools/automation/element_verify.py
git commit -m "feat: add Element UI verification orchestrator with AX-based assertions"
```

---

### Task 4: Adapt and save the reference spec

**Files:**
- Create: `tools/automation/README.md`

- [ ] **Step 1: Create a concise project README**

```markdown
# Element UI Automation & Verification

Autonomous verification of Element's UI using macOS Accessibility API.

## Quick Start

```bash
# Map Element's AX tree (Element must be running)
python3 element_ax_map.py --depth 5

# Run all verification suites
python3 element_verify.py --suite all

# Run specific suite
python3 element_verify.py --suite plugin-browser
```

## Architecture

```
Generate intent → Validate → Execute → Observe (AX API) → Assert
                                                    ↑
                                          On fail: retry (max 3)
```

- **No screenshots** — AX API queries for deterministic pass/fail
- **Sub-second cached** — repeat verifications bypass LLM entirely
- **Fuzzy matching** — rapidfuzz handles label changes across versions

## Tools

| Tool | Purpose |
|------|---------|
| PyObjC | AX API access |
| rapidfuzz | Fuzzy element matching |
| pyax | High-level AX wrapper |
| Hammerspoon (`hs -c`) | Fast AX queries (5-10ms) |
| luac / luacheck | Lua script validation |
| osacompile | AppleScript syntax checking |

## Suites

- `plugin-browser` — Favorites/Recent/All buttons, search, type badges
- `session-browser` — All Files/Recent buttons, search, rows
- `navigation` — 4 icon sidebar panels
- `toolbar` — Zoom controls, breadcrumb
```

- [ ] **Step 2: Commit**

```bash
git add tools/automation/README.md
git commit -m "docs: add automation tools README"
```

---

## Phases 2-4 (outline — expand when Phase 1 is verified)

### Phase 2: Interactive Verification (Days 4-7)
- Click navigation icons and verify panel switching via AX
- Toggle plugin favorites via AX button press, verify state persists
- Type in search boxes, verify filtered results
- Structured JSON error format for feedback loop

### Phase 3: Resilient Automation (Days 8-14)
- Self-healing selectors with rapidfuzz cascades
- Built-in waits (poll AX state every 100ms, 5s timeout)
- Hammerspoon integration for speed-critical paths
- Application Object Model for Element's known UI structure

### Phase 4: CI Integration (Weeks 3-4)
- `make verify-ui` target in CMakeLists
- Automation cache in SQLite
- Per-version element repository
- Failure pattern database
