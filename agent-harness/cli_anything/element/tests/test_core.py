"""Unit tests for the Element bridge — synthetic data, no Element, no listener."""

from __future__ import annotations

import os
import struct
import tempfile
from pathlib import Path

import pytest

from cli_anything.element.utils import osc
from cli_anything.element.utils import element_backend as backend
from cli_anything.element.core import control, engine, inspect, session


# ── OSC encoding ────────────────────────────────────────────────────────────

def test_osc_address_only_is_4byte_aligned():
    msg = osc.encode_message("/element/command/transportPlay")
    assert len(msg) % 4 == 0
    assert msg.startswith(b"/element/command/transportPlay\x00")
    # ",\0\0\0" type-tag block follows the padded address
    assert b",\x00\x00\x00" in msg


def test_osc_string_padding():
    assert osc._osc_string("abc") == b"abc\x00"        # 3+1 = 4
    assert osc._osc_string("abcd") == b"abcd\x00\x00\x00\x00"  # 4+1 → pad to 8


def test_osc_int_arg_big_endian():
    msg = osc.encode_message("/element/engine", "samplerate", 48000)
    assert len(msg) % 4 == 0
    assert struct.pack(">i", 48000) in msg
    assert b",si\x00" in msg  # string + int type tags


def test_osc_float_and_bool_tags():
    msg = osc.encode_message("/x", 1.5, True, False)
    assert len(msg) % 4 == 0
    assert b",fTF" in msg                 # bools carry no payload
    assert struct.pack(">f", 1.5) in msg


def test_osc_blob():
    msg = osc.encode_message("/x", b"\x01\x02\x03")
    assert len(msg) % 4 == 0
    assert struct.pack(">i", 3) in msg     # blob size prefix


# ── control vocabulary ──────────────────────────────────────────────────────

def test_control_resolve_alias_and_raw():
    assert control.resolve("transportPlay") == "transportPlay"   # raw
    assert control.VOCAB["transport"]["play"] == "transportPlay"
    assert control.resolve("panic") == "panic"


def test_control_resolve_unknown_is_none():
    assert control.resolve("definitelyNotACommand") is None


def test_control_command_address():
    assert control.command_address("panic") == "/element/command/panic"


def test_control_all_commands_nonempty_camelcase():
    assert len(control.ALL_COMMANDS) >= 30
    assert "transportPlay" in control.ALL_COMMANDS
    assert "sessionSave" in control.ALL_COMMANDS
    assert all(" " not in c and "/" not in c for c in control.ALL_COMMANDS)


def test_control_vocabulary_groups():
    vocab = control.vocabulary()
    assert {"transport", "session", "graph", "view", "app"} <= set(vocab)


def test_control_send_unknown_fails_without_network(monkeypatch):
    # resolve fails before any socket use
    res = control.send_command("nope")
    assert res["ok"] is False and "unknown" in res["error"]


# ── engine ──────────────────────────────────────────────────────────────────

def test_engine_rejects_nonpositive_rate():
    assert engine.set_sample_rate(0)["ok"] is False
    assert engine.set_sample_rate(-44100)["ok"] is False


def test_engine_valid_rate_shape():
    res = engine.set_sample_rate(48000)  # UDP send to nobody still succeeds
    assert res["verb"] == "samplerate" and res["sample_rate"] == 48000
    assert res["uncommon"] is False


# ── inspect (.els / .elg) ────────────────────────────────────────────────────

_SESSION_XML = """<?xml version="1.0" encoding="UTF-8"?>
<Session version="1" name="unit" tempo="120.0" beatsPerBar="4">
  <graphs active="0">
    <Node type="Graph" name="Graph" uuid="g0">
      <nodes>
        <Node id="1" name="In" format="Internal" identifier="audio.input" type="plugin" bypass="0" enabled="1">
          <ports><Port index="0" type="audio" flow="output"/></ports>
        </Node>
        <Node id="2" name="Reverb" format="VST3" identifier="com.x.reverb" type="plugin" bypass="1" enabled="1">
          <ports/>
        </Node>
      </nodes>
      <arcs>
        <Arc sourceNode="1" sourcePort="0" destNode="2" destPort="0"/>
      </arcs>
    </Node>
  </graphs>
</Session>
"""

