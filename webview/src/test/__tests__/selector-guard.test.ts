/**
 * Zustand-selector regression guard (deep-app-audit plan, item 9).
 *
 * FAILS CI if a Zustand store-hook selector returns a freshly-allocated
 * reference WITHOUT being wrapped in `useShallow`. That is the exact shape of
 * the BlockEmbed-class v5 loop: Zustand v5 forwards the raw selector result to
 * React's `useSyncExternalStore`, which compares snapshots with `Object.is`. A
 * selector that allocates a NEW array/object every call is never `Object.is`-
 * equal to the previous snapshot, so React re-renders forever and throws
 * "The result of getSnapshot should be cached" → "Maximum update depth
 * exceeded". `useShallow` element-compares and caches, which is the fix.
 *
 * This is a STATIC AST guard (approach (a)), not a runtime probe — the
 * companion runtime audit lives in
 * `src/stores/__tests__/task3.selectorLoops.audit.test.tsx`. A static guard is
 * cheap, deterministic, and runs in CI with no browser. It uses the TypeScript
 * compiler API (a devDependency already present) so it works in CI without the
 * MCP ast_grep tooling.
 *
 * ── What is flagged (and only this) ──────────────────────────────────────
 * A call `useXxxStore(<selector>)` where:
 *   • the selector is an inline arrow/function (NOT a bare identifier — those
 *     resolve to the exported `select*` functions, all proven non-allocating
 *     in the audit's §B), AND
 *   • the selector is NOT wrapped in `useShallow(...)`, AND
 *   • a `return` expression **in the selector's own body** has an OUTERMOST
 *     node that allocates a fresh reference:
 *       - array literal `[...]`  / object literal `{...}` / spread element
 *       - `new Array/Set/Map(...)`
 *       - a chained `.map/.filter/.slice/.reduce/.concat/.flatMap(...)` result
 *     This also descends into the BRANCHES of value-selecting combinators
 *     (`?:`, `??`, `&&`, `||`), so `(s) => s.x ?? []` and
 *     `(s) => cond ? s.nodes.map(...) : x` are caught — the returned value is a
 *     branch, and each branch is still classified by its own outermost node.
 *
 * ── Why "outermost node" (the 0-false-positive rule) ─────────────────────
 * Classification is on the OUTERMOST node of each return expression, never
 * "the expression contains an allocating call". This is what keeps the guard
 * at zero false positives against the 12 audited-safe selectors AND the rest
 * of the real tree:
 *   • `useCableMeterStore((s) => Object.keys(s.levels).length)` — contains
 *     `Object.keys` but the OUTERMOST node is `.length` → a number → SAFE.
 *   • `Cable.tsx` `fanOffset` — block body uses `.filter`/`.find` internally
 *     but every `return` is a NUMBER; the transient arrays are never returned
 *     → SAFE. We collect returns from the selector's OWN scope only (we stop
 *     descending at nested-function boundaries, so the `.filter((p) => …)`
 *     callback is not mistaken for a selector return).
 *   • `.find()/.findIndex()` return an EXISTING element ref (or `undefined`),
 *     never a new container → SAFE.
 *   • raw store-field refs (`s.widgets`), primitives, ternaries → SAFE.
 *
 * Allocation that happens in a component body or a `useMemo` runs AFTER the
 * selector returned a stable ref, so it never feeds the store subscription's
 * equality check — those (MacroDashboard.tsx:57, QuickAddPopup.tsx:131,
 * CommandPalette.tsx, InspectorHub.tsx:505, …) are intentionally NOT scanned:
 * we only inspect the selector argument passed to the store hook.
 */

import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import ts from "typescript";

// ── Configuration ─────────────────────────────────────────────────────────

/** Store-hook callee names: `useXStore` for any X. */
const STORE_HOOK_RE = /^use[A-Z][A-Za-z0-9]*Store$/;

/** Array/Set/Map mutator-style calls whose RESULT is a fresh container. */
const ALLOCATING_METHODS = new Set([
  "map",
  "filter",
  "slice",
  "reduce",
  "concat",
  "flatMap",
]);

/** `new X(...)` constructors that yield a fresh allocation. */
const ALLOCATING_CTORS = new Set(["Array", "Set", "Map"]);

/**
 * Inline allow-list. EMPTY today — the real tree has zero offenders, so no
 * exception is needed. Documented here as the single place to add a
 * `"relative/path.tsx:LINE"` entry WITH a rationale if a genuinely-safe
 * pattern is ever mis-flagged. Keeping it empty preserves the guard's
 * catch-power.
 */
const ALLOW_LIST: ReadonlySet<string> = new Set<string>([]);

// ── File discovery ──────────────────────────────────────────────────────────

