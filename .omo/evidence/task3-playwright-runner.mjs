/**
 * Task 3 — Storybook + Playwright headless console capture (QA Scenario 1).
 *
 * Visits each flagged-selector consumer story (POPULATED + EMPTY) on the live
 * Storybook (:6006), captures console + pageerror, screenshots, and asserts
 * the absence of the Zustand v5 loop signature
 * ("Maximum update depth exceeded" / "getSnapshot should be cached").
 *
 * Evidence per selector:
 *   .omo/evidence/task-3-<selector>-console.txt   (populated console)
 *   .omo/evidence/task-3-<selector>.png           (populated screenshot)
 *   .omo/evidence/task-3-<selector>-empty.txt     (empty console)
 *
 * AUDIT ONLY — applies no fix. Run from webview/: node ../.omo/evidence/task3-playwright-runner.mjs
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const SB = "http://localhost:6006";
const EVID = new URL("./", import.meta.url).pathname; // .omo/evidence/
const LOOP = ["Maximum update depth exceeded", "getSnapshot should be cached"];

// selector slug -> { populated story id, empty story id }
const MAP = [
  ["selectActiveScene", "layout-scenelauncher--populated", "layout-scenelauncher--empty"],
  ["selectAlerts", "layout-livehealth--warning", "layout-livehealth--empty"],
  ["selectMappedParameters", "layout-macrodashboard--map-mode-active", "layout-macrodashboard--empty"],
  ["selectSelectedNode", "layout-inspectorhub--generator-selected", "layout-inspectorhub--empty-graph"],
  ["selectSelectedEdge", "layout-inspectorhub--bypassed-block-selected", "layout-inspectorhub--empty-graph"],
  ["selectWidgets", "layout-dashboardbuilder--populated", "layout-dashboardbuilder--empty"],
  ["pluginBrowser-arrays", "layout-toolpalette--populated", "layout-toolpalette--empty"],
  ["BlockEmbed-FIXEDtemplate", "canvas-blockembed--generator", "canvas-blockembed--logic"],
];

async function visit(page, id) {
  const logs = [];
  const onMsg = (m) => logs.push(`[console.${m.type()}] ${m.text()}`);
  const onErr = (e) => logs.push(`[pageerror] ${e.message}`);
  page.on("console", onMsg);
  page.on("pageerror", onErr);
  const url = `${SB}/iframe.html?id=${id}&viewMode=story`;
  let nav = "ok";
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(900); // let any latent loop manifest
  } catch (e) {
    nav = `NAV_ERR ${e.message}`;
  }
  page.off("console", onMsg);
  page.off("pageerror", onErr);
  const looped = logs.some((l) => LOOP.some((sig) => l.includes(sig)));
  return { url, nav, logs, looped };
}

const summary = [];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

for (const [slug, popId, empId] of MAP) {
  const pop = await visit(page, popId);
  try {
    await page.screenshot({ path: `${EVID}task-3-${slug}.png` });
  } catch { /* story may render empty; screenshot best-effort */ }
  const emp = await visit(page, empId);

  writeFileSync(
    `${EVID}task-3-${slug}-console.txt`,
    `# Task 3 — ${slug} — POPULATED story\nstory: ${pop.url}\nnav: ${pop.nav}\nloop_signature_present: ${pop.looped}\n--- console ---\n${pop.logs.join("\n") || "(no console output)"}\n`,
  );
  writeFileSync(
    `${EVID}task-3-${slug}-empty.txt`,
    `# Task 3 — ${slug} — EMPTY store story\nstory: ${emp.url}\nnav: ${emp.nav}\nloop_signature_present: ${emp.looped}\n--- console ---\n${emp.logs.join("\n") || "(no console output)"}\n`,
  );

  const verdict = pop.looped || emp.looped ? "LOOP-REPRODUCED" : "no-loop";
  summary.push(`${slug.padEnd(28)} populated=${pop.looped ? "LOOP" : "ok"} empty=${emp.looped ? "LOOP" : "ok"} -> ${verdict}`);
}

await browser.close();
console.log("=== TASK3 PLAYWRIGHT SUMMARY ===");
console.log(summary.join("\n"));
