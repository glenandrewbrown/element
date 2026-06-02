"""Backend integration: locate, configure, and launch the *real* Element app.

This module is the harness's link to the actual software. Per the cli-anything
rule, we never reimplement Element — we discover the installed/built binary,
make sure its OSC host is enabled (by editing Element's own settings file), and
launch it.

Element specifics that shape this module:
  * macOS app bundle: ``Element.app/Contents/MacOS/Element`` (also Linux/Windows).
  * Single-instance: ``moreThanOneInstanceAllowed() == false`` — a second launch
    forwards its command line (a session path) to the running instance and exits.
  * OSC host is OFF by default and gated by two keys in Element's JUCE
    PropertiesFile (``Element.conf``): ``oscHostEnabledKey`` / ``oscHostPortKey``.
    The bridge writes those before launch so it can talk to the instance.
"""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import List, Optional

# Default OSC host port baked into Element (Settings::getOscHostPort fallback).
DEFAULT_OSC_PORT = 9000


class ElementNotFoundError(RuntimeError):
    """Raised when no Element binary can be located. Message lists how to fix."""


# ── Binary discovery ──────────────────────────────────────────────────────

def _repo_root() -> Path:
    """Best-effort path to the Element source repo (this file lives inside it)."""
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "CMakeLists.txt").exists() and (parent / "src").is_dir():
            return parent
    # Fallback: assume agent-harness/cli_anything/element/utils/ → up 4
    return here.parents[4]


def _candidate_bundles() -> List[Path]:
    """Ordered candidate locations for an Element binary on this platform."""
    system = platform.system()
    candidates: List[Path] = []

    env = os.environ.get("ELEMENT_APP")
    if env:
        candidates.append(Path(env))

    repo = _repo_root()
    if system == "Darwin":
        candidates += [
            repo / "build-merged/element_app_artefacts/Element.app",
            repo / "build-release/element_app_artefacts/Release/Element.app",
            repo / "build/element_app_artefacts/Element.app",
            Path("/Applications/Element.app"),
        ]
    elif system == "Linux":
        candidates += [
            repo / "build-merged/element_app_artefacts/element",
            repo / "build/element_app_artefacts/element",
            Path("/usr/local/bin/element"),
            Path("/usr/bin/element"),
        ]
    elif system == "Windows":
        candidates += [
            repo / "build-merged/element_app_artefacts/Element.exe",
            Path(r"C:\Program Files\Element\Element.exe"),
        ]
    return candidates


def _resolve_executable(path: Path) -> Optional[Path]:
    """Resolve a candidate (which may be a .app bundle or a binary) to a runnable file."""
    if not path.exists():
        return None
    if path.is_dir() and path.suffix == ".app":
        exe = path / "Contents/MacOS/Element"
        return exe if exe.exists() else None
    if path.is_file() and os.access(path, os.X_OK):
        return path
    return None


def find_element_executable() -> Path:
    """Return the path to a runnable Element binary, or raise with guidance."""
    for cand in _candidate_bundles():
        exe = _resolve_executable(cand)
        if exe:
            return exe
    # Last resort: PATH lookup.
    which = shutil.which("element") or shutil.which("Element")
    if which:
        return Path(which)
    raise ElementNotFoundError(
        "Could not find an Element binary.\n"
        "Tried $ELEMENT_APP, build-merged/, build-release/, /Applications/Element.app, PATH.\n"
        "Build it first:  cmake --build build-merged -j8 --target element_app\n"
        "or set ELEMENT_APP=/path/to/Element.app"
    )


def describe_executable(exe: Path) -> dict:
    """Metadata about a located binary (path, kind, bundle, version if readable)."""
    bundle = None
    version = None
    # Walk up to the .app bundle on macOS.
    for parent in exe.parents:
        if parent.suffix == ".app":
            bundle = parent
            break
    if bundle:
        info = bundle / "Contents/Info.plist"
        if info.exists():
            try:
                out = subprocess.run(
                    ["/usr/libexec/PlistBuddy", "-c",
                     "Print CFBundleShortVersionString", str(info)],
                    capture_output=True, text=True, timeout=5,
                )
                if out.returncode == 0:
                    version = out.stdout.strip()
            except (OSError, subprocess.SubprocessError):
                pass
    return {
        "executable": str(exe),
        "bundle": str(bundle) if bundle else None,
        "version": version,
        "is_built_from_source": "build-merged" in str(exe) or "build-release" in str(exe),
    }


# ── Settings file (JUCE PropertiesFile XML) ────────────────────────────────

def settings_file() -> Path:
    """Path to Element's user settings (Element.conf), per platform / override."""
    env = os.environ.get("ELEMENT_SETTINGS")
    if env:
        return Path(env)
    system = platform.system()
    home = Path.home()
    if system == "Darwin":
        return home / "Library/Application Support/Kushview/Element/Element.conf"
    if system == "Windows":
        return Path(os.environ.get("APPDATA", home)) / "Kushview/Element/Element.conf"
    # Linux / other
    return home / ".config/Kushview/Element/Element.conf"


def app_data_dir() -> Path:
    """Element's application data directory (parent of the settings file)."""
    return settings_file().parent


def log_dir() -> Path:
    """Directory holding Element's log files (main.log, element-verbose.log)."""
    return app_data_dir() / "log"


def main_log() -> Path:
    """Path to Element's main log (Logger::writeToLog → log/main.log)."""
    return log_dir() / "main.log"