const SRC_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
); // …/webview/src

/** Recursively collect production `.ts`/`.tsx` files (excluding tests/stories). */
function collectSourceFiles(root: string): string[] {
  const out: string[] = [];
  const skipDirs = new Set(["__tests__", "node_modules", "test"]);
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (/\.(test|spec|stories)\.(ts|tsx)$/.test(entry.name)) continue;
      if (/\.d\.ts$/.test(entry.name)) continue;
      out.push(full);
    }
  };
  walk(root);
  return out;
}

// ── AST classification ──────────────────────────────────────────────────────

/**
 * Returns true iff the value `expr` can yield allocates a fresh reference.
 *
 * Classification is on the OUTERMOST node — never a blanket "contains an
 * allocating call" — which is what guarantees zero false positives
 * (`Object.keys(x).length` → outermost is `.length` → not flagged). The single
 * exception is *value-selecting* combinators — ternary `?:`, `??`, `&&`, `||` —
 * where the actual returned value is one of the BRANCHES, so we apply the
 * outermost-node test to each branch. That catches `(s) => s.x ?? []` and
 * `(s) => cond ? s.nodes.map(...) : x` (both real loop shapes) without
 * widening to a contains-scan.
 */
function returnsFreshAllocation(expr: ts.Expression): boolean {
  // Unwrap parens / type assertions (`as T`, `<T>`, `!`) — these do not change
  // the allocation identity of the underlying expression.
  let e: ts.Expression = expr;
  while (true) {
    if (ts.isParenthesizedExpression(e)) {
      e = e.expression;
    } else if (ts.isAsExpression(e) || ts.isTypeAssertionExpression(e)) {
      e = e.expression;
    } else if (ts.isNonNullExpression(e)) {
      e = e.expression;
    } else {
      break;
    }
  }

  // Value-selecting combinators: the returned value is a branch, so recurse
  // into each branch (still outermost-node per branch, not a contains-scan).
  if (ts.isConditionalExpression(e)) {
    return (
      returnsFreshAllocation(e.whenTrue) || returnsFreshAllocation(e.whenFalse)
    );
  }
  if (
    ts.isBinaryExpression(e) &&
    (e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      e.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    return (
      returnsFreshAllocation(e.left) || returnsFreshAllocation(e.right)
    );
  }

  // Array / object literal directly returned.
  if (ts.isArrayLiteralExpression(e) || ts.isObjectLiteralExpression(e)) {
    return true;
  }

  // `new Array(...)` / `new Set(...)` / `new Map(...)`.
  if (ts.isNewExpression(e) && ts.isIdentifier(e.expression)) {
    if (ALLOCATING_CTORS.has(e.expression.text)) return true;
  }

  // Chained `.map/.filter/.slice/.reduce/.concat/.flatMap(...)` — the call's
  // RESULT is a fresh array. Outermost must be the CallExpression itself.
  if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
    const method = e.expression.name.text;
    if (ALLOCATING_METHODS.has(method)) return true;
  }

  return false;
}

/**
 * Collect every `return` expression that belongs to `fnBody`'s OWN scope,
 * stopping the descent at any nested function/arrow boundary so that callbacks
 * passed to `.filter(...)`/`.map(...)` inside the selector are not mistaken for
 * the selector's own returns. For a concise arrow (`(s) => expr`) the body IS
 * the single return expression.
 */
