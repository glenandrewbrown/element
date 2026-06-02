# ELEMENT.md — software-specific SOP for cli-anything-element

Analysis and operating procedure for building a CLI bridge to **Element**
(Kushview), an audio plugin host. This is the per-software companion to the
shared `HARNESS.md`.

## 1. What Element is, and why the standard model only half-applies

Element is a **real-time, GUI plugin host** (JUCE 8 / C++20). Unlike GIMP/Blender/
LibreOffice, it has **no headless or batch-render mode** — you cannot
`element --render project.els out.wav`. So the canonical cli-anything pattern
("build a file → run the tool headless → byte-verify the output") does not fully
apply. There is no deterministic output artifact; the "output" is live audio + a
GUI.

Therefore this harness verifies **behaviour and state**, not output bytes:
- the real app **launches and stays alive**,
- the **OSC control surface invokes commands** (canonical proof: OSC `quit`
  causes a clean process exit with no signal from us),
- **no crash report** is produced,
- **project files** parse to the expected structure.

## 2. Control & observation surfaces (from codebase analysis)

| Surface | Where | Used for |
|---------|-------|----------|
| **OSC command** | `src/services/oscservice.cpp` → `/element/command[/<name>]` | actuation (transport, panic, session, views, …) |
| **OSC engine** | same → `/element/engine "samplerate" <hz>` | live sample-rate change |
| **Command vocab** | `include/element/ui/commands.hpp` (`Commands::fromString`/`toString`/`getOSCAddresses`) | the set of invocable commands |
| **CLI arg** | `src/application.cpp` `maybeOpenCommandLineFile` | `Element foo.els` opens a session (single-instance forward) |
| **Project files** | `.els` (`<Session>`), `.elg` (`<Node type="Graph">`) — ValueTree **XML** | data layer (read-only here) |
| **Settings** | `Element.conf` (JUCE PropertiesFile XML); keys `oscHostEnabledKey`, `oscHostPortKey` (default 9000, OFF) | enable the OSC host before launch |
| **Logs** | `<appdata>/log/main.log`, `<appdata>/log/element-verbose.log` (`ELEMENT_VERBOSE=1`) | observation |
| **Crashes** | macOS `~/Library/Logs/DiagnosticReports/Element-*.ips` | definitive crash signal |
| **AX tree** | `tools/automation/element_verify.py` (emits JSON, PASS/FAIL exit) | UI assertions |

`<appdata>` = `~/Library/Application Support/Kushview/Element` on macOS.

## 3. The one required C++ change (and why)

The OSC infrastructure was ~90% present but the last mile was a stub:

- `CommandOSCListener::oscMessageReceived` parsed the command then did
  `// noop` — it never invoked anything.
- The receiver only listened on the bare `/element/command` address, while
  `Commands::getOSCAddresses()` generates per-command `/element/command/<name>`
  addresses that nothing listened to.
- `Commands::toString`/`fromString` covered only a subset — **no transport or
  session commands**, the two most useful for QA.

Changes made (this repo):
1. **`src/services/oscservice.cpp`** — `CommandOSCListener` now resolves the
   command from either the address tail (`/element/command/<name>`) or the first
   string arg, and invokes it via
   `world.services().find<GuiService>()->commands().invokeDirectly(id, true)`.
   The listener is registered on `/element/command` **and** every
   `Commands::getOSCAddresses()` address. Callbacks arrive on the message thread
   (`ListenerWithOSCAddress<>` defaults to `MessageLoopCallback`), so invoking
   the command manager there is thread-safe.
2. **`include/element/ui/commands.hpp`** — extended `toString`/`fromString`
   (kept symmetric) to cover transport, session, media, edit, and
   export/import commands, so they are OSC-addressable.

The OSC host itself stays OFF by default (gated by `oscHostEnabledKey`), so this
adds no behaviour unless OSC is explicitly enabled — which `app launch` does.

## 4. Operating procedure

1. **Discover** the binary: `app info` (prefers the built `build-merged` app).
2. **Launch**: `app launch --fresh` — kills any running instance (Element is
   single-instance; otherwise a new launch forwards to the old one and exits
   rc=0), enables the OSC host in `Element.conf` (backed up), launches with
   `ELEMENT_VERBOSE=1`, waits, and confirms alive + OSC bound.
3. **Drive**: `control …` / `engine …`. Remember UDP is fire-and-forget.
4. **Observe**: `app status` (alive / crashed / exited), `app logs`, `app crashes`.
5. **Verify**: `verify assert …` for a composite verdict; `verify ax` for the
   accessibility suites.
6. **Stop**: `app quit` (graceful OSC), `app stop` (SIGTERM), or `app kill`
   (SIGKILL — crash-isolation simulation).

## 5. Gotchas discovered while building this

- **Single-instance lock.** A stale long-running Element (holding
  `~/Library/Caches/com.juce.locks/juceAppLock_Element`) makes every new launch
  forward-and-quit rc=0 with no new `main.log` entry. `app launch --fresh`
  clears it; `status`/`launch` report `forwarded_to_existing`.
- **Process name.** The running app shows in `ps` as a bare `Element` (argv0),
  not a full path — process matching accounts for this.
- **Exit ≠ crash.** Only assert a crash when a `.ips` report exists; a vanished
  process with no report is `exited_unexpectedly`.
- **`.els` is XML, not gzip.** Despite a gzip path elsewhere in `session.cpp`,
  saved `.els`/`.elg` files on disk are plain ValueTree XML — parse directly.
- **Settings are the user's real `Element.conf`.** Enabling OSC edits it; a
  `.cli-bak` backup is written and `app restore-settings` reverts it.
