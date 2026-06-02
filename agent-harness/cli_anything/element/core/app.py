"""Application lifecycle + observability for QA/debug.

Drives the *real* Element process: launch it (OSC host force-enabled so the
bridge can talk to it), report whether it is alive / crashed, tail its logs, and
stop or hard-kill it. Crash detection — the whole reason this bridge exists — is
grounded in the OS process state plus macOS ``.ips`` crash reports, not guesses.

No third-party process library: we shell out to ``ps`` and use ``os.kill``.
"""

from __future__ import annotations

import os
import signal
import subprocess
import time
from pathlib import Path
from typing import List, Optional

from ..utils import element_backend as backend
from . import session
from . import control


# ── Process helpers ────────────────────────────────────────────────────────

def _is_zombie(pid: int) -> bool:
    """True if ``pid`` is a reaped-pending zombie (<defunct>) — not really alive.

    Matters when the bridge launched the process in the same Python process and
    then SIGKILLs it: the child lingers as a zombie until reaped, and a bare
    ``os.kill(pid, 0)`` would still report it as existing.
    """
    try:
        out = subprocess.run(["ps", "-o", "state=", "-p", str(pid)],
                             capture_output=True, text=True, timeout=3)
    except (OSError, subprocess.SubprocessError):
        return False
    return out.stdout.strip().startswith("Z")


def _reap(pid: int) -> None:
    """Best-effort reap of a child we spawned (no-op if not our child)."""
    try:
        os.waitpid(int(pid), os.WNOHANG)
    except (ChildProcessError, OSError, ValueError):
        pass


