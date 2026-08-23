# iTerm2: highlight "🔴 YOUR MOVE" action lines

**Goal:** make the AI assistant's action-required banner visually pop and/or alert,
using only iTerm2's built-in trigger system (no changes to the assistant's output needed).

---

## TOP RECOMMENDATION — Trigger: Highlight Text + Post Notification

### Why
Trigger actions fire on regex-matched visible text, so they work regardless of how the
TUI renderer draws the banner. No shell integration, no escape codes, no assistant changes needed.
"Highlight Text" gives an immediate, unmissable color flash in the terminal buffer.
"Post Notification" sends a macOS Notification Center alert so you catch it even if not watching.
Two separate triggers on the same regex gives you both.

### Exact setup

1. Open **Settings → Profiles → [your profile] → Advanced tab**
2. In the **Triggers** section click **Edit**
3. Click **+** to add trigger #1:
   - **Regular Expression:** `🔴 YOUR MOVE`
   - **Action:** `Highlight Text`
   - **Parameters:** choose a background colour (e.g. bright amber `#FF9500` bg + black `#000000` fg)
   - **Instant:** checked (fires as soon as the line arrives, not on newline)
4. Click **+** to add trigger #2 (same regex, different action):
   - **Regular Expression:** `🔴 YOUR MOVE`
   - **Action:** `Post Notification`
   - **Parameters:** notification body text e.g. `Action required in terminal`
   - **Instant:** checked
5. Click **Close**, then **Other Actions → Save Changes**

Regex notes: ICU regex. The emoji literal works as-is. If you want to also match
`━━━ 🔴 YOUR MOVE ━━━` variants, use: `🔴 YOUR MOVE`  — the `.*` wrapper is not
needed; partial-line match is the default. A broader pattern: `🔴.+YOUR MOVE` would
also catch any decoration between the emoji and the text.

### Result
Every matching line gets a coloured highlight permanently in the scrollback, AND a
macOS notification fires. Clicking the notification focuses the iTerm2 window.

---

## 2ND CHOICE — Trigger: Capture Output (toolbelt side-pane)

Add a third trigger on the same regex:
- **Action:** `Capture Output`
- Requires **Shell Integration** to be installed (`curl -L https://iterm2.com/shell_integration/install_shell_integration.sh | bash`)

**What you get:** every `🔴 YOUR MOVE` line is collected into the **Captured Output**
toolbelt pane (View → Toolbelt → Captured Output). Clicking any entry scrolls the
terminal to that exact line and briefly highlights it. Useful as a running log of all
action points in a long session.

**Caveat:** Shell Integration must be installed; default scrollback (1000 lines) may
be too short for a long session — increase it in Settings → Profiles → Terminal →
Scrollback lines.

---

## Optional extras

| Want | Trigger action |
|------|----------------|
| Dock bounce when you're in another app | `Bounce Dock Icon` |
| Audible alert (text-to-speech via macOS) | `Run Silent Coprocess` → command: `say "your move"` |
| Named jump point (Cmd-Shift-↑/↓) | `Set Named Mark` — requires Shell Integration |
| Window title change as a status indicator | `Set Title` → e.g. `⚠ YOUR MOVE` |

---

## Caveats

- iTerm2 escape codes (OSC 1337 / OSC 9) are NOT viable here — the AI assistant's
  output goes through a TUI renderer that will strip or mangle them before iTerm2 sees
  the text. Stick to trigger-on-visible-text.
- Triggers are profile-scoped. Apply them to whichever profile you use for AI work.
- "Instant" matching (checkbox in trigger row) fires on partial lines — keep it checked
  so the highlight appears the moment the banner is printed, not after the next newline.
