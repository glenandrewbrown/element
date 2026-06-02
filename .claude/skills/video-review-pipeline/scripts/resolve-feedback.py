#!/usr/bin/env python3
"""Flip a ui-comments.jsonl item to status:"resolved" with note + commit.

Rewrites the matching record in place, matching the existing schema:
  adds resolvedAt, resolvedNote, resolvedCommit; sets status="resolved".

Usage:
  resolve-feedback.py --id 1780358016383-kb3rh --note "what changed" --commit 6cc20556
"""
import argparse, json, sys, time
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]          # .../element
CHANNEL = REPO / ".omo" / "audit" / "ui-comments.jsonl"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True, help="record id from log-feedback.py")
    ap.add_argument("--note", required=True, help="resolvedNote — what changed")
    ap.add_argument("--commit", default=None, help="short commit sha")
    args = ap.parse_args()

    if not CHANNEL.exists():
        print(f"ERROR: channel not found: {CHANNEL}", file=sys.stderr)
        return 1

    lines = CHANNEL.read_text(encoding="utf-8").splitlines()
    found = False
    out = []
    for ln in lines:
        s = ln.strip()
        if not s:
            continue
        try:
            rec = json.loads(s)
        except json.JSONDecodeError:
            out.append(ln)          # preserve unparseable lines untouched
            continue
        if rec.get("id") == args.id:
            rec["status"] = "resolved"
            rec["resolvedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
            rec["resolvedNote"] = args.note
            if args.commit:
                rec["resolvedCommit"] = args.commit
            found = True
        out.append(json.dumps(rec, ensure_ascii=False))

    if not found:
        print(f"ERROR: id not found: {args.id}", file=sys.stderr)
        return 1

    CHANNEL.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"resolved {args.id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