def _pid_alive(pid: int) -> bool:
    """True if a process with ``pid`` exists and is not a zombie."""
    if not pid:
        return False
    try:
        os.kill(int(pid), 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True  # exists but owned by another user
    return not _is_zombie(int(pid))


def osc_port_bound(port: int = backend.DEFAULT_OSC_PORT) -> bool:
    """Best-effort check that the OSC UDP port is bound.

    Uses ``netstat`` (fast everywhere) rather than ``lsof -iUDP`` — on machines
    where the repo lives on a mounted volume, ``lsof`` enumerates every fd on
    every mount and can take ~50s per call, which would make launch unusable.
    netstat does not report the owning pid, but combined with the tracked
    process's liveness it is a sufficient "OSC host is up" signal.
    """
    needle = f".{port} "
    try:
        out = subprocess.run(
            ["netstat", "-an", "-p", "udp"],
            capture_output=True, text=True, timeout=5,
        )
        return any(needle in line or line.rstrip().endswith(f".{port}")
                   for line in out.stdout.splitlines())
    except (OSError, subprocess.SubprocessError):
        pass
    # Fallback to lsof only if netstat is unavailable (slower, but correct).
    try:
        out = subprocess.run(
            ["lsof", "-nP", f"-iUDP:{port}"],
            capture_output=True, text=True, timeout=8,
        )
        return any("lement" in line for line in out.stdout.splitlines())
    except (OSError, subprocess.SubprocessError):
        return False


def list_element_processes() -> List[dict]:
    """All live Element-looking processes (main GUI + any worker children)."""
    try:
        out = subprocess.run(
            ["ps", "-axo", "pid=,ppid=,rss=,%cpu=,command="],
            capture_output=True, text=True, timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    procs = []
    for line in out.stdout.splitlines():
        parts = line.strip().split(None, 4)
        if len(parts) < 5:
            continue
        pid, ppid, rss, cpu, cmd = parts
        first = cmd.split()[0] if cmd.split() else ""
        base = os.path.basename(first)
        # The JUCE app renames its process to "Element" (argv0 == "Element"),
        # so a long-running instance shows up as a bare "Element" with no path
        # — match that as well as the full bundle path. Exclude lookalikes such
        # as Karabiner-Elements and node processes that merely have "element" in
        # a path.
        looks_like_element = (
            "Element.app/Contents/MacOS/Element" in cmd
            or "MacOS/Element" in cmd
            or base == "Element"
            or base == "element"
            or "/Element.exe" in cmd
        )
        if "Karabiner" in cmd or base in ("node", "Code", "python", "python3"):
            looks_like_element = False
        if not looks_like_element:
            continue
        try:
            procs.append({
                "pid": int(pid),
                "ppid": int(ppid),
                "rss_kb": int(rss),
                "cpu_percent": float(cpu),
                "command": cmd,
            })
        except ValueError:
            continue

    # Role by process tree, not by command text: scanner/sandbox workers are
    # spawned by the main GUI process, so any Element process whose parent is
    # also an Element process is a worker. This avoids misclassifying the main
    # instance when a session path happens to contain "--"/"sandbox"/"scanner".
    pids = {p["pid"] for p in procs}
    for p in procs:
        p["role"] = "worker" if p["ppid"] in pids else "main"
    return procs


# ── Launch ──────────────────────────────────────────────────────────────────

def launch(
    session_file: Optional[str] = None,
    port: int = backend.DEFAULT_OSC_PORT,
    enable_osc: bool = True,
    fresh: bool = False,
    verbose: bool = True,
    backup_settings: bool = True,
    wait: float = 2.5,
) -> dict:
    """Launch a test/debug Element instance configured for the bridge.

    fresh=True kills any running Element first so the launched pid IS the
    instance under test (Element is single-instance, so otherwise a second
    launch just forwards to and surfaces the existing one).
    """
    exe = backend.find_element_executable()

    # Element is single-instance: if one is already running it holds a JUCE
    # lock, so a new launch forwards its args to it and exits rc=0. Record any
    # pre-existing main instances so we can detect that and (with --fresh)
    # replace them.
    preexisting = [p["pid"] for p in list_element_processes() if p["role"] == "main"]

    killed = []
    if fresh and preexisting:
        for pid_ in preexisting:
            try:
                os.kill(pid_, signal.SIGKILL)
                killed.append(pid_)
            except OSError:
                pass
        time.sleep(0.8)
        preexisting = [p for p in preexisting if p not in killed]

    osc_result = None
    if enable_osc:
        osc_result = backend.enable_osc_host(port=port, backup=backup_settings)

    log_path = session.launch_log_path()
    env = {"ELEMENT_VERBOSE": "1"} if verbose else {}
    launch_started = time.time()
    proc = backend.launch(exe, session=session_file, log_file=log_path, env=env)

    time.sleep(max(0.0, wait))

    # Reconcile the real instance pid: if our spawned process already exited
    # (single-instance forward), adopt the live "main" Element pid instead.
    tracked_pid = proc.pid
    forwarded = False
    if not _pid_alive(tracked_pid):
        mains = [p for p in list_element_processes() if p["role"] == "main"]
        if mains:
            tracked_pid = sorted(mains, key=lambda p: p["pid"])[0]["pid"]
            # If an instance pre-existed, our spawn forwarded to it and exited.
            forwarded = bool(preexisting)

    state = {
        "pid": tracked_pid,
        "spawn_pid": proc.pid,
        "executable": str(exe),
        "session_file": session_file,
        "osc_port": port,
        "osc_enabled": bool(enable_osc),
        "verbose": bool(verbose),
        "launch_log": str(log_path),
        "main_log": str(backend.main_log()),
        "verbose_log": str(backend.verbose_log()),
        "launched_at": launch_started,
        "forwarded_to_existing": forwarded,
    }
    session.save(state)

    # The OSC host binds a moment after the window appears; poll briefly so we
    # report the true state rather than a too-early snapshot.
    osc_bound = None
    if enable_osc and _pid_alive(tracked_pid):
        osc_bound = False
        for _ in range(40):  # up to ~20s — covers a one-time unverified-plugin search
            if osc_port_bound(port):
                osc_bound = True
                break
            if not _pid_alive(tracked_pid):
                break
            time.sleep(0.5)

    result = {
        "ok": _pid_alive(tracked_pid),
        "pid": tracked_pid,
        "executable": str(exe),
        "osc": osc_result,
        "osc_bound": osc_bound,
        "killed_existing": killed,
        "preexisting_instances": preexisting,
        "forwarded_to_existing": forwarded,
        "alive": _pid_alive(tracked_pid),
        "session_file": session_file,
        "logs": {"main": str(backend.main_log()), "launch": str(log_path)},
    }
    if forwarded:
        result["warning"] = (
            "Another Element instance was already running; this launch forwarded to "
            "it (single-instance). The tracked pid is that existing instance, which "
            "may be an older build. Use `app launch --fresh` to replace it."
        )
    return result


# ── Status / crash detection ────────────────────────────────────────────────

def status() -> dict:
    """Rich status of the tracked instance, including crash inference."""
    state = session.load()
    pid = state.get("pid")
    alive = _pid_alive(pid) if pid else False
    launched_at = state.get("launched_at")

    crashes = backend.recent_crash_reports(since_epoch=launched_at)
    all_element = list_element_processes()

    # A crash is only asserted when there is a crash report to back it up —
    # an OS .ips since launch. A process that is simply gone with no report and
    # that we did not stop is "exited unexpectedly" (e.g. self-quit, forwarded
    # to a pre-existing instance, or killed externally), NOT a crash.
    crashed = len(crashes) > 0
    exited_unexpectedly = (
        bool(pid) and not alive and not state.get("stopped_by_bridge") and not crashed
    )

    proc_info = next((p for p in all_element if p["pid"] == pid), None)

    return {
        "tracked": bool(pid),
        "pid": pid,
        "alive": alive,
        "crashed": crashed,
        "exited_unexpectedly": exited_unexpectedly,
        "osc_enabled": bool(state.get("osc_enabled")),
        "osc_port": state.get("osc_port"),
        "session_file": state.get("session_file"),
        "executable": state.get("executable"),
        "process": proc_info,
        "crash_reports": [str(c) for c in crashes],
        "crash_report_count": len(crashes),
        "all_element_processes": all_element,
        "logs": {
            "main": state.get("main_log"),
            "verbose": state.get("verbose_log"),
            "launch": state.get("launch_log"),
        },
    }


def crashes(since: Optional[float] = None) -> dict:
    """List Element crash reports, defaulting to those since the tracked launch."""
    state = session.load()
    if since is None:
        since = state.get("launched_at")
    reports = backend.recent_crash_reports(since_epoch=since)
    return {
        "since": since,
        "count": len(reports),
        "reports": [
            {"path": str(r), "mtime": r.stat().st_mtime, "size": r.stat().st_size}
            for r in reports
        ],
    }


# ── Logs ─────────────────────────────────────────────────────────────────────

_LOG_SOURCES = {
    "main": backend.main_log,
    "verbose": backend.verbose_log,
    "launch": session.launch_log_path,
}


def logs(which: str = "main", lines: int = 40, grep: Optional[str] = None) -> dict:
    """Tail one of the log sources (main / verbose / launch)."""
    if which not in _LOG_SOURCES:
        return {"ok": False, "error": f"unknown log '{which}'",
                "available": sorted(_LOG_SOURCES)}
    path = Path(_LOG_SOURCES[which]())
    if not path.exists():
        return {"ok": True, "which": which, "path": str(path),
                "exists": False, "lines": []}
    try:
        text = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError as exc:
        return {"ok": False, "error": str(exc), "path": str(path)}
    if grep:
        text = [ln for ln in text if grep.lower() in ln.lower()]
    tail = text[-lines:] if lines and lines > 0 else text
    return {
        "ok": True,
        "which": which,
        "path": str(path),
        "exists": True,
        "total_lines": len(text),
        "shown": len(tail),
        "lines": tail,
    }


# ── Stop / kill ───────────────────────────────────────────────────────────────

def stop(method: str = "term", port: Optional[int] = None, timeout: float = 5.0) -> dict:
    """Stop the tracked instance.

    method:
      * ``osc``  — send /element/command/quit (graceful; may prompt to save)
      * ``term`` — SIGTERM the pid (default; clean, no dialog)
      * ``kill`` — SIGKILL the pid (hard crash simulation for crash-iso QA)
    """
    state = session.load()
    pid = state.get("pid")
    port = port or state.get("osc_port") or backend.DEFAULT_OSC_PORT

    if not pid:
        return {"ok": False, "method": method, "error": "no tracked instance to stop"}

    if method == "osc":
        result = control.send_command("quit", port=port)
        sent = result.get("sent")
        deadline = time.time() + timeout
        while time.time() < deadline and _pid_alive(pid):
            time.sleep(0.2)
        gone = not _pid_alive(pid)
        session.update(stopped_by_bridge=True)
        return {"ok": gone, "method": "osc", "pid": pid, "sent": sent, "alive": not gone}

    sig = signal.SIGKILL if method == "kill" else signal.SIGTERM
    try:
        os.kill(int(pid), sig)
    except ProcessLookupError:
        session.update(stopped_by_bridge=True)
        return {"ok": True, "method": method, "pid": pid, "note": "already gone"}
    except OSError as exc:
        return {"ok": False, "method": method, "pid": pid, "error": str(exc)}

    deadline = time.time() + timeout
    while time.time() < deadline:
        _reap(pid)  # if it's our own child, clear the zombie so liveness is accurate
        if not _pid_alive(pid):
            break
        time.sleep(0.2)
    _reap(pid)
    gone = not _pid_alive(pid)
    session.update(stopped_by_bridge=True)
    return {"ok": gone, "method": method, "signal": sig, "pid": pid, "alive": not gone}
