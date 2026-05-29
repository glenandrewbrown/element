// LAYOUT-P1 (BLOCK-OVERLAP) measurement.
//
// Measures the rendered LAYOUT height of an expanded-tier modifier Block against
// the running Storybook dev server (:6006). The dev server uses vite.config.ts,
// which includes @tailwindcss/vite — so utility classes are present and the
// height is production-real (unlike the vitest browser project, which has no
// Tailwind processor and renders the block unstyled).
//
// Usage: node .storybook/measure-block.mjs [label]
//   label — free text written alongside the number (e.g. "before" / "after").
//
// Prints a single line:  MEASURE label display=<flex|block> height=<px>
// Exits 0 on a successful measurement (display=flex), 1 otherwise.
import { chromium } from "@playwright/test";

const label = process.argv[2] ?? "(unlabelled)";
const STORY_ID = "canvas-blockexpandedheight--expanded-modifier";
const URL = `http://localhost:6006/iframe.html?id=${STORY_ID}&viewMode=story`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 700, height: 500 } });

const errors = [];
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
});

await page.goto(URL, { waitUntil: "networkidle" });
// React Flow measures nodes asynchronously after mount; give it a beat.
await page.waitForSelector(".react-flow__node", { timeout: 10000 });
await page.waitForTimeout(500);

const result = await page.evaluate(() => {
  const wrapper = document.querySelector(".react-flow__node");
  if (!wrapper) return { ok: false, reason: "no .react-flow__node" };
  const root = wrapper.firstElementChild;
  if (!root) return { ok: false, reason: "no block root" };
  const cs = getComputedStyle(root);
  return {
    ok: true,
    display: cs.display,
    height: root.offsetHeight,
    rootClass: root.className,
  };
});

await browser.close();

if (!result.ok) {
  console.error(`MEASURE ${label} FAILED: ${result.reason}`);
  process.exit(1);
}

console.log(`MEASURE ${label} display=${result.display} height=${result.height}`);
if (errors.length) {
  console.error(`  (note: ${errors.length} runtime error(s))`);
  for (const e of errors) console.error(`    ${e}`);
}

// A styled block root is display:flex. If it is not, Tailwind utilities were not
// applied and the height is meaningless — fail loudly rather than record a lie.
if (result.display !== "flex") {
  console.error(
    `MEASURE ${label}: block root display is "${result.display}", expected "flex" — Tailwind not applied, measurement invalid`,
  );
  process.exit(1);
}
