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
 *   POST   /__ui_comment/update   patch one comment      { id, status?, delete? }
 *
 * Record: { id, ts, storyId, title, name, severity, text, status }
 *   status ∈ "open" | "in-progress" | "fixed" | "wontfix"
 */
import type { Plugin } from "vite";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// this file lives at <repo>/webview/.storybook/ → ../../ = <repo>
const HERE = dirname(fileURLToPath(import.meta.url));
const SINK = resolve(HERE, "../../.omo/audit/ui-comments.jsonl");

interface CommentRecord {
  id: string;
  ts: string;
  storyId: string | null;
  title: string | null;
  name: string | null;
  severity: string | null;
  text: string;
  status: string;
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
      // Back-compat: older records may lack id/status.
      out.push({
        id: typeof d.id === "string" && d.id ? d.id : d.ts || genId(ts),
        ts,
        storyId: d.storyId ?? null,
        title: d.title ?? null,
        name: d.name ?? null,
        severity: d.severity ?? null,
        text: String(d.text ?? ""),
        status: typeof d.status === "string" ? d.status : "open",
      });
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

        // POST /__ui_comment/update → patch status / delete
        if (req.method === "POST" && url.startsWith("/update")) {
          readBody(req)
            .then(async (body) => {
              const { id, status, delete: del } = JSON.parse(body || "{}");
              if (!id) return json(400, { ok: false, error: "missing id" });
              const all = await readAll();
              let next: CommentRecord[];
              if (del) {
                next = all.filter((r) => r.id !== id);
              } else {
                next = all.map((r) =>
                  r.id === id && typeof status === "string"
                    ? { ...r, status }
                    : r,
                );
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
