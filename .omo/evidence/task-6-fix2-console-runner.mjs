/**
 * Task 6 — Fix #2 (Zustand v5 selector loop) interim runtime evidence.
 *
 * Loads the FULL Element React app on a demo-seeded dev server (VITE_USE_DEMO_GRAPH=1,
 * port 5199) so the populated graph mounts GraphCanvas → BlockEmbed → ParamStripEmbed
 * (the component that contained the infinite-loop selector now wrapped in `useShallow`).
 *
 * Captures the browser console + pageerror and asserts the ABSENCE of the Zustand v5
 * loop signature:
 *   - "Maximum update depth exceeded"
 *   - "getSnapshot should be cached"
 * and that the React root actually painted (root.children > 0 — a blanked root means
 * the loop tripped at mount).
 *
 * INTERIM evidence only — Glen's Gate A is final.
 * Run from webview/:  node ../.omo/evidence/task-6-fix2-console-runner.mjs
 */
import playwright from "/Volumes/Projects/Development_Projects/Github_Repos/element/webview/node_modules/playwright/index.js";
const chromium = playwright.chromium;
import { writeFileSync } from "node:fs";

const TARGET = "http://localhost:5199/";
const EVID = "/Volumes/Projects/Development_Projects/Github_Repos/element/.omo/evidence/";
const LOOP = ["Maximum update depth exceeded", "getSnapshot should be cached"];

const logs = [];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
page.on("console", (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}\n${e.stack || ""}`));

let nav = "ok";
try {
  await page.goto(TARGET, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
} catch (e) {
  nav = `NAV_ERR ${e.message}`;
}

// ParamStripEmbed (the fixed component) only mounts when a Block renders at the
// "expanded" zoom tier (useGraphStore.zoomTier === "expanded", i.e. react-flow
// zoom > 0.8 — see Block.tsx:532 + useGraphStore.zoomToTier). The app derives the
// tier from react-flow's onMove/onMoveEnd. Drive the pane's zoom past 0.8 with the
// wheel so `setZoomTier("expanded")` fires and BlockEmbed → ParamStripEmbed → the
// MiniFader strip mounts. This is what makes the no-loop assertion test the *fixed
// selector*, not just the collapsed-block app.
async function countFaders() {
  return page.evaluate(() => {
    // MiniFader track: a div with inline height:32 + the pressed-track radius class.
    const tracks = Array.from(document.querySelectorAll("div")).filter((d) => {
      const h = d.style && d.style.height;
      return (h === "32px" || h === "32") && d.className.includes("rounded-sm");
    });
    return tracks.length;
  });
}
let faderCount = await countFaders();
if (faderCount === 0) {
  // Wheel-zoom in over the canvas center to push zoom > 0.8.
  const pane = await page.$(".react-flow__pane, .react-flow");
  const box = pane ? await pane.boundingBox() : null;
  const cx = box ? box.x + box.width / 2 : 700;
  const cy = box ? box.y + box.height / 2 : 450;
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 18 && faderCount === 0; i++) {
    await page.mouse.wheel(0, -260); // negative deltaY = zoom in
    await page.waitForTimeout(180);
    faderCount = await countFaders();
  }
  await page.waitForTimeout(800);
  faderCount = await countFaders();
}

// Probe the live React tree.
const probe = await page.evaluate(() => {
  const root = document.getElementById("root");
  const rfNodes = document.querySelectorAll(".react-flow__node").length;
  const panels = document.querySelectorAll('[class*="panel"], aside, nav').length;
  const canvas = document.querySelector(".react-flow") != null;
  const tracks = Array.from(document.querySelectorAll("div")).filter((d) => {
    const h = d.style && d.style.height;
    return (h === "32px" || h === "32") && d.className.includes("rounded-sm");
  }).length;
  return {
    rootChildren: root ? root.children.length : -1,
    rootHasContent: root ? root.innerHTML.length : 0,
    reactFlowNodeCount: rfNodes,
    paramStripFaderCount: tracks, // > 0 proves ParamStripEmbed/MiniFader mounted
    panelLikeCount: panels,
    hasCanvas: canvas,
    bodyText: (document.body.innerText || "").slice(0, 200),
  };
});

await page.screenshot({ path: EVID + "task-6-fix2-app-render.png", fullPage: false });

const looped = logs.some((l) => LOOP.some((sig) => l.includes(sig)));
const errors = logs.filter((l) => l.startsWith("[pageerror]") || l.includes("console.error"));

const paramStripMounted = probe.paramStripFaderCount > 0;
const report = {
  url: TARGET,
  nav,
  loopSignatureFound: looped,
  loopSignatures: LOOP,
  probe,
  paintedNonBlank: probe.rootChildren > 0,
  paramStripEmbedMounted: paramStripMounted, // the FIXED component actually rendered
  errorCount: errors.length,
  consoleLineCount: logs.length,
  errorsSample: errors.slice(0, 20),
  allLogs: logs,
};
writeFileSync(EVID + "task-6-fix2-console.txt", JSON.stringify(report, null, 2));

console.log("=== FIX #2 CONSOLE-CAPTURE RESULT ===");
console.log("nav:", nav);
console.log("loopSignatureFound:", looped);
console.log("rootChildren:", probe.rootChildren, "(>0 = React painted, not blank)");
console.log("reactFlowNodeCount:", probe.reactFlowNodeCount);
console.log("paramStripFaderCount:", probe.paramStripFaderCount, "(>0 = ParamStripEmbed/MiniFader MOUNTED — the fixed component)");
console.log("hasCanvas:", probe.hasCanvas, "panelLikeCount:", probe.panelLikeCount);
console.log("console.error/pageerror count:", errors.length);
if (errors.length) console.log("first errors:\n" + errors.slice(0, 8).join("\n"));
console.log("screenshot:", EVID + "task-6-fix2-app-render.png");

await browser.close();
// PASS requires: no loop signature AND root painted AND the fixed component mounted.
process.exit(looped || probe.rootChildren <= 0 || !paramStripMounted ? 1 : 0);
