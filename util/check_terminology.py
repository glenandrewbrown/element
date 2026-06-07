#!/usr/bin/env python3
"""
check_terminology.py — Terminology guard for Element source code.

Scans src/ui/** and src/services/** (.cpp/.hpp) for double-quoted string literals
that contain banned legacy terms: Graph, Session, Node, Preset (word-boundary,
case-sensitive). Exits 0 if clean, 1 if violations are found.

Allowlist: util/terminology-allowlist.txt (one exact quoted string per line,
optionally prefixed with "path|" to scope to a file path suffix).
"""

import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent

SCAN_DIRS = [
    REPO_ROOT / "src" / "ui",
    REPO_ROOT / "src" / "services",
]
EXTENSIONS = {".cpp", ".hpp"}

ALLOWLIST_FILE = SCRIPT_DIR / "terminology-allowlist.txt"

# Word-boundary pattern for banned terms inside a double-quoted string literal.
# We extract the quoted string first, then test the content.
# Import/Export added 2026-06-07 (4c jargon purge) — use "Bring in"/"Send out" instead.
BANNED_RE = re.compile(r'\b(Graph|Session|Node|Preset|Import|Export)\b')

# Match a complete double-quoted string literal (non-greedy, no newlines).
STRING_LITERAL_RE = re.compile(r'"([^"\n]*)"')

# Lines to skip entirely — these contexts are not user-visible UI strings.
SKIP_LINE_PATTERNS = [
    re.compile(r'^\s*//'),                   # single-line comment
    re.compile(r'^\s*\*'),                   # block comment continuation
    re.compile(r'#include'),                 # preprocessor include
    re.compile(r'\bIdentifier\s*\('),        # JUCE Identifier("...")
    re.compile(r'\btags::'),                 # tags:: namespace references
    re.compile(r'\.setProperty\s*\('),       # ValueTree setProperty
    re.compile(r'\bLogger::'),              # debug logging
    re.compile(r'\bDBG\s*\('),              # JUCE DBG macro
    re.compile(r'\bjassert\s*\('),          # JUCE assertion
    re.compile(r'^\s*#'),                   # any preprocessor directive
]

# ---------------------------------------------------------------------------
# Allowlist loading
# ---------------------------------------------------------------------------

def load_allowlist(path: Path) -> list[tuple[str | None, str]]:
    """
    Returns list of (path_suffix_or_None, exact_quoted_string) tuples.
    Quoted string includes the surrounding double-quotes.
    """
    entries: list[tuple[str | None, str]] = []
    if not path.exists():
        return entries
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        # Strip inline comment
        comment_idx = line.find("  #")
        if comment_idx != -1:
            line = line[:comment_idx].strip()
        if not line:
            continue
        path_prefix: str | None = None
        if "|" in line:
            path_prefix, line = line.split("|", 1)
            path_prefix = path_prefix.strip()
            line = line.strip()
        entries.append((path_prefix, line))
    return entries


def is_allowlisted(file_path: Path, quoted_string: str,
                   allowlist: list[tuple[str | None, str]]) -> bool:
    """quoted_string includes surrounding double-quotes."""
    file_str = str(file_path)
    for path_prefix, entry in allowlist:
        if entry != quoted_string:
            continue
        if path_prefix is None or file_str.endswith(path_prefix):
            return True
    return False


# ---------------------------------------------------------------------------
# Block-comment tracking (best-effort)
# ---------------------------------------------------------------------------

def scan_file(file_path: Path, allowlist: list[tuple[str | None, str]]) -> list[str]:
    """
    Returns list of violation strings: "file:line: <quoted-string>"
    """
    violations: list[str] = []
    in_block_comment = False

    try:
        lines = file_path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return violations

    for lineno, line in enumerate(lines, start=1):
        # Track block comments (best-effort — handles /* ... */ on same/different lines)
        if in_block_comment:
            if "*/" in line:
                in_block_comment = False
            continue
        if "/*" in line:
            # Check if it closes on the same line
            after_open = line[line.index("/*") + 2:]
            if "*/" not in after_open:
                in_block_comment = True
            continue

        # Apply skip patterns
        skip = False
        for pat in SKIP_LINE_PATTERNS:
            if pat.search(line):
                skip = True
                break
        if skip:
            continue

        # Extract all double-quoted string literals and check each
        for m in STRING_LITERAL_RE.finditer(line):
            content = m.group(1)
            if not BANNED_RE.search(content):
                continue
            quoted = f'"{content}"'
            if is_allowlisted(file_path, quoted, allowlist):
                continue
            violations.append(f"{file_path}:{lineno}: {quoted}")

    return violations


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    allowlist = load_allowlist(ALLOWLIST_FILE)

    all_violations: list[str] = []
    for scan_dir in SCAN_DIRS:
        if not scan_dir.exists():
            continue
        for file_path in sorted(scan_dir.rglob("*")):
            if file_path.suffix not in EXTENSIONS:
                continue
            all_violations.extend(scan_file(file_path, allowlist))

    if all_violations:
        print("TERMINOLOGY VIOLATIONS FOUND:")
        for v in all_violations:
            print(f"  {v}")
        print(f"\n{len(all_violations)} violation(s). Fix or add to util/terminology-allowlist.txt.")
        return 1

    print("terminology-guard: OK (no violations)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
