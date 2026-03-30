#!/usr/bin/env python3
"""
element_ax_map.py - Map the macOS Accessibility tree of the running Element.app.

Usage:
    python3 element_ax_map.py [--depth N] [--focus TITLE]

Outputs an indented tree to stdout and saves full results as JSON
to tools/automation/element_ax_cache.json.
"""

import argparse
import json
import os
import sys
import time

from ApplicationServices import (
    AXUIElementCreateApplication,
    AXUIElementCopyAttributeValue,
    AXIsProcessTrusted,
)
from Cocoa import NSWorkspace


# Attributes to read from each AX element
AX_ATTRIBUTES = [
    "AXRole",
    "AXTitle",
    "AXDescription",
    "AXIdentifier",
    "AXValue",
    "AXEnabled",
    "AXRoleDescription",
    "AXSubrole",
]


def check_accessibility_trusted():
    """Exit with a clear error if Accessibility access is not granted."""
    if not AXIsProcessTrusted():
        print(
            "ERROR: Accessibility access not granted.\n"
            "\n"
            "This script requires Accessibility permissions to inspect UI elements.\n"
            "Grant access in:\n"
            "  System Settings > Privacy & Security > Accessibility\n"
            "\n"
            "Add Terminal.app (or your terminal emulator) to the allowed list,\n"
            "then re-run this script.",
            file=sys.stderr,
        )
        sys.exit(1)


def find_element_pid():
    """Find the PID of the running Element.app using NSWorkspace."""
    workspace = NSWorkspace.sharedWorkspace()
    apps = workspace.runningApplications()
    for app in apps:
        name = app.localizedName()
        if name and name.lower() == "element":
            return app.processIdentifier()
    return None


def read_ax_attribute(element, attr_name):
    """Read a single AX attribute. Returns the value or None on error."""
    err, value = AXUIElementCopyAttributeValue(element, attr_name, None)
    if err == 0 and value is not None:
        return value
    return None


def serialize_value(value):
    """Convert an AX attribute value to a JSON-safe Python type."""
    if value is None:
        return None
    if isinstance(value, (bool, int, float, str)):
        return value
    # NSNumber, NSString, etc. often convert via str
    try:
        # Try numeric conversion first
        return float(value)
    except (TypeError, ValueError):
        pass
    return str(value)


def read_element_attrs(element):
    """Read all tracked attributes from an AX element into a dict."""
    attrs = {}
    for attr in AX_ATTRIBUTES:
        raw = read_ax_attribute(element, attr)
        attrs[attr] = serialize_value(raw)
    return attrs


def walk_ax_tree(element, depth, max_depth):
    """Recursively walk the AX tree and return a nested dict structure."""
    attrs = read_element_attrs(element)
    node = {
        "attributes": attrs,
        "children": [],
    }

    if depth >= max_depth:
        return node

    # Get children
    children = read_ax_attribute(element, "AXChildren")
    if children:
        for child in children:
            child_node = walk_ax_tree(child, depth + 1, max_depth)
            node["children"].append(child_node)

    return node


def find_window_by_title(app_element, title):
    """Find a specific window element by its AXTitle."""
    windows = read_ax_attribute(app_element, "AXWindows")
    if not windows:
        return None
    for window in windows:
        win_title = read_ax_attribute(window, "AXTitle")
        if win_title and title.lower() in str(win_title).lower():
            return window
    return None


def print_tree(node, indent=0):
    """Print an indented summary of the AX tree to stdout."""
    attrs = node["attributes"]
    role = attrs.get("AXRole") or "?"
    title = attrs.get("AXTitle") or ""
    identifier = attrs.get("AXIdentifier") or ""

    parts = [role]
    if title:
        parts.append(f'title="{title}"')
    if identifier:
        parts.append(f'id="{identifier}"')

    prefix = "  " * indent
    print(f"{prefix}{' '.join(parts)}")

    for child in node.get("children", []):
        print_tree(child, indent + 1)


def count_nodes(node):
    """Count total nodes in the tree."""
    total = 1
    for child in node.get("children", []):
        total += count_nodes(child)
    return total


def main():
    parser = argparse.ArgumentParser(
        description="Map the Accessibility tree of Element.app"
    )
    parser.add_argument(
        "--depth",
        type=int,
        default=4,
        help="Maximum tree traversal depth (default: 4)",
    )
    parser.add_argument(
        "--focus",
        type=str,
        default=None,
        help="Start traversal from a window matching this title",
    )
    args = parser.parse_args()

    if args.depth > 5:
        print(
            f"WARNING: Depth {args.depth} may take a long time on complex UIs.",
            file=sys.stderr,
        )

    # 1. Check accessibility permissions
    check_accessibility_trusted()

    # 2. Find Element.app PID
    pid = find_element_pid()
    if pid is None:
        print("ERROR: Element.app is not running.", file=sys.stderr)
        sys.exit(1)

    print(f"Found Element.app (PID: {pid})")

    # 3. Create AX application element
    app_element = AXUIElementCreateApplication(pid)

    # 4. Determine root for traversal
    root_element = app_element
    root_label = "application"

    if args.focus:
        focused = find_window_by_title(app_element, args.focus)
        if focused is None:
            print(
                f"ERROR: No window matching '{args.focus}' found.",
                file=sys.stderr,
            )
            # List available windows for help
            windows = read_ax_attribute(app_element, "AXWindows")
            if windows:
                print("Available windows:", file=sys.stderr)
                for w in windows:
                    wt = read_ax_attribute(w, "AXTitle")
                    print(f"  - {wt}", file=sys.stderr)
            sys.exit(1)
        root_element = focused
        root_label = f'window "{args.focus}"'

    # 5. Walk the tree
    print(f"Walking AX tree from {root_label} (max depth: {args.depth})...")
    start = time.time()
    tree = walk_ax_tree(root_element, 0, args.depth)
    elapsed = time.time() - start

    total = count_nodes(tree)
    print(f"Mapped {total} nodes in {elapsed:.2f}s\n")

    # 6. Print indented tree to stdout
    print("--- Accessibility Tree ---")
    print_tree(tree)
    print("--- End ---\n")

    # 7. Save JSON cache
    script_dir = os.path.dirname(os.path.abspath(__file__))
    cache_path = os.path.join(script_dir, "element_ax_cache.json")

    cache_data = {
        "pid": pid,
        "depth": args.depth,
        "focus": args.focus,
        "node_count": total,
        "elapsed_seconds": round(elapsed, 3),
        "tree": tree,
    }

    with open(cache_path, "w") as f:
        json.dump(cache_data, f, indent=2, default=str)

    print(f"Full results saved to {cache_path}")


if __name__ == "__main__":
    main()
