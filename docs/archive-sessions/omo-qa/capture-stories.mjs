// Capture tight component screenshots for every Storybook story on :6006.
// One browser, pooled pages. Shots -> .omo/qa/sb-shots/<id>.png
// Manifest (id -> {name,title,shot,errors}) -> .omo/qa/sb-manifest.json
// Run from webview/ so @playwright/test resolves:  node ../.omo/qa/capture-stories.mjs
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const ROOT = "/Volumes/Projects/Development_Projects/Github_Repos/element";
const OUT = `${ROOT}/.omo/qa/sb-shots`;
const SB = "http://localhost:6006";
const CONCURRENCY = 4;
mkdirSync(OUT, { recursive: true });

const idx = await (await fetch(`${SB}/index.json`)).json();
const stories = Object.values(idx.entries).filter((e) => e.type === "story");
console.log(`capturing ${stories.length} stories @ ${CONCURRENCY}x`);

const browser = await chromium.launch();
const manifest = {};
let done = 0;

async function shoot(story) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });
  const safe = story.id.replace(/[^a-z0-9_-]/gi, "_");
  const shot = `${OUT}/${safe}.png`;
  try {
    await p.goto(`${SB}/iframe.html?id=${story.id}&viewMode=story`, { waitUntil: "networkidle", timeout: 20000 });
    await p.waitForTimeout(350);
    const root = p.locator("#storybook-root, #root").first();
    const box = await root.boundingBox().catch(() => null);
    if (box && box.width > 1 && box.height > 1) {
      await p.screenshot({ path: shot, clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.min(box.width, 1280), height: Math.min(box.height, 900) } });
    } else {
      await p.screenshot({ path: shot });
    }
    manifest[story.id] = { name: story.name, title: story.title, shot, errors };
  } catch (e) {
    manifest[story.id] = { name: story.name, title: story.title, shot: null, errors: [...errors, `capture: ${e.message}`] };
  } finally {
    await ctx.close();
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${stories.length}`);
  }
}

for (let i = 0; i < stories.length; i += CONCURRENCY) {
  await Promise.all(stories.slice(i, i + CONCURRENCY).map(shoot));
}
await browser.close();

const withErr = Object.entries(manifest).filter(([, v]) => v.errors.length);
const noShot = Object.entries(manifest).filter(([, v]) => !v.shot);
writeFileSync(`${ROOT}/.omo/qa/sb-manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`DONE: ${Object.keys(manifest).length} stories, ${noShot.length} failed-shot, ${withErr.length} with runtime errors`);
for (const [id, v] of withErr.slice(0, 40)) console.log(`  ERR ${id}: ${v.errors[0]}`);
