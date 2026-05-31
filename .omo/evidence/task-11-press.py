#!/usr/bin/env python3
"""task-11 interaction helper: press a webview button by title via AXPress,
then dump titled elements so we can see the resulting modal/state.

Usage: python3 task-11-press.py "Preferences"
"""
import sys, os, time
sys.path.insert(0, "/Volumes/Projects/Development_Projects/Github_Repos/element/tools/automation")
from element_assertions import get_element_app, _collect_windows, _ax_attr  # type: ignore
import ApplicationServices as AppSvc  # type: ignore


def bfs(root, max_depth=12):
    q = [(root, 0)]
    while q:
        n, d = q.pop(0)
        yield n, d
        if d >= max_depth:
            continue
        ch = _ax_attr(n, "AXChildren")
        if ch:
            for c in ch:
                q.append((c, d + 1))


def find_button(title, role="AXButton"):
    ax_app, _ = get_element_app()
    if ax_app is None:
        return None
    for win in _collect_windows(ax_app):
        for n, _d in bfs(win):
            if _ax_attr(n, "AXRole") == role and _ax_attr(n, "AXTitle") == title:
                return n
    return None


def dump_titles():
    ax_app, _ = get_element_app()
    out = []
    if ax_app is None:
        return out
    for win in _collect_windows(ax_app):
        for n, d in bfs(win):
            t = _ax_attr(n, "AXTitle")
            r = _ax_attr(n, "AXRole")
            v = _ax_attr(n, "AXValue")
            if (t and isinstance(t, str) and t.strip()) or (v and isinstance(v, str) and v.strip()):
                out.append((d, r or "?", (t or "")[:60], (str(v) if v else "")[:40]))
    return out


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else None
    if action == "--dump":
        for d, r, t, v in dump_titles():
            print(f'{"  "*min(d,10)}{r} t="{t}" v="{v}"')
        sys.exit(0)
    btn = find_button(action)
    if btn is None:
        # try checkbox/other roles
        for role in ("AXCheckBox", "AXMenuButton", "AXStaticText"):
            btn = find_button(action, role=role)
            if btn:
                break
    if btn is None:
        print(f"NOT_FOUND: {action!r}")
        sys.exit(2)
    AppSvc.AXUIElementPerformAction(btn, "AXPress")
    time.sleep(0.8)
    print(f"PRESSED: {action!r}")
    print("--- titled elements after press ---")
    for d, r, t, v in dump_titles():
        print(f'{"  "*min(d,10)}{r} t="{t}" v="{v}"')
