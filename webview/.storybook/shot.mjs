// Headless screenshot of a Storybook story. Usage: node .storybook/shot.mjs <storyId> <outPath>
import { chromium } from "@playwright/test";

const storyId = process.argv[2] ?? "neu-button--variant-matrix";
const out = process.argv[3] ?? "/tmp/story.png";

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 700, height: 400 } });

// Capture runtime failures that tsc cannot see (mount-time throws, store loops).
const errors = [];
p.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
p.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
});

await p.goto(`http://localhost:6006/iframe.html?id=${storyId}&viewMode=story`, {
  waitUntil: "networkidle",
});
await p.waitForTimeout(400);
await p.screenshot({ path: out });
await b.close();

if (errors.length) {
  console.error(`✗ ${storyId} rendered with ${errors.length} error(s):`);
  for (const e of errors) console.error(`    ${e}`);
  process.exit(1);
}
console.log(`✓ shot: ${storyId} -> ${out} (no runtime errors)`);
