"""CLI-side state — remembers the Element instance the bridge launched.

One-shot CLI invocations are separate processes, so the bridge persists a tiny
JSON record of the instance it started (pid, OSC port, log/launch-log paths,
launch time, session file). This is the harness's own session, distinct from an
Element *Project* (``.els``).

Writes are exclusive-locked (HARNESS session-locking rule) to survive
concurrent invocations: open ``r+``, lock, then truncate inside the lock.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict

try:
    import fcntl  # POSIX only
except ImportError:  # pragma: no cover - Windows
    fcntl = None


def state_dir() -> Path:
    """Directory for the bridge's own state + captured launch logs."""
    override = os.environ.get("CLI_ANYTHING_ELEMENT_HOME")
    base = Path(override) if override else (Path.home() / ".cli-anything-element")
    base.mkdir(parents=True, exist_ok=True)
    return base


def state_file() -> Path:
    return state_dir() / "state.json"


def launch_log_path() -> Path:
    """Where we capture the launched process's own stdout/stderr."""
    return state_dir() / "launch.log"


def load() -> Dict[str, Any]:
    """Read the current bridge state (empty dict if none / unreadable)."""
    path = state_file()
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            if fcntl is not None:
                fcntl.flock(handle.fileno(), fcntl.LOCK_SH)
            try:
                return json.load(handle) or {}
            finally:
                if fcntl is not None:
                    fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    except (json.JSONDecodeError, OSError):
        return {}


def save(state: Dict[str, Any]) -> Dict[str, Any]:
    """Write the bridge state atomically under an exclusive lock."""
    path = state_file()
    # Open r+ if it exists (so we can lock the real file), else create.
    mode = "r+" if path.exists() else "w+"
    with open(path, mode, encoding="utf-8") as handle:
        if fcntl is not None:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            handle.seek(0)
            handle.truncate()
            json.dump(state, handle, indent=2, default=str)
            handle.flush()
            os.fsync(handle.fileno())
        finally:
            if fcntl is not None:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    return state


def update(**fields: Any) -> Dict[str, Any]:
    """Merge fields into the current state and persist."""
    state = load()
    state.update(fields)
    return save(state)


def clear() -> Dict[str, Any]:
    """Forget the tracked instance (does not touch the OS process)."""
    return save({})
