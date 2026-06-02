"""Control surface: the OSC command vocabulary that drives a running Element.

Every name here MUST match an entry in ``Commands::fromString`` in
``include/element/ui/commands.hpp`` — that is the single source of truth for
what the app can be told to do over OSC. Each command is delivered to the
address ``/element/command/<name>`` (the wired ``CommandOSCListener`` resolves
the trailing name and invokes it on the message thread).

Grouping below is purely for an ergonomic CLI; the wire protocol is flat.
"""

from __future__ import annotations

from typing import Dict, Optional

from ..utils.osc import OSCClient

COMMAND_ADDRESS_BASE = "/element/command"

# ── Vocabulary: friendly CLI name → Element command name ───────────────────
# Element command names are camelCase and verified against commands.hpp.
VOCAB: Dict[str, Dict[str, str]] = {
    "transport": {
        "play": "transportPlay",
        "stop": "transportStop",
        "record": "transportRecord",
        "rewind": "transportRewind",
        "forward": "transportForward",
        "seek-zero": "transportSeekZero",
    },
    "session": {
        "new": "sessionNew",
        "open": "sessionOpen",
        "close": "sessionClose",
        "save": "sessionSave",
        "save-as": "sessionSaveAs",
        "add-graph": "sessionAddGraph",
        "import": "importSession",
    },
    "graph": {
        "new": "graphNew",
        "open": "graphOpen",
        "save": "graphSave",
        "save-as": "graphSaveAs",
        "export": "exportGraph",
        "import": "importGraph",
        "zoom-in": "graphZoomIn",
        "zoom-out": "graphZoomOut",
        "fit": "graphFitToView",
    },
    "media": {
        "new": "mediaNew",
        "open": "mediaOpen",
        "close": "mediaClose",
        "save": "mediaSave",
        "save-as": "mediaSaveAs",
    },
    "view": {
        "about": "showAbout",
        "legacy": "showLegacyView",
        "plugin-manager": "showPluginManager",
        "preferences": "showPreferences",
        "session-config": "showSessionConfig",
        "graph-config": "showGraphConfig",
        "patch-bay": "showPatchBay",
        "graph-editor": "showGraphEditor",
        "last": "showLastContentView",
        "all-plugin-windows": "showAllPluginWindows",
        "hide-plugin-windows": "hideAllPluginWindows",
        "keymap-editor": "showKeymapEditor",
        "controllers": "showControllers",
        "graph-mixer": "showGraphMixer",
        "console": "showConsole",
        "panel-session": "showPanelSession",
        "panel-browse": "showPanelBrowse",
        "panel-inspector": "showPanelInspector",
        "panel-editor": "showPanelEditor",
    },
    "toggle": {
        "virtual-keyboard": "toggleVirtualKeyboard",
        "rotate-view": "rotateContentView",
        "user-interface": "toggleUserInterface",
        "channel-strip": "toggleChannelStrip",
        "meter-bridge": "toggleMeterBridge",
    },
    "edit": {
        "undo": "undo",
        "redo": "redo",
        "copy": "copy",
        "paste": "paste",
        "cut": "cut",
        "select-all": "selectAll",
    },
    "app": {
        "panic": "panic",
        "clear-recents": "recentsClear",
        "quit": "quit",
    },
}

# Flat set of every valid Element command name.
ALL_COMMANDS = {cmd for group in VOCAB.values() for cmd in group.values()}

# alias (any friendly name, deduped) → command name, for `control raw`/lookup.
_ALIASES: Dict[str, str] = {}
for _group in VOCAB.values():
    for _alias, _cmd in _group.items():
        _ALIASES.setdefault(_alias, _cmd)
        _ALIASES.setdefault(_cmd, _cmd)  # raw command name resolves to itself


def command_address(command: str) -> str:
    """The OSC address for an Element command name."""
    return f"{COMMAND_ADDRESS_BASE}/{command}"


def resolve(name: str) -> Optional[str]:
    """Resolve a CLI alias or raw command name to a valid Element command name."""
    if name in ALL_COMMANDS:
        return name
    return _ALIASES.get(name)


def send_command(command: str, host: str = "127.0.0.1", port: int = 9000) -> dict:
    """Send a resolved Element command over OSC.

    Returns a result dict. ``sent`` reflects only that the datagram left the
    socket — never that Element acted on it (UDP is fire-and-forget). Verify the
    effect via logs/process/AX (see ``core.verify``).
    """
    resolved = resolve(command)
    if resolved is None:
        return {
            "ok": False,
            "error": f"unknown command '{command}'",
            "hint": "run `cli-anything-element control list` to see valid commands",
        }
    address = command_address(resolved)
    with OSCClient(host, port) as osc:
        sent = osc.send(address)
    return {
        "ok": bool(sent),
        "command": resolved,
        "address": address,
        "host": host,
        "port": port,
        "sent": bool(sent),
        "note": "UDP fire-and-forget; confirm the effect via `verify`/`app status`/`app logs`",
    }


def vocabulary() -> dict:
    """The full grouped vocabulary (for `control list` / docs / JSON)."""
    return {group: dict(cmds) for group, cmds in VOCAB.items()}
