"""cli-anything-element — Click CLI + REPL to drive and inspect Element for QA.

Entry point: ``cli-anything-element`` (also ``python -m cli_anything.element``).

Command groups:
  app      launch / status / logs / crashes / stop / kill — lifecycle + crash QA
  control  drive the running app over OSC (transport, panic, session, view, …)
  engine   live engine control (sample rate)
  inspect  read-only .els / .elg project introspection
  verify   AX suites + composite pass/fail QA verdicts

Every command supports ``--json`` for machine consumption. With no subcommand
the CLI drops into a REPL.
"""

from __future__ import annotations

import json as _json
import shlex
from typing import Any

import click

from . import __version__
from .core import app as app_core
from .core import control as control_core
from .core import engine as engine_core
from .core import inspect as inspect_core
from .core import session as session_core
from .core import verify as verify_core
from .utils import element_backend as backend


# ── Output helper ───────────────────────────────────────────────────────────

def _emit(ctx, data: Any) -> None:
    """Print ``data`` as JSON or human-readable text per the --json flag."""
    as_json = ctx.obj.get("json", False)
    if as_json:
        click.echo(_json.dumps(data, indent=2, default=str))
        return
    _emit_human(data)


def _emit_human(data: Any, indent: int = 0) -> None:
    pad = "  " * indent
    if isinstance(data, dict):
        # Friendly headline for verdict/ok style payloads.
        if "passed" in data and "checks" in data:
            verdict = "PASS" if data["passed"] else "FAIL"
            click.echo(click.style(f"{verdict}", fg="green" if data["passed"] else "red", bold=True)
                       + f"  ({data['passed_count']}/{data['check_count']} checks)")
            for chk in data["checks"]:
                mark = click.style("✓", fg="green") if chk["passed"] else click.style("✗", fg="red")
                click.echo(f"  {mark} {chk['check']}  {chk['detail']}")
            return
        for key, value in data.items():
            if isinstance(value, (dict, list)) and value:
                click.echo(f"{pad}{key}:")
                _emit_human(value, indent + 1)
            else:
                click.echo(f"{pad}{key}: {value}")
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                summary = item.get("command") or item.get("pid") or item.get("name") or item
                click.echo(f"{pad}- {summary}")
                _emit_human(item, indent + 1)
            else:
                click.echo(f"{pad}- {item}")
    else:
        click.echo(f"{pad}{data}")


def _port(ctx) -> int:
    """Resolve the OSC port: explicit flag → tracked instance → default 9000."""
    if ctx.obj.get("port"):
        return int(ctx.obj["port"])
    tracked = session_core.load().get("osc_port")
    return int(tracked) if tracked else backend.DEFAULT_OSC_PORT


def _host(ctx) -> str:
    return ctx.obj.get("host") or "127.0.0.1"


# ── Root group ────────────────────────────────────────────────────────────────

@click.group(invoke_without_command=True)
@click.option("--json", "as_json", is_flag=True, default=False, help="Machine-readable JSON output.")
@click.option("--host", default="127.0.0.1", show_default=True, help="OSC host for a running Element.")
@click.option("--port", type=int, default=None, help="OSC port (default: tracked instance or 9000).")
@click.version_option(__version__, prog_name="cli-anything-element")
@click.pass_context
def cli(ctx, as_json, host, port):
    """Agent-facing bridge to drive & inspect Element for QA/debug."""
    ctx.ensure_object(dict)
    ctx.obj["json"] = as_json
    ctx.obj["host"] = host
    ctx.obj["port"] = port
    if ctx.invoked_subcommand is None:
        _run_repl(ctx)


# ── app group ──────────────────────────────────────────────────────────────────

@cli.group()
def app():
    """Launch / inspect / stop a test-debug Element instance."""


@app.command("info")
@click.pass_context
def app_info(ctx):
    """Show which Element binary the bridge will use."""
    try:
        exe = backend.find_element_executable()
        _emit(ctx, backend.describe_executable(exe))
    except backend.ElementNotFoundError as exc:
        _emit(ctx, {"ok": False, "error": str(exc)})
        ctx.exit(1)


@app.command("launch")
@click.argument("session_file", required=False)
@click.option("--port", type=int, default=backend.DEFAULT_OSC_PORT, show_default=True)
@click.option("--fresh/--no-fresh", default=False, help="Kill any running Element first (deterministic QA).")
@click.option("--osc/--no-osc", "enable_osc", default=True, help="Force-enable Element's OSC host.")
@click.option("--verbose/--no-verbose", default=True, help="Set ELEMENT_VERBOSE=1 for detailed logs.")
@click.option("--wait", type=float, default=2.5, show_default=True, help="Seconds to wait before reporting status.")
@click.pass_context
def app_launch(ctx, session_file, port, fresh, enable_osc, verbose, wait):
    """Launch Element (OSC enabled) and report whether it came up."""
    try:
        result = app_core.launch(session_file=session_file, port=port, enable_osc=enable_osc,
                                  fresh=fresh, verbose=verbose, wait=wait)
    except backend.ElementNotFoundError as exc:
        _emit(ctx, {"ok": False, "error": str(exc)})
        ctx.exit(1)
        return
    _emit(ctx, result)
    if not result.get("ok"):
        ctx.exit(1)


