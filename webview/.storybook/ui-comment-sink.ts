/**
 * Storybook dev-server sink + store for the in-Storybook UI feedback panel.
 *
 * Persists Glen's per-component feedback to `.omo/audit/ui-comments.jsonl`
 * (one JSON record per line) and serves it back so the panel can show a
 * tracked, persistent history. Dev-server only — `build-storybook` never
 * mounts this.
 *
 * Endpoints (wired via `viteFinal` in main.ts):
 *   POST   /__ui_comment          append a new comment   { storyId, title, name, severity, text }
 *   GET    /__ui_comment          list all comments      → { comments: Record[] }
 *   GET    /__ui_comments         alias for GET /__ui_comment (plural form for dashboard)
 *   POST   /__ui_comment/update   patch one comment      { id, status?, resolvedNote?, resolvedCommit?, delete? }
 *
 * Record: { id, ts, storyId, title, name, severity, text, status,
 *           resolvedAt?, resolvedNote?, resolvedCommit? }
 *   status ∈ "open" | "in-progress" | "fixed" | "wontfix" | "resolved"
 */
import type { Plugin } from "vite";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// this file lives at <repo>/webview/.storybook/ → ../../ = <repo>
const HERE = dirname(fileURLToPath(import.meta.url));
const SINK = resolve(HERE, "../../.omo/audit/ui-comments.jsonl");

/**
 * One on-UI annotation (pin / rectangle / freehand pen) drawn over the specimen
 * pane during review. Coords are stored in BOTH absolute px and PERCENT of the
 * specimen pane so an agent can reconstruct WHERE Glen meant regardless of pane
 * size. `note` is the inline text he typed for that mark.
 */
export interface Annotation {
  n: number;
  tool: "pin" | "rect" | "pen";
  note: string;
  /** pin: top-left anchor point */
  point?: { x: number; y: number; xPct: number; yPct: number };
  /** rect: bounding box */
  rect?: {
    x: number;
    y: number;
    w: number;
    h: number;
    xPct: number;
    yPct: number;
    wPct: number;
    hPct: number;
  };
  /** pen: stroke polyline */
  points?: { x: number; y: number; xPct: number; yPct: number }[];
}

export interface CommentRecord {
  id: string;
  ts: string;
  storyId: string | null;
  title: string | null;
  name: string | null;
  severity: string | null;
  text: string;
  status: string;
  /** On-UI annotations (pins / rects / pen strokes) captured for this step */
  annotations?: Annotation[];
  /** ISO timestamp when this record was resolved/fixed */
  resolvedAt?: string;
  /** Human note describing what was done to resolve */
  resolvedNote?: string;
  /** Git commit sha or branch reference where fix landed */
  resolvedCommit?: string;
}

/** Defensively normalise a posted annotations array (caps + shape guard). */
function sanitizeAnnotations(raw: unknown): Annotation[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Annotation[] = [];
  for (const a of raw.slice(0, 200)) {
    if (!a || typeof a !== "object") continue;
    const tool = (a as { tool?: unknown }).tool;
    if (tool !== "pin" && tool !== "rect" && tool !== "pen") continue;
    const rec = a as Record<string, unknown>;
    const ann: Annotation = {
      n: typeof rec.n === "number" ? rec.n : out.length + 1,
      tool,
      note: String(rec.note ?? "").slice(0, 2000),
    };
    if (rec.point) ann.point = rec.point as Annotation["point"];
    if (rec.rect) ann.rect = rec.rect as Annotation["rect"];
    if (Array.isArray(rec.points))
      ann.points = (rec.points as Annotation["points"])!.slice(0, 2000);
    out.push(ann);
  }
  return out;
}

