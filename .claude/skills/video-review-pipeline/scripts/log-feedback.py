#!/usr/bin/env python3
"""Append a feedback item to .omo/audit/ui-comments.jsonl (schema-exact).

Matches the existing record shape:
  {id, ts, storyId, title, name, severity, text, status:"open"}

Usage:
  log-feedback.py --story "review:quickadd:audio" --title "🔍 Review/QuickAdd" \
                  --name "Port-type AUDIO" --severity P2 --text "the ask" \
                  [--source "feedback.mov@1:23"]

Prints the generated id (keep it for resolve-feedback.py).
"""
import argparse, json, os, random, string, sys, time
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]          # .../element
CHANNEL = REPO / ".omo" / "audit" / "ui-comments.jsonl"
VALID_SEV = {"P0", "P1", "P2", "P3"}


def gen_id() -> str:
    ms = int(time.time() * 1000)
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=5))
    return f"{ms}-{suffix}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--story", required=True, help="storyId, e.g. review:quickadd:audio")
    ap.add_argument("--title", required=True, help="story title, e.g. 🔍 Review/QuickAdd")
    ap.add_argument("--name", required=True, help="state/variant name")
    ap.add_argument("--severity", required=True, choices=sorted(VALID_SEV))
    ap.add_argument("--text", required=True, help="the feedback / ask")
    ap.add_argument("--source", default=None, help="optional provenance, e.g. feedback.mov@1:23")
    args = ap.parse_args()

    rec = {
        "id": gen_id(),
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
        "storyId": args.story,
        "title": args.title,
        "name": args.name,
        "severity": args.severity,
        "text": args.text,
        "status": "open",
    }
    if args.source:
        rec["source"] = args.source

    CHANNEL.parent.mkdir(parents=True, exist_ok=True)
    with CHANNEL.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    print(rec["id"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
