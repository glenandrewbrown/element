<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# data/ — Application Resources

Static resources bundled into `Element.app` at build time via
`data/CMakeLists.txt`. Contains fonts, icons, demo sessions, and metadata
files. Do not create AGENTS.md inside `fonts/`, `images/`, or `sessions/`.

## Key Files / Subdirectories
| Path | Description |
|------|-------------|
| `fonts/` | Bundled typefaces (e.g. `Roboto-Regular.ttf`) |
| `images/` | App icons and image assets (`icon.png`, `element-icon-v1.svg`, etc.) |
| `sessions/` | Demo/template sessions (`atomports.els`, `datadial.els`, `embeds.els`, `musicbox.els`, `pluginstack.els`) |
| `acknowledgements.txt` | Third-party acknowledgements shown in About dialog |
| `developers.txt` | Developer credits |
| `intro.txt` | Intro text shown on first launch |
| `element.desktop.in` | Linux `.desktop` entry template |
| `screenshot.png` | Store/README screenshot |
| `CMakeLists.txt` | Registers all resources for bundling |

## For AI Agents
- Demo sessions (`*.els`) are the canonical test fixtures for session-load
  verification — use them with `cli-anything-element inspect` to probe
  graph structure.
- Adding a new resource requires an entry in `data/CMakeLists.txt` and a
  cmake reconfigure (sources use `file(GLOB_RECURSE)` for code, but
  resources are listed explicitly).
