## [2026-05-08T02:05:14Z] Session Init: bug-catcher-wave2

### Architecture (ESTABLISHED FROM PRIOR SESSION)
- Engine snapshot: C++ elementGetEngineSnapshot at src/ui/element_webview_host.cpp:885-958
- React store: webview/src/stores/useEngineSnapshotStore.ts (polls 250ms)
- Selectors: selectCpuPercent/selectSampleRate/selectBufferSize/selectDeviceName/selectEngineRunning/selectTransportPlaying/selectTransportRecording/selectTempoBpm/selectTimeSig/selectTransportTimecode
- logBridgeError: webview/src/bridge/bridgeError.ts - use in ALL new bridge wrappers
- F.0 design system: webview/src/components/neu/{Icon,EmptyState,Skeleton,NeuPromptModal}.tsx

### Commit Protocol
- NEVER --no-verify
- Use `git commit -F /tmp/msg.txt` for multi-line (hook rejects HEREDOC)
- Branch: local-enhancements
- HEAD at session start: 62b6fa9b

### AX Harness
- Venv at .sisyphus/qa-venv (pyobjc installed)
- Element.app needs ~12s for AX responsiveness after launch
- Script: tools/automation/element_verify.py --suite all
- AX map: tools/automation/element_ax_map.py --depth 8

### Icon Semantic Ratification (Glen approved)
- Power = MIDI Panic ONLY (ratified)
- All other Power uses are semantic mismatches

- **AX Accessibility**: The macOS AX tree surfaces `AXTitle` from the HTML `title=` attribute on `<button>`. The `aria-label` on a child `<Icon>` component is NOT visible at the button level in the AX scan at depth <= 8. Fix: put `title="[Action Name]"` directly on the `<button>` element.
