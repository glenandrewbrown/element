"""Minimal, dependency-free OSC 1.0 client over UDP.

Element's OSC host (a ``juce::OSCReceiver``) speaks plain OSC 1.0 over UDP. We
only ever need to *send* (the actuation path); state is observed out-of-band via
logs / process / accessibility, so a tiny encoder is all that's required and we
avoid a hard runtime dependency on ``python-osc``.

Encoding rules (OSC 1.0):
  * every block (address, type-tag string, each string/blob arg) is null
    terminated and zero-padded to a 4-byte boundary
  * int32 / float32 are big-endian
  * supported arg types here: int (i), float (f), str (s), bytes (b),
    bool (T/F — no payload)

UDP is fire-and-forget: ``send`` returning True only means the datagram left the
socket, never that Element acted on it. QA verification must observe the effect
(see ``core.verify``), never trust the send alone.
"""

from __future__ import annotations

import socket
import struct
from typing import Union

OSCArg = Union[int, float, str, bytes, bool]


def _pad(data: bytes) -> bytes:
    """Zero-pad ``data`` up to the next 4-byte boundary."""
    remainder = len(data) % 4
    if remainder == 0:
        return data
    return data + b"\x00" * (4 - remainder)


def _osc_string(text: str) -> bytes:
    """Encode an OSC string: UTF-8, null-terminated, padded to 4 bytes."""
    return _pad(text.encode("utf-8") + b"\x00")


def _osc_blob(blob: bytes) -> bytes:
    """Encode an OSC blob: int32 size + padded bytes."""
    return struct.pack(">i", len(blob)) + _pad(blob)


def encode_message(address: str, *args: OSCArg) -> bytes:
    """Encode a single OSC message (no bundles) to bytes.

    Booleans encode as the ``T``/``F`` type tags with no payload, matching the
    OSC 1.0 spec, so ``send(addr, True)`` carries no argument data.
    """
    type_tags = ","
    payload = b""
    for arg in args:
        if isinstance(arg, bool):
            type_tags += "T" if arg else "F"
        elif isinstance(arg, int):
            type_tags += "i"
            payload += struct.pack(">i", arg)
        elif isinstance(arg, float):
            type_tags += "f"
            payload += struct.pack(">f", arg)
        elif isinstance(arg, (bytes, bytearray)):
            type_tags += "b"
            payload += _osc_blob(bytes(arg))
        else:
            type_tags += "s"
            payload += _osc_string(str(arg))
    return _osc_string(address) + _osc_string(type_tags) + payload


class OSCClient:
    """A tiny UDP OSC sender targeting one host:port.

    Example::

        with OSCClient("127.0.0.1", 9000) as osc:
            osc.send("/element/command/transportPlay")
            osc.send("/element/engine", "samplerate", 48000)
    """

    def __init__(self, host: str = "127.0.0.1", port: int = 9000):
        self.host = host
        self.port = int(port)
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    def send(self, address: str, *args: OSCArg) -> bool:
        """Send one OSC message. Returns False only if the socket send fails."""
        try:
            self._sock.sendto(encode_message(address, *args), (self.host, self.port))
            return True
        except OSError:
            return False

    def close(self) -> None:
        try:
            self._sock.close()
        except OSError:
            pass

    def __enter__(self) -> "OSCClient":
        return self

    def __exit__(self, *_exc) -> None:
        self.close()
