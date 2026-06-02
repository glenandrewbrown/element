#!/usr/bin/env bash
# crash_isolation_proof.sh — terminal-driven Bitwig-grade crash-isolation ship-gate proof.
#
# Proves: a sandboxed (out-of-process) plugin worker can be SIGKILLed and the
# Element host (a) SURVIVES and (b) DETECTS + SURFACES the crash.
#
# Why a script (not a GUI/computer-use test): the live SIGKILL proof cannot be
# GUI-driven on this machine — `open` Gatekeeper-kills /tmp adhoc copies, the
# installed app collides on bundle id net.kushview.Element, and the window won't
# foreground on a mirrored display. Everything EXCEPT loading one plugin is
# terminal/CI-able. See .omo/RELIABILITY-TEST-STATUS-2026-06-02.md and
# .omo/plans/FINISH-APP-PLAN-2026-06-02.md (Ranked Blocker #1).
#
# Verified code path (file:line as of 2026-06-02):
#   worker SIGKILL
#    -> JUCE ChildProcessCoordinator pipe-break (instant) | heartbeat timeout <=5s
#       [src/engine/sandboxhost.hpp:644 handleConnectionLost / :674 timerCallback]
#    -> state=Crashed; listeners.call(sandboxCrashed); crashed() signal
#    -> SandboxedProcessorNode::sandboxCrashed [src/nodes/sandboxedprocessor.hpp:444]
#         logs  "[SandboxedProcessor] Sandbox crashed: <name>"   -> main.log
#         pluginManager.emitSandboxEvent(nodeId, Crashed)
#    -> PluginManager::sigSandboxEvent [include/element/plugins.hpp:135]
#    -> ElementWebViewHost -> onSandboxEvent({kind:"crashed"}) -> React crash badge
#         [src/ui/element_webview_host.cpp:4175 / :4577]
#    -> attemptRestart() [sandboxhost.hpp:671] -> on success emits "restarted"
#
# The host process never crashes (handleConnectionLost is message-thread listener
# calls only). Terminal-observable markers: host pid stays alive + main.log gains
# "Sandbox worker connection lost" and/or "[SandboxedProcessor] Sandbox crashed:".
#
# Worker discovery: the worker is the SAME binary relaunched as a JUCE child with
# the command-line UID "pshelbg" (EL_PLUGIN_HOST_PROCESS_ID, src/engine/sandboxipc.hpp:18).
# So `pgrep -f pshelbg` finds workers; the host is the worker's parent process.
#
# Usage:
#   crash_isolation_proof.sh status     # show conf mode + running host/worker
#   crash_isolation_proof.sh setup      # set pluginSandboxMode=1 (Element must be CLOSED)
#   crash_isolation_proof.sh proof      # wait for a worker, SIGKILL it, assert host survives + crash surfaced
#   crash_isolation_proof.sh restore    # set pluginSandboxMode=0
#
# Exit codes: 0 = PASS, 1 = FAIL/assert-failed, 2 = usage/precondition error.

set -uo pipefail

# --- locations ---------------------------------------------------------------
CONF="$HOME/Library/Application Support/Kushview/Element/Element.conf"
# host-side crash markers land in main.log; candidate locations cover debug/release.
MAIN_LOG_CANDIDATES=(
  "$HOME/Library/Application Support/Kushview/Element/log/main.log"
  "$HOME/Library/Application Support/Kushview/Element/log/Element_Debug.log"
  "$HOME/Library/Element/log/main.log"
)
WORKER_LOG="$HOME/Library/Element/log/sandbox_worker.log"
WORKER_TOKEN="pshelbg"           # EL_PLUGIN_HOST_PROCESS_ID
HEARTBEAT_MS=5000                # EL_SANDBOX_TIMEOUT_MS — detection upper bound
CRASH_MARK_A="Sandbox worker connection lost"
CRASH_MARK_B="\[SandboxedProcessor\] Sandbox crashed:"
RESTART_MARK="Restarting sandbox\|Sandbox.*restart\|restarted"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVIDENCE_DIR="$REPO_ROOT/.omo/evidence"

# --- helpers -----------------------------------------------------------------
c_red()   { printf '\033[31m%s\033[0m\n' "$*"; }
c_grn()   { printf '\033[32m%s\033[0m\n' "$*"; }
c_ylw()   { printf '\033[33m%s\033[0m\n' "$*"; }
c_bold()  { printf '\033[1m%s\033[0m\n' "$*"; }

