"""cli-anything-element — an agent-facing CLI bridge to drive and inspect Element.

Element (https://github.com/kushview/element) is a real-time, GUI audio plugin
host. It has no headless/batch mode, so this harness does NOT reimplement Element.
Instead it does three honest things against the *real* application:

  1. Actuate  — drive a running Element over its OSC control surface
                 (``/element/command/<name>`` → the app's ApplicationCommandManager).
  2. Observe  — launch/lifecycle/crash tracking, log tailing, AX-tree assertions,
                 and read-only inspection of ``.els``/``.elg`` project files.
  3. Verify   — turn the above into machine-checkable QA verdicts (``--json``).

The whole point is to replace flaky manual GUI verification during QA/debug with
deterministic, scriptable CLI calls that Claude Code (or any agent) can run.
"""

__version__ = "0.1.0"
