"""QA verdict layer — turn observations into machine-checkable pass/fail results.

Two kinds of verification:

  1. AX suites — wrap the repo's existing accessibility-tree checks
     (``tools/automation/element_verify.py``), which already emit JSON and a
     PASS/FAIL exit code. Needs a running Element + macOS AX permission.
  2. State assertions — compose process liveness, crash inference, log content,
     and ``.els``/``.elg`` structure into one verdict. No GUI scraping.

The point: an agent runs one ``verify`` call and gets a boolean it can trust,
instead of eyeballing the GUI.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import List, Optional

from ..utils import element_backend as backend
from . import app
from . import inspect as inspect_mod

AX_SUITES = [
    "plugin-browser", "session-browser", "navigation", "toolbar",
    "dashboard-builder", "command-palette", "bus-inspector", "virtual-keyboard",
]


def _verify_script() -> Optional[Path]:
    script = backend._repo_root() / "tools/automation/element_verify.py"
    return script if script.exists() else None


def run_ax_suite(suite: str = "all", timeout: float = 60.0) -> dict:
    """Run an accessibility verification suite against the running Element."""
    script = _verify_script()
    if script is None:
        return {"ok": False, "error": "tools/automation/element_verify.py not found",
                "hint": "AX verification requires the Element repo checkout"}
    if suite != "all" and suite not in AX_SUITES:
        return {"ok": False, "error": f"unknown suite '{suite}'",
                "available": ["all"] + AX_SUITES}
    try:
        proc = subprocess.run(
            [sys.executable, str(script), "--suite", suite],
            capture_output=True, text=True, timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"AX suite '{suite}' timed out after {timeout}s"}
    except (OSError, subprocess.SubprocessError) as exc:
        return {"ok": False, "error": str(exc)}

    parsed = None
    try:
        parsed = json.loads(proc.stdout)
    except (json.JSONDecodeError, ValueError):
        pass
    return {
        "ok": proc.returncode == 0,
        "suite": suite,
        "returncode": proc.returncode,
        "result": (parsed or {}).get("summary", {}).get("result") if parsed else None,
        "report": parsed,
        "stdout": proc.stdout if parsed is None else None,
        "stderr": proc.stderr or None,
    }


def assert_state(
    alive: Optional[bool] = None,
    no_crash: bool = False,
    log_contains: Optional[str] = None,
    log_absent: Optional[str] = None,
    log_source: str = "main",
    session_file: Optional[str] = None,
    min_blocks: Optional[int] = None,
    has_block: Optional[str] = None,
) -> dict:
    """Compose a QA verdict from process/crash/log/project-file checks.

    Every requested condition becomes one check; the verdict passes only if all
    checks pass. Returns a dict with ``passed`` and a per-check breakdown.
    """
    checks: List[dict] = []

    def add(name: str, ok: bool, detail) -> None:
        checks.append({"check": name, "passed": bool(ok), "detail": detail})

    status = app.status()

    if alive is not None:
        add(f"process alive == {alive}", status["alive"] == alive,
            {"pid": status["pid"], "alive": status["alive"]})

    if no_crash:
        ok = (not status["crashed"]) and status["crash_report_count"] == 0
        add("no crash since launch", ok,
            {"crashed": status["crashed"], "crash_reports": status["crash_reports"]})

    if log_contains is not None:
        result = app.logs(log_source, lines=0, grep=log_contains)
        hit = result.get("shown", 0) > 0
        add(f"log[{log_source}] contains '{log_contains}'", hit,
            {"matches": result.get("shown", 0), "path": result.get("path")})

    if log_absent is not None:
        result = app.logs(log_source, lines=0, grep=log_absent)
        absent = result.get("shown", 0) == 0
        add(f"log[{log_source}] absent of '{log_absent}'", absent,
            {"matches": result.get("shown", 0), "path": result.get("path")})

    if session_file is not None and (min_blocks is not None or has_block is not None):
        try:
            summary = inspect_mod.summarize(session_file)
            if min_blocks is not None:
                add(f"{session_file} has >= {min_blocks} blocks",
                    summary.get("total_blocks", 0) >= min_blocks,
                    {"total_blocks": summary.get("total_blocks")})
            if has_block is not None:
                matches = inspect_mod.find_blocks(summary, has_block)
                add(f"{session_file} contains block '{has_block}'",
                    len(matches) > 0,
                    {"matches": [m.get("name") or m.get("identifier") for m in matches]})
        except (FileNotFoundError, OSError) as exc:
            add(f"inspect {session_file}", False, {"error": str(exc)})

    passed = all(c["passed"] for c in checks) if checks else False
    return {
        "passed": passed,
        "check_count": len(checks),
        "passed_count": sum(1 for c in checks if c["passed"]),
        "checks": checks,
        "status": status,
    }