function genId(ts: string): string {
  return `${Date.parse(ts) || Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function readAll(): Promise<CommentRecord[]> {
  let raw = "";
  try {
    raw = await readFile(SINK, "utf8");
  } catch {
    return [];
  }
  const out: CommentRecord[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const d = JSON.parse(t);
      const ts = typeof d.ts === "string" ? d.ts : new Date().toISOString();
      // Back-compat: older records may lack id/status/resolved fields.
      const rec: CommentRecord = {
        id: typeof d.id === "string" && d.id ? d.id : d.ts || genId(ts),
        ts,
        storyId: d.storyId ?? null,
        title: d.title ?? null,
        name: d.name ?? null,
        severity: d.severity ?? null,
        text: String(d.text ?? ""),
        status: typeof d.status === "string" ? d.status : "open",
      };
      const anns = sanitizeAnnotations(d.annotations);
      if (anns && anns.length) rec.annotations = anns;
      if (typeof d.resolvedAt === "string") rec.resolvedAt = d.resolvedAt;
      if (typeof d.resolvedNote === "string") rec.resolvedNote = d.resolvedNote;
      if (typeof d.resolvedCommit === "string") rec.resolvedCommit = d.resolvedCommit;
      out.push(rec);
    } catch {
      /* skip malformed line */
    }
  }
  return out;
}

async function writeAll(records: CommentRecord[]): Promise<void> {
  await mkdir(dirname(SINK), { recursive: true });
  const body = records.map((r) => JSON.stringify(r)).join("\n");
  await writeFile(SINK, body + (body ? "\n" : ""), "utf8");
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((res, rej) => {
    let b = "";
    req.on("data", (c) => {
      b += c;
      if (b.length > 1_000_000) req.destroy();
    });
    req.on("end", () => res(b));
    req.on("error", rej);
  });
}

export function uiCommentSink(): Plugin {
  return {
    name: "element-ui-comment-sink",
    configureServer(server) {
      // GET /__ui_comments (plural) — alias used by the _ReviewStatus dashboard.
      // Identical response shape: { comments: CommentRecord[] }
      server.middlewares.use("/__ui_comments", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: "method not allowed" }));
          return;
        }
        readAll()
          .then((comments) => {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ comments }));
          })
          .catch((e) => {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          });
      });

      server.middlewares.use("/__ui_comment", (req, res) => {
        const url = req.url || "/";
        const json = (code: number, obj: unknown) => {
          res.statusCode = code;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(obj));
        };

        // GET /__ui_comment → list
        if (req.method === "GET" && (url === "/" || url.startsWith("/?"))) {
          readAll()
            .then((comments) => json(200, { comments }))
            .catch((e) => json(500, { ok: false, error: String(e) }));
          return;
        }

        // POST /__ui_comment/update → patch status / resolved fields / delete
        if (req.method === "POST" && url.startsWith("/update")) {
          readBody(req)
            .then(async (body) => {
              const {
                id,
                status,
                resolvedNote,
                resolvedCommit,
                delete: del,
              } = JSON.parse(body || "{}");
              if (!id) return json(400, { ok: false, error: "missing id" });
              const all = await readAll();
              let next: CommentRecord[];
              if (del) {
                next = all.filter((r) => r.id !== id);
              } else {
                next = all.map((r) => {
                  if (r.id !== id) return r;
                  const patched: CommentRecord = { ...r };
                  if (typeof status === "string") patched.status = status;
                  // When resolving, stamp resolvedAt and persist note/commit.
                  const isResolved =
                    status === "resolved" ||
                    status === "fixed" ||
                    status === "wontfix";
                  if (isResolved && !patched.resolvedAt) {
                    patched.resolvedAt = new Date().toISOString();
                  }
                  if (typeof resolvedNote === "string")
                    patched.resolvedNote = resolvedNote;
                  if (typeof resolvedCommit === "string")
                    patched.resolvedCommit = resolvedCommit;
                  return patched;
                });
              }
              await writeAll(next);
              json(200, { ok: true, comments: next });
            })
            .catch((e) => json(400, { ok: false, error: String(e) }));
          return;
        }

        // POST /__ui_comment → append a new comment
        if (req.method === "POST") {
          readBody(req)
            .then(async (body) => {
              const data = JSON.parse(body || "{}");
              const ts =
                typeof data.ts === "string" ? data.ts : new Date().toISOString();
              const rec: CommentRecord = {
                id: genId(ts),
                ts,
                storyId: data.storyId ?? null,
                title: data.title ?? null,
                name: data.name ?? null,
                severity: data.severity ?? null,
                text: String(data.text ?? "").slice(0, 4000),
                status: "open",
              };
              const anns = sanitizeAnnotations(data.annotations);
              if (anns && anns.length) rec.annotations = anns;
              const all = await readAll();
              all.push(rec);
              await writeAll(all);
              json(200, { ok: true, comment: rec });
            })
            .catch((e) => json(400, { ok: false, error: String(e) }));
          return;
        }

        json(405, { ok: false, error: "method not allowed" });
      });
    },
  };
}