def verbose_log() -> Path:
    """Path to Element's verbose log (gated by env ELEMENT_VERBOSE for detail)."""
    return log_dir() / "element-verbose.log"


def crash_reports_dir() -> Path:
    """OS crash-report directory (macOS DiagnosticReports), best-effort elsewhere."""
    if platform.system() == "Darwin":
        return Path.home() / "Library/Logs/DiagnosticReports"
    return log_dir()


def recent_crash_reports(since_epoch: Optional[float] = None,
                         name_prefix: str = "Element") -> list:
    """macOS .ips crash reports for Element, newest first, optionally since a time.

    The GUI app crashes as ``Element-*.ips``; the unit-test binary as
    ``test_element-*.ips`` — we match the given prefix so QA can target either.
    """
    directory = crash_reports_dir()
    if not directory.exists():
        return []
    found = []
    # The trailing dash keeps "Element-*.ips" from also matching sibling apps
    # like "ElementFX-*.ips" (crash report names are "<app>-<timestamp>.ips").
    for report in directory.glob(f"{name_prefix}-*.ips"):
        try:
            mtime = report.stat().st_mtime
        except OSError:
            continue
        if since_epoch is None or mtime >= since_epoch:
            found.append(report)
    return sorted(found, key=lambda p: p.stat().st_mtime, reverse=True)


def _load_properties(path: Path) -> ET.ElementTree:
    """Load (or create) a JUCE PropertiesFile XML tree (<PROPERTIES><VALUE.../></PROPERTIES>)."""
    if path.exists():
        try:
            return ET.parse(path)
        except ET.ParseError:
            pass
    root = ET.Element("PROPERTIES")
    return ET.ElementTree(root)


def get_property(name: str) -> Optional[str]:
    """Read a single PropertiesFile value by name, or None."""
    path = settings_file()
    if not path.exists():
        return None
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError:
        return None
    for value in root.findall("VALUE"):
        if value.get("name") == name:
            return value.get("val")
    return None


def set_properties(values: dict, backup: bool = True) -> dict:
    """Set one or more PropertiesFile values, preserving the rest.

    Returns a dict describing the file, whether a backup was made, and the
    previous values of the keys touched (so callers can restore).
    """
    path = settings_file()
    path.parent.mkdir(parents=True, exist_ok=True)

    backup_path = path.with_suffix(path.suffix + ".cli-bak")
    made_backup = False
    if backup and path.exists() and not backup_path.exists():
        shutil.copy2(path, backup_path)
        made_backup = True

    tree = _load_properties(path)
    root = tree.getroot()

    previous = {}
    by_name = {v.get("name"): v for v in root.findall("VALUE")}
    for name, val in values.items():
        sval = "1" if val is True else "0" if val is False else str(val)
        if name in by_name:
            previous[name] = by_name[name].get("val")
            by_name[name].set("val", sval)
        else:
            previous[name] = None
            el = ET.SubElement(root, "VALUE")
            el.set("name", name)
            el.set("val", sval)

    tree.write(path, encoding="UTF-8", xml_declaration=True)
    return {
        "settings_file": str(path),
        "backup": str(backup_path) if made_backup else None,
        "previous": previous,
    }


def enable_osc_host(port: int = DEFAULT_OSC_PORT, backup: bool = True,
                    fast_start: bool = True) -> dict:
    """Force-enable Element's OSC host on ``port`` (writes Element.conf).

    When ``fast_start`` is True (the default for a QA/debug instance) startup
    plugin scanning is also disabled. This matters because Element activates its
    OSC host in ``finishLaunching`` *after* any startup scan — leaving the scan
    on can delay the OSC host by a minute or more. Restore the original config
    with ``restore_settings()``.
    """
    values = {"oscHostEnabledKey": True, "oscHostPortKey": int(port)}
    if fast_start:
        values["scanForPluginsOnStart"] = False
    return set_properties(values, backup=backup)


def restore_settings() -> dict:
    """Restore Element.conf from the bridge's backup, if present."""
    path = settings_file()
    backup_path = path.with_suffix(path.suffix + ".cli-bak")
    if not backup_path.exists():
        return {"restored": False, "reason": "no backup found", "backup": str(backup_path)}
    shutil.copy2(backup_path, path)
    # Remove the backup so the next launch captures a fresh original rather than
    # reverting to this now-restored state (and clobbering later user changes).
    try:
        backup_path.unlink()
    except OSError:
        pass
    return {"restored": True, "settings_file": str(path)}


# ── Launch ─────────────────────────────────────────────────────────────────

def build_launch_argv(exe: Path, session: Optional[str] = None) -> List[str]:
    """Argv for launching Element directly (so we own the real process pid)."""
    argv = [str(exe)]
    if session:
        argv.append(str(session))
    return argv


def launch(
    exe: Path,
    session: Optional[str] = None,
    log_file: Optional[Path] = None,
    env: Optional[dict] = None,
) -> subprocess.Popen:
    """Launch Element directly, redirecting stdout/stderr to ``log_file`` if given."""
    argv = build_launch_argv(exe, session)
    stdout = stderr = None
    if log_file is not None:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        stdout = open(log_file, "ab", buffering=0)
        stderr = subprocess.STDOUT
    full_env = {**os.environ, **(env or {})}
    return subprocess.Popen(argv, stdout=stdout, stderr=stderr, env=full_env)
