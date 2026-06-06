/**
 * Terminology guard (T7, Glen QA 2026-06-06).
 *
 * Spec terms are mandatory in user-visible UI: Project (not Session),
 * Board (not Graph), Block (not Node), Snippet (not Preset — EXCEPT
 * single-plugin parameter presets, which legitimately stay "Preset" per
 * Glen's 2026-06-06 decision; those live in terminology-allowlist.json).
 *
 * This test extracts USER-VISIBLE string positions from component sources —
 * JSX text nodes and title / aria-label / placeholder / label attributes —
 * and fails when a banned legacy term appears outside the allowlist. It is
 * the enforcement gate: reintroducing "Session"/"Graph"/"Node"/"Preset" in a
 * rendered string breaks `npm test`.
 *
 * Identifiers, imports, comments, store/bridge names are NOT scanned —
 * only rendered-string positions. Stories/tests are excluded (doc prose
 * legitimately references legacy terms when explaining renames).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC_ROOT = join(__dirname, "..");
const BANNED = /\b(?:[Gg]raphs?|[Ss]essions?|[Nn]odes?|[Pp]resets?)\b/;

type AllowEntry = { file: string; contains: string; reason: string };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const allowlist: AllowEntry[] = JSON.parse(
  readFileSync(join(SRC_ROOT, "..", "terminology-allowlist.json"), "utf8"),
);

function isAllowed(file: string, text: string): boolean {
  return allowlist.some(
    (a) => file.endsWith(a.file) && text.includes(a.contains),
  );
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      yield* walk(p);
    } else if (
      p.endsWith(".tsx") &&
      !p.endsWith(".stories.tsx") &&
      !p.endsWith(".test.tsx")
    ) {
      yield p;
    }
  }
}

/** Extract user-visible strings: JSX text nodes + key string-attrs. */
function extractVisibleStrings(raw: string): string[] {
  // Strip comments first — JSDoc usage examples legitimately show legacy
  // terms and must not trip the guard.
  const source = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const out: string[] = [];
  // JSX text nodes: between a closing '>' and the next '<', no braces.
  // Generic type params (`Array<…>`, `useState<…>`) also match `>…<`, so
  // anything that looks like code (operators, keywords, comment stars) is
  // skipped — only prose-shaped text survives.
  const CODEISH = /[;=(){}[\]]|=>|\bconst\b|\breturn\b|\blet\b|\bnew\b|^\s*\*/;
  for (const m of source.matchAll(/>([^<>{}\n][^<>{}]*)</g)) {
    const t = m[1].trim();
    if (t.length > 1 && /[A-Za-z]/.test(t) && !CODEISH.test(t)) out.push(t);
  }
  // Visible string attributes / props (JSX `attr="…"` and object `attr: "…"`).
  for (const m of source.matchAll(
    /\b(?:title|aria-label|ariaLabel|placeholder|label)\s*[=:]\s*["']([^"']+)["']/g,
  )) {
    out.push(m[1]);
  }
  return out;
}

describe("terminology guard (spec: Project/Board/Block/Snippet)", () => {
  it("no banned legacy terms in user-visible strings", () => {
    const violations: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file);
      const source = readFileSync(file, "utf8");
      for (const text of extractVisibleStrings(source)) {
        const hit = text.match(BANNED);
        if (hit && !isAllowed(rel, text)) {
          violations.push(`${rel}: "${text}" (banned: ${hit[0]})`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("allowlist entries all still match something (no stale entries)", () => {
    const stale: string[] = [];
    for (const a of allowlist) {
      let found = false;
      for (const file of walk(SRC_ROOT)) {
        if (!relative(SRC_ROOT, file).endsWith(a.file)) continue;
        if (readFileSync(file, "utf8").includes(a.contains)) {
          found = true;
          break;
        }
      }
      if (!found) stale.push(`${a.file} :: "${a.contains}"`);
    }
    expect(stale, `stale allowlist entries:\n${stale.join("\n")}`).toEqual([]);
  });
});
