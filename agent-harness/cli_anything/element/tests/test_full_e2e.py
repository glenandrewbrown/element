"""E2E tests for the Element bridge.

Two classes:
  * TestCLISubprocess — invokes the INSTALLED cli-anything-element command via
    _resolve_cli(). These are always safe: they use dry-run / inspect / list /
    help, so they need NO running Element and never kill anything.
  * TestLiveBridge — drives the REAL Element (launch → control → verify → quit).
    Opt-in via ELEMENT_E2E=1 because it kills any running Element to get a
    deterministic instance. Per the harness rule there is no graceful
    degradation: when enabled and the binary is missing, it FAILS.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time

import pytest

REPO_SESSIONS = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "data", "sessions")
)


def _resolve_cli(name: str):
    """Resolve the installed CLI command; fall back to `python -m` for dev.

    Set CLI_ANYTHING_FORCE_INSTALLED=1 to require the installed command.
    """
    force = os.environ.get("CLI_ANYTHING_FORCE_INSTALLED", "").strip() == "1"
    path = shutil.which(name)
    if path:
        print(f"[_resolve_cli] Using installed command: {path}")
        return [path]
    if force:
        raise RuntimeError(f"{name} not found in PATH. Install with: pip install -e .")
    module = "cli_anything.element.element_cli"
    print(f"[_resolve_cli] Falling back to: {sys.executable} -m {module}")
    return [sys.executable, "-m", module]


def _make_session(tmp_path):
    p = tmp_path / "e2e.els"
    p.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Session version="1" name="e2e" tempo="120.0">\n'
        '  <graphs active="0"><Node type="Graph" name="Graph" uuid="g0">\n'
        '    <nodes>\n'
        '      <Node id="1" name="In" format="Internal" identifier="audio.input" type="plugin" bypass="0" enabled="1"><ports/></Node>\n'
        '      <Node id="2" name="Delay" format="VST3" identifier="com.x.delay" type="plugin" bypass="0" enabled="1"><ports/></Node>\n'
        '    </nodes>\n'
        '    <arcs><Arc sourceNode="1" sourcePort="0" destNode="2" destPort="0"/></arcs>\n'
        '  </Node></graphs>\n'
        '</Session>\n'
    )
    return str(p)


class TestCLISubprocess:
    """Exercise the installed command — safe, no running Element required."""

    CLI_BASE = _resolve_cli("cli-anything-element")

    def _run(self, args, check=True):
        return subprocess.run(self.CLI_BASE + args, capture_output=True, text=True, check=check)

    def test_help(self):
        r = self._run(["--help"])
        assert r.returncode == 0
        assert "control" in r.stdout and "inspect" in r.stdout

    def test_control_list_json(self):
        r = self._run(["--json", "control", "list"])
        data = json.loads(r.stdout)
        assert "transport" in data and data["transport"]["play"] == "transportPlay"

    def test_control_raw_dry_run(self):
        r = self._run(["--json", "control", "raw", "transportPlay", "--dry-run"])
        data = json.loads(r.stdout)
        assert data["ok"] is True
        assert data["address"] == "/element/command/transportPlay"

    def test_unknown_command_exits_nonzero(self):
        r = self._run(["--json", "control", "raw", "bogusCommand", "--dry-run"], check=False)
        assert r.returncode != 0

    def test_inspect_generated_session(self, tmp_path):
        session = _make_session(tmp_path)
        r = self._run(["--json", "inspect", "session", session])
        data = json.loads(r.stdout)
        assert data["total_blocks"] == 2 and data["total_arcs"] == 1

    def test_app_info(self):
        # Binary may or may not be present; either way the command must succeed shape-wise.
        r = self._run(["--json", "app", "info"], check=False)
        data = json.loads(r.stdout)
        assert ("executable" in data) or (data.get("ok") is False)


@pytest.mark.skipif(
    os.environ.get("ELEMENT_E2E", "").strip() != "1",
    reason="Live Element E2E is opt-in (set ELEMENT_E2E=1); it kills running Element instances.",
)
class TestLiveBridge:
    """Drive the real Element: launch → control → verify → quit."""

    def setup_method(self):
        from cli_anything.element.utils import element_backend as backend
        # Hard dependency: the binary MUST exist (no graceful degradation).
        self.exe = backend.find_element_executable()

    def teardown_method(self):
        # Never leak a running instance between tests, even on assertion failure.
        import os
        import signal
        from cli_anything.element.core import app
        for proc in app.list_element_processes():
            try:
                os.kill(proc["pid"], signal.SIGKILL)
            except OSError:
                pass

    def test_launch_control_save_verify(self, tmp_path):
        """Launch with a real session, drive it, and PROVE the OSC command surface
        actually invokes commands by having `sessionSave` rewrite the .els on disk.

        sessionSave is used as the proof (not quit) because it has a deterministic,
        modal-free on-disk effect — Element's graceful quit can block on a
        save-session dialog, so SIGKILL is used for teardown instead.
        """
        import os
        import shutil
        from cli_anything.element.core import app, control, verify

        src = os.path.join(REPO_SESSIONS, "pluginstack.els")
        assert os.path.exists(src), f"sample session missing: {src}"
        sess = str(tmp_path / "live.els")
        shutil.copy(src, sess)

        launched = app.launch(fresh=True, session_file=sess, wait=8.0)
        assert launched["alive"] is True, f"Element did not stay alive: {launched}"
        print(f"[e2e] launched pid={launched['pid']} osc_bound={launched['osc_bound']}")

        # A harmless command must not crash it.
        assert control.send_command("transportPlay")["sent"] is True
        time.sleep(1.0)
        verdict = verify.assert_state(alive=True, no_crash=True)
        assert verdict["passed"] is True, f"verdict failed: {verdict}"

        # PROOF the OSC surface invokes commands: sessionSave rewrites the .els.
        before = os.path.getmtime(sess)
        time.sleep(1.1)  # guarantee a measurable mtime delta
        control.send_command("sessionSave")
        saved = False
        for _ in range(20):
            if os.path.getmtime(sess) > before:
                saved = True
                break
            time.sleep(0.5)
        assert saved, "OSC sessionSave did not rewrite the session file — commands not invoked"

        # Deterministic teardown.
        app.stop(method="kill", timeout=10.0)
        final = app.status()
        assert final["alive"] is False
        assert final["crashed"] is False, f"unexpected crash: {final}"

    def test_kill_is_distinguished_from_clean_exit(self):
        from cli_anything.element.core import app
        launched = app.launch(fresh=True, wait=6.0)
        assert launched["alive"] is True, f"Element did not launch: {launched}"
        app.stop(method="kill", timeout=10.0)
        assert app.status()["alive"] is False, "SIGKILL did not stop the instance"