function collectOwnReturns(body: ts.ConciseBody): ts.Expression[] {
  // Concise arrow body: the expression itself is the return value.
  if (!ts.isBlock(body)) {
    return [body];
  }

  const returns: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    // Do NOT descend into nested function scopes — their returns are not ours.
    if (
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isFunctionDeclaration(node)
    ) {
      return;
    }
    if (ts.isReturnStatement(node) && node.expression) {
      returns.push(node.expression);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return returns;
}

/** The two selector function forms Zustand accepts inline. */
function isInlineSelectorFn(
  node: ts.Node,
): node is ts.ArrowFunction | ts.FunctionExpression {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

export interface Offender {
  file: string; // relative to webview/
  line: number; // 1-based
  callee: string; // e.g. "useGraphStore"
  snippet: string; // the offending return expression text (truncated)
}

/**
 * Pure scanner over a fixed file list. Returns every store-hook call whose
 * inline selector returns a fresh allocation without `useShallow`.
 *
 * Exported & list-driven so the catch-power proof can hand it an arbitrary set
 * of files (including a throwaway bad fixture) with no globbing involved.
 */
export function findOffenders(files: readonly string[]): Offender[] {
  const offenders: Offender[] = [];

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const scriptKind = file.endsWith(".tsx")
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      /*setParentNodes*/ true,
      scriptKind,
    );

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        STORE_HOOK_RE.test(node.expression.text) &&
        node.arguments.length >= 1
      ) {
        const callee = node.expression.text;
        const arg = node.arguments[0];

        // `useXStore(useShallow(...))` → explicitly safe, skip.
        const isUseShallowWrapped =
          ts.isCallExpression(arg) &&
          ts.isIdentifier(arg.expression) &&
          arg.expression.text === "useShallow";

        if (!isUseShallowWrapped && isInlineSelectorFn(arg)) {
          const returns = collectOwnReturns(arg.body);
          for (const ret of returns) {
            if (returnsFreshAllocation(ret)) {
              const { line } = sf.getLineAndCharacterOfPosition(
                ret.getStart(sf),
              );
              const rel = path.relative(path.resolve(SRC_ROOT, ".."), file);
              const key = `${rel}:${line + 1}`;
              if (ALLOW_LIST.has(key)) continue;
              offenders.push({
                file: rel,
                line: line + 1,
                callee,
                snippet: ret.getText(sf).replace(/\s+/g, " ").slice(0, 120),
              });
              break; // one report per selector is enough
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  return offenders;
}

function fmt(offenders: readonly Offender[]): string {
  return offenders
    .map((o) => `  ${o.file}:${o.line}  ${o.callee}(...)  →  ${o.snippet}`)
    .join("\n");
}

// ── Evidence helpers ────────────────────────────────────────────────────────

const EVIDENCE_DIR = path.resolve(SRC_ROOT, "..", "..", ".omo", "evidence");

function writeEvidence(name: string, body: string): void {
  try {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(EVIDENCE_DIR, name), body, "utf8");
  } catch {
    // Evidence capture is best-effort; never fail the test on a write hiccup.
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────

const SOURCE_FILES = collectSourceFiles(SRC_ROOT);

// Catch-power proof runs FIRST so the throwaway fixture can never leak into the
// clean-tree scan (it is deleted in `finally`, and the clean test re-globs).
describe("selector guard — catch-power proof (temporary fixture)", () => {
  it("FLAGS a fresh-array selector that is missing useShallow", () => {
    const tmp = path.join(SRC_ROOT, "test", "__guard_fixture_tmp.tsx");
    // Defensive: remove any stale fixture before writing.
    if (fs.existsSync(tmp)) fs.rmSync(tmp);

    const badSource = [
      'import { useGraphStore } from "../stores/useGraphStore";',
      "",
      "// Deliberately-bad selector: returns a fresh `.map` array with NO",
      "// useShallow — this is the BlockEmbed-class v5 loop the guard must catch.",
      "export function Bad() {",
      "  const ids = useGraphStore((s) => s.nodes.map((n) => n.id));",
      "  return ids;",
      "}",
      "",
    ].join("\n");

    let offenders: Offender[] = [];
    try {
      fs.writeFileSync(tmp, badSource, "utf8");
      // Scan a path set INCLUDING the temp file alongside the whole real tree:
      // proves the bad selector is singled out amid the clean tree, not just in
      // isolation.
      offenders = findOffenders([...SOURCE_FILES, tmp]);

      const hit = offenders.find((o) =>
        o.file.endsWith("__guard_fixture_tmp.tsx"),
      );

      writeEvidence(
        "task-9-guard-fail.txt",
        [
          "# Task 9 — selector guard CATCH-POWER proof (must FAIL on a bad selector)",
          "",
          "Scanned the whole real tree PLUS a temporary throwaway fixture containing",
          "a deliberately-bad selector `useGraphStore((s) => s.nodes.map((n) => n.id))`",
          "with NO useShallow.",
          "",
          `Files scanned: ${SOURCE_FILES.length + 1} (real tree ${SOURCE_FILES.length} + 1 temp fixture)`,
          `Offenders found: ${offenders.length}`,
          fmt(offenders),
          "",
          hit
            ? `RESULT: PASS — guard FLAGGED the bad selector at ${hit.file}:${hit.line} (and ONLY it)`
            : "RESULT: FAIL — guard did NOT flag the bad selector",
          "",
        ].join("\n"),
      );

      expect(hit, "guard must flag the deliberately-bad fixture selector").toBeTruthy();
      expect(hit?.callee).toBe("useGraphStore");
      // The bad fixture must be the SOLE offender — the real tree contributes none.
      expect(offenders).toHaveLength(1);
    } finally {
      if (fs.existsSync(tmp)) fs.rmSync(tmp);
    }

    // And: the fixture is gone afterwards (no leftover).
    expect(fs.existsSync(tmp)).toBe(false);
  });
});

// Discrimination matrix: pins the OUTERMOST-node rule so a future "contains"
// loosening (which would re-introduce false positives) fails loudly. Each line
// is annotated SAFE/FLAG; we assert the scanner flags exactly the FLAG lines.
describe("selector guard — discrimination matrix (outermost-node rule)", () => {
  it("flags fresh allocations only, never safe shapes (the FP traps)", () => {
    const tmp = path.join(SRC_ROOT, "test", "__guard_matrix_tmp.tsx");
    if (fs.existsSync(tmp)) fs.rmSync(tmp);

    // Line numbers are 1-based from the start of this template.
    const lines = [
      'import { useGraphStore } from "../stores/useGraphStore";', // 1
      'import { useCableMeterStore } from "../stores/useCableMeterStore";', // 2
      'import { useShallow } from "zustand/react/shallow";', // 3
      "export function Probe() {", // 4
      "  // SAFE: outermost is .length (a number), though it contains Object.keys",
      "  const a = useCableMeterStore((s) => Object.keys(s.levels).length);", // 6 SAFE
      "  // SAFE: raw store-field ref",
      "  const b = useGraphStore((s) => s.nodes);", // 8 SAFE
      "  // SAFE: .find returns an existing element ref",
      "  const c = useGraphStore((s) => s.nodes.find((n) => n.id === b[0]?.id));", // 10 SAFE
      "  // SAFE: block body uses .filter internally but returns a number",
      "  const d = useGraphStore((s) => {", // 12 SAFE
      "    const out = s.edges.filter((e) => e.source === b[0]?.id);",
      "    return out.length;",
      "  });",
      "  // SAFE: wrapped in useShallow",
      "  const e = useGraphStore(useShallow((s) => s.nodes.map((n) => n.id)));", // 17 SAFE
      "  // FLAG: fresh .map array, no useShallow",
      "  const f = useGraphStore((s) => s.nodes.map((n) => n.id));", // 19 FLAG
      "  // FLAG: object literal",
      "  const g = useGraphStore((s) => ({ count: s.nodes.length }));", // 21 FLAG
      "  // FLAG: array literal with spread",
      "  const h = useGraphStore((s) => [...s.nodes]);", // 23 FLAG
      "  // FLAG: new Set(...)",
      "  const i = useGraphStore((s) => new Set(s.nodes));", // 25 FLAG
      "  // FLAG: ?? fallback allocates a fresh [] when left is nullish",
      "  const j = useGraphStore((s) => s.selectedNodeId ?? []);", // 27 FLAG
      "  // FLAG: ternary branch allocates a fresh .map array",
      "  const k = useGraphStore((s) => (b.length ? s.nodes.map((n) => n.id) : b));", // 29 FLAG
      "  return { a, b, c, d, e, f, g, h, i, j, k };",
      "}",
      "",
    ];

    try {
      fs.writeFileSync(tmp, lines.join("\n"), "utf8");
      const flagged = findOffenders([tmp])
        .map((o) => o.line)
        .sort((x, y) => x - y);
      // Exactly the FLAG lines, none of the SAFE lines (esp. 6 / 8 / 10 / 12 / 17).
      expect(flagged).toEqual([19, 21, 23, 25, 27, 29]);
    } finally {
      if (fs.existsSync(tmp)) fs.rmSync(tmp);
    }
    expect(fs.existsSync(tmp)).toBe(false);
  });
});

describe("selector guard — real tree (must be CLEAN)", () => {
  it("scans a non-trivial number of production source files (no vacuous pass)", () => {
    // A mis-rooted glob would scan zero files and pass for the wrong reason.
    expect(SOURCE_FILES.length).toBeGreaterThan(50);
  });

  it("finds ZERO unmemoized fresh-allocation selectors across the tree", () => {
    const offenders = findOffenders(SOURCE_FILES);

    writeEvidence(
      "task-9-guard-pass.txt",
      [
        "# Task 9 — selector guard PASS proof (clean real tree)",
        "",
        `Source files scanned (excl. tests/stories/.d.ts): ${SOURCE_FILES.length}`,
        `Offenders found: ${offenders.length}`,
        offenders.length ? fmt(offenders) : "  (none)",
        "",
        offenders.length === 0
          ? "RESULT: PASS — 0 unmemoized fresh-allocation selectors (0 false positives across the 12 audited-safe selectors + whole tree)"
          : "RESULT: FAIL — guard flagged the real tree (see list above)",
        "",
      ].join("\n"),
    );

    expect(
      offenders,
      offenders.length
        ? `Unmemoized fresh-allocation Zustand selector(s) found — wrap in useShallow from "zustand/react/shallow":\n${fmt(offenders)}`
        : "",
    ).toEqual([]);
  });
});