@app.command("status")
@click.pass_context
def app_status(ctx):
    """Report tracked-instance liveness + crash inference."""
    status = app_core.status()
    _emit(ctx, status)
    if status.get("crashed"):
        ctx.exit(2)


@app.command("logs")
@click.option("--which", type=click.Choice(["main", "verbose", "launch"]), default="main", show_default=True)
@click.option("--lines", type=int, default=40, show_default=True)
@click.option("--grep", default=None, help="Only lines containing this substring (case-insensitive).")
@click.pass_context
def app_logs(ctx, which, lines, grep):
    """Tail Element's logs (main / verbose / captured launch output)."""
    _emit(ctx, app_core.logs(which=which, lines=lines, grep=grep))


@app.command("crashes")
@click.option("--since", type=float, default=None, help="Unix epoch; default = since tracked launch.")
@click.pass_context
def app_crashes(ctx, since):
    """List Element crash reports (macOS DiagnosticReports)."""
    _emit(ctx, app_core.crashes(since=since))


@app.command("quit")
@click.pass_context
def app_quit(ctx):
    """Ask Element to quit gracefully over OSC (may prompt to save)."""
    _emit(ctx, app_core.stop(method="osc", port=_port(ctx)))


@app.command("stop")
@click.option("--method", type=click.Choice(["term", "kill", "osc"]), default="term", show_default=True)
@click.pass_context
def app_stop(ctx, method):
    """Stop the tracked instance (SIGTERM by default)."""
    _emit(ctx, app_core.stop(method=method, port=_port(ctx)))


@app.command("kill")
@click.pass_context
def app_kill(ctx):
    """Hard-kill the instance (SIGKILL) — crash-isolation simulation for QA."""
    _emit(ctx, app_core.stop(method="kill"))


@app.command("restore-settings")
@click.pass_context
def app_restore(ctx):
    """Restore Element.conf from the bridge's backup."""
    _emit(ctx, backend.restore_settings())


# ── control group ───────────────────────────────────────────────────────────────

@cli.group()
def control():
    """Drive a running Element over its OSC command surface."""


@control.command("list")
@click.pass_context
def control_list(ctx):
    """List the full command vocabulary (groups → CLI name → Element command)."""
    _emit(ctx, control_core.vocabulary())


def _send(ctx, command, dry_run=False):
    if dry_run:
        resolved = control_core.resolve(command)
        return {"ok": resolved is not None, "dry_run": True, "command": resolved,
                "address": control_core.command_address(resolved) if resolved else None}
    return control_core.send_command(command, host=_host(ctx), port=_port(ctx))


@control.command("raw")
@click.argument("command")
@click.option("--dry-run", is_flag=True, help="Show the OSC address without sending.")
@click.pass_context
def control_raw(ctx, command, dry_run):
    """Send any Element command by its exact name (e.g. transportPlay)."""
    result = _send(ctx, command, dry_run)
    _emit(ctx, result)
    if not result.get("ok"):
        ctx.exit(1)


@control.command("panic")
@click.option("--dry-run", is_flag=True)
@click.pass_context
def control_panic(ctx, dry_run):
    """Send all-notes-off panic."""
    _emit(ctx, _send(ctx, "panic", dry_run))


def _group_command(group_name, choices):
    """Build a Click command that sends one of a group's named actions."""
    @click.argument("action", type=click.Choice(list(choices)))
    @click.option("--dry-run", is_flag=True)
    @click.pass_context
    def _cmd(ctx, action, dry_run):
        command = control_core.VOCAB[group_name][action]
        result = _send(ctx, command, dry_run)
        _emit(ctx, result)
        if not result.get("ok"):
            ctx.exit(1)
    return _cmd


control.command("transport")(_group_command("transport", control_core.VOCAB["transport"]))
control.command("session")(_group_command("session", control_core.VOCAB["session"]))
control.command("graph")(_group_command("graph", control_core.VOCAB["graph"]))
control.command("media")(_group_command("media", control_core.VOCAB["media"]))
control.command("view")(_group_command("view", control_core.VOCAB["view"]))
control.command("toggle")(_group_command("toggle", control_core.VOCAB["toggle"]))
control.command("edit")(_group_command("edit", control_core.VOCAB["edit"]))


# ── engine group ─────────────────────────────────────────────────────────────────

@cli.group()
def engine():
    """Live engine control (sample rate)."""


@engine.command("sample-rate")
@click.argument("rate", type=int)
@click.pass_context
def engine_sample_rate(ctx, rate):
    """Set the engine sample rate on the running instance."""
    result = engine_core.set_sample_rate(rate, host=_host(ctx), port=_port(ctx))
    _emit(ctx, result)
    if not result.get("ok"):
        ctx.exit(1)


