# Performance Baselines + Regression Guard

> Generated: 2026-05-30 | Task F7 (Wave E prep)
> Status: **TARGETS SET — live capture pending** (Element.app present at build-merged; run the guard command below to capture live numbers and replace targets with actuals)

---

## App under test

```
build-merged/element_app_artefacts/Element.app
```

Confirmed present: `ls build-merged/element_app_artefacts/Element.app` → `Contents` (directory exists).

---

## Numeric budgets

These are engineering-derived targets for a professional audio plugin host on modern Apple Silicon (M-series) hardware. Replace with measured actuals on first live run.

| Metric | Target | Notes |
|---|---|---|
| **Boot-to-window (ms)** | ≤ 3 000 | Time from `open Element.app` to first window visible in AX tree. Measured via `element_verify.py` `launch.latency_ms`. |
| **Large-session load (ms)** | ≤ 2 000 | Time to open a session with ≥15 blocks and ≥18 cables (demoGraph scale). Measured as elapsed from open-file to UI idle. |
| **Suite elapsed (s)** | ≤ 10 | Full `element_verify.py --suite all` wall-clock elapsed. Baseline for regression on UI assertion speed. |
| **Main-thread CPU idle (%)** | ≤ 10 % | CPU usage with no audio playing, no interaction. Measured via `ps -o pcpu= -p <element_pid>` after 5s settle. |
| **Frame time — webview (ms)** | ≤ 16.7 | 60 fps target; one React render cycle ≤ 16.7 ms. Measured via Chrome DevTools Performance panel on the embedded WebBrowserComponent, or via Storybook story render timings. |
| **Per-AX-check latency (ms)** | ≤ 500 | Each `assert_element_exists` / `assert_role_exists` call should resolve in ≤ 500 ms (timeout is 3 000 ms). Flag any check whose `latency_ms` regularly exceeds 500 ms. |

---

## Measurement methodology

### 1. Boot-to-window

```bash
# element_verify.py records launch.latency_ms automatically
cd tools/automation
python3 element_verify.py --suite navigation 2>&1 | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('boot_ms:', d['launch']['latency_ms'])
"
```

Element must NOT be running before this invocation (quit it first so launch is cold).

### 2. Full AX suite + elapsed

```bash
cd tools/automation
python3 element_verify.py --suite all 2>&1 | tee ../../.omo/evidence/perf-verify-run.json
# Read elapsed_s + per-check latency_ms from the JSON output
```

### 3. Main-thread CPU idle

```bash
# After Element is open and idle (no audio):
PID=$(pgrep -x "Element" | head -1)
for i in {1..5}; do ps -o pcpu= -p $PID; sleep 1; done
# Average the 5 readings; target ≤ 10%
```

### 4. Large-session load time

Open Element, then use File > Open on a saved `.els` session containing ≥15 blocks and ≥18 cables (demoGraph scale). Record the wall-clock from click to UI idle using `time` or the macOS Instruments app.

Alternatively, drive via macOS Automator / osascript and record AX idle detection latency:
```bash
# Approximate: measure time for a known block label to appear after file open
cd tools/automation
python3 -c "
import subprocess, time
t0 = time.time()
subprocess.run(['osascript', '-e', 'tell app \"Element\" to activate'], check=False)
# Poll AX for a block label to confirm load complete
from element_assertions import assert_element_exists
result = assert_element_exists('Lead Synth', timeout_s=10.0)
print('load_ms:', result['latency_ms'])
"
```

### 5. WebView frame time

With Storybook running (`cd webview && npm run storybook`), open Chrome DevTools on `http://localhost:6006` → Performance tab → Record while scrolling the Canvas story. The frame timeline shows React render + paint time.

---

## Re-runnable guard command

```bash
# Full regression guard — run after any Wave C/D/E merge to check no perf regression:
cd /Volumes/Projects/Development_Projects/Github_Repos/element/tools/automation && \
  python3 element_verify.py --suite all 2>&1 | \
  tee ../../.omo/evidence/perf-regression-$(date +%Y%m%d-%H%M%S).json | \
  python3 -c "
import json, sys
d = json.load(sys.stdin)
elapsed = d.get('elapsed_s', 0)
checks = [c for s in d.get('suites', {}).values() for c in s.get('checks', [])]
slow = [c for c in checks if c.get('latency_ms', 0) > 500]
print(f'elapsed_s: {elapsed} (budget: ≤10s)')
print(f'slow_checks (>500ms): {len(slow)}')
for c in slow:
    print(f'  SLOW: {c[\"target\"]} = {c[\"latency_ms\"]}ms')
print('PASS' if elapsed <= 10 and not slow else 'FAIL')
"
```

Save output to `.omo/evidence/perf-regression-<timestamp>.json` for diff across runs.

---

## What's NOT captured yet (E1 must fill in live numbers)

The following require a live Element run with a real session loaded:

- [ ] Actual `boot_ms` from cold launch (replace 3 000 ms target with measured value)
- [ ] Actual `load_ms` for a ≥15-block session (replace 2 000 ms target)
- [ ] Actual `main_thread_cpu_pct` at idle (replace 10% target)
- [ ] Actual per-check `latency_ms` distribution from `--suite all` (baseline the JSON)
- [ ] WebView frame time from Chrome DevTools Performance profile

Once actuals are captured, update this doc and commit the `.json` evidence file alongside it.

---

## Harness assessment

`tools/automation/element_verify.py` is an **AX-based functional verifier**, not a dedicated perf profiler. It captures:
- `launch.latency_ms` — boot-to-window time (the closest thing to a boot perf number)
- `elapsed_s` — total wall-clock for the full suite
- `latency_ms` per AX assertion — useful for detecting UI-thread stalls

For deeper frame-time profiling (WebView React render), use Chrome DevTools or Storybook performance stories. For audio-thread RT profiling, use JUCE's built-in CPU metering (LiveHealth store) or Instruments / perf on macOS.
