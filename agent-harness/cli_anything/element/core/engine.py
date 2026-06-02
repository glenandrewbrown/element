"""Engine control: the ``/element/engine`` OSC surface.

Element's ``EngineOSCListener`` currently understands exactly one verb:

    /element/engine "samplerate" <int|float>

which re-applies the audio device sample rate live. This module wraps it. As
more engine verbs are wired in the C++ ``EngineOSCListener``, add them here in
lock-step.
"""

from __future__ import annotations

from ..utils.osc import OSCClient

ENGINE_ADDRESS = "/element/engine"

# Sample rates Element's device manager will realistically accept.
COMMON_SAMPLE_RATES = (44100, 48000, 88200, 96000, 176400, 192000)


def set_sample_rate(rate: int, host: str = "127.0.0.1", port: int = 9000) -> dict:
    """Tell a running Element to switch the engine sample rate.

    The receiver accepts an int or float and rounds; we send an int32.
    """
    rate = int(rate)
    if rate <= 0:
        return {"ok": False, "error": f"sample rate must be positive, got {rate}"}
    with OSCClient(host, port) as osc:
        sent = osc.send(ENGINE_ADDRESS, "samplerate", rate)
    return {
        "ok": bool(sent),
        "address": ENGINE_ADDRESS,
        "verb": "samplerate",
        "sample_rate": rate,
        "host": host,
        "port": port,
        "sent": bool(sent),
        "uncommon": rate not in COMMON_SAMPLE_RATES,
        "note": "applied live; confirm via `app logs` or device readback",
    }