# ── inspect group ────────────────────────────────────────────────────────────────

@cli.group()
def inspect():
    """Read-only introspection of .els / .elg project files."""


@inspect.command("session")
@click.argument("file")
@click.pass_context
def inspect_session(ctx, file):
    """Summarise an .els session file."""
    try:
        _emit(ctx, inspect_core.summarize(file))
    except FileNotFoundError as exc:
        _emit(ctx, {"ok": False, "error": str(exc)})
        ctx.exit(1)


@inspect.command("graph")
@click.argument("file")
@click.pass_context
def inspect_graph(ctx, file):
    """Summarise an .elg graph file."""
    try:
        _emit(ctx, inspect_core.summarize(file))
    except FileNotFoundError as exc:
        _emit(ctx, {"ok": False, "error": str(exc)})
        ctx.exit(1)


@inspect.command("blocks")
@click.argument("file")
@click.option("--filter", "needle", default=None, help="Only blocks matching this name/identifier.")
@click.pass_context
def inspect_blocks(ctx, file, needle):
    """List the blocks (nodes) in a project file."""
    try:
        summary = inspect_core.summarize(file)
    except FileNotFoundError as exc:
        _emit(ctx, {"ok": False, "error": str(exc)})
        ctx.exit(1)
        return
    blocks = (inspect_core.find_blocks(summary, needle) if needle
              else inspect_core.all_blocks(summary))
    _emit(ctx, {"ok": True, "file": file, "count": len(blocks), "blocks": blocks})


# ── verify group ─────────────────────────────────────────────────────────────────

@cli.group()
def verify():
    """Accessibility suites + composite QA pass/fail verdicts."""


@verify.command("ax")
@click.option("--suite", default="all", show_default=True,
              help="all or one of: " + ", ".join(verify_core.AX_SUITES))
@click.pass_context
def verify_ax(ctx, suite):
    """Run an accessibility verification suite against running Element."""
    result = verify_core.run_ax_suite(suite=suite)
    _emit(ctx, result)
    if not result.get("ok"):
        ctx.exit(1)


@verify.command("assert")
@click.option("--alive/--dead", "alive", default=None, help="Assert the instance is alive / dead.")
@click.option("--no-crash", is_flag=True, help="Assert no crash since launch.")
@click.option("--log-contains", default=None)
@click.option("--log-absent", default=None)
@click.option("--log-source", type=click.Choice(["main", "verbose", "launch"]), default="main")
@click.option("--session", "session_file", default=None, help="A .els/.elg to assert against.")
@click.option("--min-blocks", type=int, default=None)
@click.option("--has-block", default=None)
@click.pass_context
def verify_assert(ctx, alive, no_crash, log_contains, log_absent, log_source,
                  session_file, min_blocks, has_block):
    """Compose a pass/fail QA verdict from process/crash/log/project checks."""
    verdict = verify_core.assert_state(
        alive=alive, no_crash=no_crash, log_contains=log_contains,
        log_absent=log_absent, log_source=log_source, session_file=session_file,
        min_blocks=min_blocks, has_block=has_block,
    )
    _emit(ctx, verdict)
    if not verdict["passed"]:
        ctx.exit(1)


# ── REPL ───────────────────────────────────────────────────────────────────────

@cli.command("repl")
@click.pass_context
def repl_cmd(ctx):
    """Start the interactive REPL."""
    _run_repl(ctx)


def _run_repl(ctx) -> None:
    try:
        from .utils.repl_skin import ReplSkin
        skin = ReplSkin("element", version=__version__)
        skin.print_banner()
        pt_session = skin.create_prompt_session()
    except Exception:  # pragma: no cover - styling is best-effort
        skin = None
        pt_session = None

    click.echo("Element QA bridge REPL — type a command (e.g. `app status`, "
               "`control transport play`), `help`, or `quit`.")
    while True:
        try:
            if skin and pt_session:
                line = skin.get_input(pt_session)
            else:
                line = input("element> ")
        except (EOFError, KeyboardInterrupt):
            click.echo()
            break
        line = line.strip()
        if not line:
            continue
        if line in ("quit", "exit"):
            break
        if line in ("help", "?"):
            with click.Context(cli, info_name="cli-anything-element") as help_ctx:
                click.echo(cli.get_help(help_ctx))
            continue
        try:
            args = shlex.split(line)
        except ValueError as exc:
            click.echo(f"parse error: {exc}")
            continue
        try:
            cli.main(args=args, prog_name="cli-anything-element",
                     standalone_mode=False, obj=ctx.obj)
        except SystemExit:
            pass
        except click.ClickException as exc:
            exc.show()
        except Exception as exc:  # keep the REPL alive on any command error
            click.echo(f"error: {exc}")
    if skin:
        try:
            skin.print_goodbye()
        except Exception:
            pass


def main() -> None:
    """Console-script entry point."""
    cli(obj={})


if __name__ == "__main__":
    main()