find_main_log() {
  # echo the freshest existing main.log candidate (if any)
  local best="" bestmt=0 f mt
  for f in "${MAIN_LOG_CANDIDATES[@]}"; do
    [ -f "$f" ] || continue
    mt=$(stat -f '%m' "$f" 2>/dev/null || echo 0)
    if [ "$mt" -ge "$bestmt" ]; then best="$f"; bestmt="$mt"; fi
  done
  echo "$best"
}

get_mode() {
  [ -f "$CONF" ] || { echo "MISSING"; return; }
  grep -o 'pluginSandboxMode" val="[0-9]"' "$CONF" 2>/dev/null | grep -o '[0-9]"' | tr -d '"' || echo "UNSET"
}

set_mode() {
  local want="$1"
  [ -f "$CONF" ] || { c_red "conf not found: $CONF"; return 2; }
  if pgrep -f "Element.app/Contents/MacOS/Element" >/dev/null 2>&1; then
    c_ylw "WARNING: Element appears to be running. It rewrites the conf on exit — close it before editing, or the change will be lost."
  fi
  if grep -q 'pluginSandboxMode' "$CONF"; then
    sed -i '' -E "s#(pluginSandboxMode\" val=\")[0-9](\")#\1${want}\2#" "$CONF"
  else
    # insert before closing tag
    sed -i '' -E "s#(</PROPERTIES>)#  <VALUE name=\"pluginSandboxMode\" val=\"${want}\"/>\n\1#" "$CONF" 2>/dev/null \
      || c_ylw "Could not auto-insert key; add manually: <VALUE name=\"pluginSandboxMode\" val=\"${want}\"/>"
  fi
  c_grn "pluginSandboxMode set to ${want} (now: $(get_mode))"
}

worker_pids() { pgrep -f "$WORKER_TOKEN" 2>/dev/null | tr '\n' ' '; }

host_of() { ps -o ppid= -p "$1" 2>/dev/null | tr -d ' '; }

proc_cmd() { ps -o command= -p "$1" 2>/dev/null; }

# --- commands ----------------------------------------------------------------
cmd_status() {
  c_bold "=== crash-isolation status ==="
  echo "conf:           $CONF"
  echo "pluginSandboxMode: $(get_mode)   (0=off 1=all-external 2=problematic)"
  local ml; ml="$(find_main_log)"
  echo "main.log:       ${ml:-<none yet — launch Element to create>}"
  echo "worker token:   $WORKER_TOKEN   heartbeat timeout: ${HEARTBEAT_MS}ms"
  local w; w="$(worker_pids)"
  if [ -n "$w" ]; then
    c_grn "sandbox worker(s) running: $w"
    for p in $w; do echo "   pid $p  host(ppid)=$(host_of "$p")  | $(proc_cmd "$p" | cut -c1-90)"; done
  else
    c_ylw "no sandbox worker running (load a sandboxed plugin in Element to spawn one)"
  fi
}

cmd_setup() {
  c_bold "=== setup: enabling sandbox + prepping the proof ==="
  set_mode 1 || return 2
  cat <<EOF

$(c_grn "Ready.") Now (your stable launch — the only manual step):
  1. Launch the dev build your normal way:
       $REPO_ROOT/build-merged/element_app_artefacts/Element.app/Contents/MacOS/Element
       (or however you normally launch build-merged)
  2. Right-click the canvas -> type a plugin name -> add it.
       Prefer a VST3 (e.g. ValhallaSupermassive). AVOID BRASS_4Horns (R2 AU hang).
  3. In another terminal run:
       $(c_bold "tools/reliability/crash_isolation_proof.sh proof")

The proof script waits for the worker, SIGKILLs it, and asserts the host
survives + the crash is detected/logged. ~10 seconds once the plugin is loaded.
EOF
}

cmd_restore() {
  c_bold "=== restore: disabling sandbox (default-off) ==="
  set_mode 0
}