_GRAPH_XML = """<?xml version="1.0" encoding="UTF-8"?>
<Node type="Graph" name="ExportedGraph" uuid="g1">
  <nodes>
    <Node id="1" name="Synth" format="AudioUnit" identifier="synth" type="plugin" bypass="0" enabled="1"><ports/></Node>
  </nodes>
  <arcs/>
</Node>
"""


@pytest.fixture
def session_file(tmp_path):
    p = tmp_path / "unit.els"
    p.write_text(_SESSION_XML)
    return str(p)


@pytest.fixture
def graph_file(tmp_path):
    p = tmp_path / "unit.elg"
    p.write_text(_GRAPH_XML)
    return str(p)


def test_inspect_session_counts(session_file):
    s = inspect.summarize(session_file)
    assert s["kind"] == "session" and s["name"] == "unit"
    assert s["graph_count"] == 1
    assert s["total_blocks"] == 2
    assert s["total_arcs"] == 1


def test_inspect_block_flags(session_file):
    s = inspect.summarize(session_file)
    reverb = inspect.find_blocks(s, "reverb")
    assert len(reverb) == 1
    assert reverb[0]["bypass"] is True
    assert reverb[0]["enabled"] is True


def test_inspect_graph_file(graph_file):
    s = inspect.summarize(graph_file)
    assert s["kind"] == "graph" and s["total_blocks"] == 1


def test_inspect_missing_file_raises():
    with pytest.raises(FileNotFoundError):
        inspect.summarize("/no/such/file.els")


def test_inspect_bad_root(tmp_path):
    p = tmp_path / "bad.els"
    p.write_text("<?xml version='1.0'?><Nope/>")
    s = inspect.summarize(str(p))
    assert s["ok"] is False


_NESTED_XML = """<?xml version="1.0" encoding="UTF-8"?>
<Session version="1" name="nested" tempo="120.0">
  <graphs active="0"><Node type="Graph" name="Root" uuid="g0">
    <nodes>
      <Node id="1" name="Container" format="Internal" identifier="el.graph" type="graph" bypass="0" enabled="1">
        <nodes>
          <Node id="2" name="Leaf" format="VST3" identifier="leaf.fx" type="plugin" bypass="1" enabled="1"><ports/></Node>
        </nodes>
      </Node>
    </nodes>
    <arcs/>
  </Node></graphs>
</Session>
"""


def test_inspect_finds_nested_block(tmp_path):
    p = tmp_path / "nested.els"
    p.write_text(_NESTED_XML)
    s = inspect.summarize(str(p))
    assert s["total_blocks"] == 2  # Container + nested Leaf (recursive)
    leaf = inspect.find_blocks(s, "Leaf")  # must see the block inside the container
    assert len(leaf) == 1
    assert leaf[0]["bypass"] is True


# ── backend settings / logs ──────────────────────────────────────────────────

@pytest.fixture
def temp_settings(tmp_path, monkeypatch):
    conf = tmp_path / "Element.conf"
    monkeypatch.setenv("ELEMENT_SETTINGS", str(conf))
    return conf


def test_settings_roundtrip(temp_settings):
    backend.set_properties({"foo": "bar", "n": 7}, backup=False)
    assert backend.get_property("foo") == "bar"
    assert backend.get_property("n") == "7"
    assert backend.get_property("missing") is None


def test_enable_osc_host_writes_keys(temp_settings):
    backend.enable_osc_host(port=9001, backup=False)
    assert backend.get_property("oscHostEnabledKey") == "1"
    assert backend.get_property("oscHostPortKey") == "9001"


def test_log_paths_derive_from_settings_dir(temp_settings):
    assert backend.log_dir() == temp_settings.parent / "log"
    assert backend.main_log().name == "main.log"
    assert backend.verbose_log().name == "element-verbose.log"


def test_recent_crash_reports_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(backend, "crash_reports_dir", lambda: tmp_path)
    assert backend.recent_crash_reports() == []


# ── session state ─────────────────────────────────────────────────────────────

def test_session_state_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("CLI_ANYTHING_ELEMENT_HOME", str(tmp_path))
    session.clear()
    assert session.load() == {}
    session.save({"pid": 123, "osc_port": 9000})
    assert session.load()["pid"] == 123
    session.update(alive=True)
    state = session.load()
    assert state["alive"] is True and state["pid"] == 123
    session.clear()
    assert session.load() == {}
