"""Read-only inspection of Element project files (.els session / .elg graph).

Both formats are plain ValueTree XML on disk (NOT gzipped):

  * ``.els`` → root ``<Session>`` → ``<graphs>`` → one or more
    ``<Node type="Graph">`` → ``<nodes>`` of ``<Node>`` blocks, ``<arcs>`` of
    ``<Arc>`` cables, ``<ui>``.
  * ``.elg`` → root is a single ``<Node type="Graph">`` (an exported graph).

This module never mutates files — it parses them so QA can assert structure
("the session has 7 blocks", "block 'Reverb' is bypassed", "12 cables") without
launching the GUI.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path
from typing import List, Optional

# Node attributes we surface as a "block" for QA.
_BLOCK_FIELDS = (
    "id", "name", "format", "identifier", "type", "pluginIdentifierString",
    "uuid", "x", "y", "mute", "bypass", "enabled", "muteInput",
)


def load_root(path: str) -> ET.Element:
    """Parse a project file and return the XML root element."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"project file not found: {path}")
    return ET.parse(p).getroot()


def _bool_attr(node: ET.Element, name: str) -> Optional[bool]:
    val = node.get(name)
    if val is None:
        return None
    return val.strip() not in ("0", "", "false", "False")


def _block_from_node(node: ET.Element) -> dict:
    """Flatten a <Node> element into a block summary dict."""
    block = {f: node.get(f) for f in _BLOCK_FIELDS if node.get(f) is not None}
    ports = node.find("ports")
    block["port_count"] = len(ports.findall("Port")) if ports is not None else 0
    nested = node.find("nodes")
    child_nodes = nested.findall("Node") if nested is not None else []
    block["is_container"] = len(child_nodes) > 0
    block["child_count"] = len(child_nodes)
    # Normalise the common QA flags to real booleans.
    for flag in ("mute", "bypass", "enabled", "muteInput"):
        if flag in block:
            block[flag] = _bool_attr(node, flag)
    return block


def _arcs(graph_node: ET.Element) -> List[dict]:
    arcs_el = graph_node.find("arcs")
    if arcs_el is None:
        return []
    return [
        {
            "sourceNode": a.get("sourceNode"),
            "sourcePort": a.get("sourcePort"),
            "destNode": a.get("destNode"),
            "destPort": a.get("destPort"),
        }
        for a in arcs_el.findall("Arc")
    ]


def _collect_blocks(node: ET.Element) -> List[dict]:
    """All block dicts under ``node``, recursing into nested Containers/Portals."""
    blocks: List[dict] = []
    nested = node.find("nodes")
    if nested is not None:
        for child in nested.findall("Node"):
            blocks.append(_block_from_node(child))
            blocks.extend(_collect_blocks(child))
    return blocks


def _summarize_graph(graph_node: ET.Element) -> dict:
    nodes_el = graph_node.find("nodes")
    top_nodes = nodes_el.findall("Node") if nodes_el is not None else []
    blocks = [_block_from_node(n) for n in top_nodes]
    blocks_recursive = _collect_blocks(graph_node)

    return {
        "name": graph_node.get("name"),
        "uuid": graph_node.get("uuid"),
        "render_mode": graph_node.get("renderMode"),
        "block_count": len(blocks),
        "block_count_recursive": len(blocks_recursive),
        "arc_count": len(_arcs(graph_node)),
        "blocks": blocks,
        "blocks_recursive": blocks_recursive,
        "arcs": _arcs(graph_node),
    }


def summarize(path: str) -> dict:
    """Full structured summary of a .els/.elg file (JSON-ready)."""
    root = load_root(path)
    ext = Path(path).suffix.lower()

    if root.tag == "Session":
        graphs_el = root.find("graphs")
        graph_nodes = graphs_el.findall("Node") if graphs_el is not None else []
        graphs = [_summarize_graph(g) for g in graph_nodes]
        return {
            "ok": True,
            "path": str(path),
            "kind": "session",
            "format": ext,
            "name": root.get("name"),
            "tempo": root.get("tempo"),
            "beats_per_bar": root.get("beatsPerBar"),
            "notes": root.get("notes"),
            "active_graph": graphs_el.get("active") if graphs_el is not None else None,
            "graph_count": len(graphs),
            "total_blocks": sum(g["block_count_recursive"] for g in graphs),
            "total_arcs": sum(g["arc_count"] for g in graphs),
            "graphs": graphs,
        }

    if root.tag == "Node":
        graph = _summarize_graph(root)
        return {
            "ok": True,
            "path": str(path),
            "kind": "graph",
            "format": ext,
            "name": root.get("name"),
            "graph_count": 1,
            "total_blocks": graph["block_count_recursive"],
            "total_arcs": graph["arc_count"],
            "graphs": [graph],
        }

    return {"ok": False, "path": str(path),
            "error": f"unrecognised root element <{root.tag}> (expected Session or Node)"}


# ── Assertion helpers (used by core.verify and the CLI) ─────────────────────

def all_blocks(summary: dict) -> List[dict]:
    """Flat list of every block across all graphs, including nested Containers."""
    blocks: List[dict] = []
    for graph in summary.get("graphs", []):
        blocks.extend(graph.get("blocks_recursive", graph.get("blocks", [])))
    return blocks


def find_blocks(summary: dict, needle: str) -> List[dict]:
    """Blocks whose name or identifier contains ``needle`` (case-insensitive)."""
    needle_l = needle.lower()
    matches = []
    for block in all_blocks(summary):
        hay = " ".join(str(block.get(k, "")) for k in ("name", "identifier",
                                                        "pluginIdentifierString"))
        if needle_l in hay.lower():
            matches.append(block)
    return matches