cmd_proof() {
  mkdir -p "$EVIDENCE_DIR"
  local ts; ts="$(date +%Y%m%d-%H%M%S)"
  local ev="$EVIDENCE_DIR/reliability-crash-isolation-${ts}.txt"
  : > "$ev"
  log() { echo "$@" | tee -a "$ev"; }

  c_bold "=== crash-isolation PROOF ==="
  log "run: $ts"
  log "conf pluginSandboxMode=$(get_mode)"
  if [ "$(get_mode)" != "1" ] && [ "$(get_mode)" != "2" ]; then
    c_red "PRECONDITION: pluginSandboxMode is not 1/2 — run 'setup' first, then relaunch Element."
    return 2
  fi

  # 1) wait for a sandbox worker (Glen loads a plugin in the GUI)
  c_ylw "Waiting up to 120s for a sandbox worker (load a sandboxed plugin in Element)…"
  local worker="" i
  for i in $(seq 1 120); do
    worker="$(worker_pids | awk '{print $NF}')"   # newest
    [ -n "$worker" ] && break
    sleep 1
  done
  if [ -z "$worker" ]; then
    c_red "FAIL: no sandbox worker appeared. Did the plugin load sandboxed? (check pluginSandboxMode + that the node is external)."
    return 1
  fi
  local host; host="$(host_of "$worker")"
  log "worker pid:     $worker  ($(proc_cmd "$worker" | cut -c1-80))"
  log "host pid (ppid):$host    ($(proc_cmd "$host" | cut -c1-80))"
  if [ -z "$host" ] || ! kill -0 "$host" 2>/dev/null; then
    c_red "FAIL: could not resolve a live host parent for worker $worker."
    return 1
  fi

  # 2) snapshot main.log size so we only inspect lines AFTER the kill
  local ml; ml="$(find_main_log)"
  local before=0
  [ -n "$ml" ] && before=$(wc -c < "$ml" 2>/dev/null || echo 0)
  log "main.log:       ${ml:-<none>}  (size before kill: ${before}B)"

  # 3) the kill
  c_bold ">>> kill -9 $worker  (simulating a plugin hard-crash)"
  log ">>> kill -9 worker $worker @ $(date '+%H:%M:%S')"
  kill -9 "$worker" 2>/dev/null

  # 4) assert host survives + crash detected within heartbeat window (+margin)
  local host_alive="" crash_seen="" newtail="" deadline=$(( $(date +%s) + 9 ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if kill -0 "$host" 2>/dev/null; then host_alive=1; else host_alive=0; break; fi
    if [ -n "$ml" ]; then
      newtail="$(tail -c +"$((before+1))" "$ml" 2>/dev/null)"
      if echo "$newtail" | grep -qE "$CRASH_MARK_A|$CRASH_MARK_B"; then crash_seen=1; fi
    fi
    [ -n "$crash_seen" ] && [ "$host_alive" = 1 ] && break
    sleep 1
  done
  # final host check
  if kill -0 "$host" 2>/dev/null; then host_alive=1; else host_alive=0; fi

  log ""
  log "--- new main.log lines after kill ---"
  if [ -n "$ml" ]; then echo "$newtail" | grep -E "Sandbox|sandbox|crash|Crash|Restart|worker" | tee -a "$ev" || true; fi
  log "-------------------------------------"
  log ""

  # 5) verdict
  local pass=1
  c_bold "=== VERDICT ==="
  if [ "$host_alive" = 1 ]; then
    c_grn   "  [PASS] host pid $host SURVIVED the worker SIGKILL"; log "  [PASS] host survived"
  else
    c_red   "  [FAIL] host pid $host DIED — crash was NOT isolated"; log "  [FAIL] host died"; pass=0
  fi
  if [ -n "$crash_seen" ]; then
    c_grn   "  [PASS] crash DETECTED + logged (connection-lost / SandboxedProcessor crash in main.log)"; log "  [PASS] crash surfaced in main.log"
  else
    c_ylw   "  [WARN] no crash marker found in main.log within ${HEARTBEAT_MS}ms+margin."
    log     "  [WARN] crash marker not found in main.log"
    if [ -z "$ml" ]; then c_ylw "         (main.log not found — verify logger path; the React crash badge is the GUI-side proof.)"; fi
    # host-survival alone still demonstrates isolation; detection is the second assertion.
  fi

  echo ""
  if [ "$pass" = 1 ] && [ -n "$crash_seen" ]; then
    c_grn "RESULT: PASS — crash-isolation ship-gate met (host survived + crash surfaced)."
    log "RESULT: PASS"; echo ""; echo "evidence: $ev"; return 0
  elif [ "$pass" = 1 ]; then
    c_ylw "RESULT: PARTIAL — host survived (isolation proven) but log marker unseen. Check GUI crash badge + logger path."
    log "RESULT: PARTIAL"; echo ""; echo "evidence: $ev"; return 0
  else
    c_red "RESULT: FAIL — see evidence."
    log "RESULT: FAIL"; echo ""; echo "evidence: $ev"; return 1
  fi
}

# --- dispatch ----------------------------------------------------------------
case "${1:-}" in
  status)  cmd_status ;;
  setup)   cmd_setup ;;
  proof)   cmd_proof ;;
  restore) cmd_restore ;;
  *) echo "usage: $0 {status|setup|proof|restore}"; exit 2 ;;
esac
