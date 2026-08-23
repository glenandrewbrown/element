// Render-verify EVERY Storybook story headlessly.
// Enumerates the story index, mounts each story, fails on any pageerror or
// console.error. This catches the class of bug tsc cannot: components that
// compile clean but throw at mount (e.g. the Zustand v5 getSnapshot loop).
//
// Usage:
//   node .storybook/verify-stories.mjs              # all stories
//   node .storybook/verify-stories.mjs neu-         # only ids starting "neu-"
//   SB_URL=http://localhost:6006 node .storybook/verify-stories.mjs
//
// Exit 0 = every story rendered clean. Exit 1 = at least one failed.

import { chromium } from "@playwright/test";

const BASE = process.env.SB_URL ?? "http://localhost:6006";
const filter = process.argv[2] ?? "";

// Ignore noisy-but-harmless console messages (Storybook/React dev chatter).
const IGNORE = [
  /Download the React DevTools/i,
  /\[vite\]/i,
  /Lit is in dev mode/i,
  /Storybook/i,
  /react-dom.*recommend/i,
];

function ignored(text) {
  return IGNORE.some((re) => re.test(text));
}

async function getStoryIndex() {
  // Recent Storybook serves the canonical index at /index.json
  // (older builds used /stories.json). Try both. We verify BOTH stories and
  // autodocs pages — a docs page has its own render path (auto-generated
  // primary + argTypes tables) that can throw even when its stories pass.
  for (const path of ["/index.json", "/stories.json"]) {
    try {
      const res = await fetch(`${BASE}${path}`);
      if (!res.ok) continue;
      const json = await res.json();
      const entries = json.entries ?? json.stories ?? {};
      const items = Object.values(entries).map((e) => ({
        id: e.id,
        viewMode: e.type === "docs" ? "docs" : "story",
      }));
      if (items.length) return items;
    } catch {
      /* try next */
    }
  }
  throw new Error(`Could not read story index from ${BASE} (/index.json or /stories.json)`);
}

const browser = await chromium.launch();
const items = (await getStoryIndex()).filter((it) => it.id.startsWith(filter));
const nStories = items.filter((i) => i.viewMode === "story").length;
const nDocs = items.filter((i) => i.viewMode === "docs").length;
console.log(
  `Verifying ${items.length} entries (${nStories} stories + ${nDocs} docs)${filter ? ` (filter: "${filter}")` : ""}…\n`,
);

const failures = [];

for (const { id, viewMode } of items) {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const errors = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !ignored(msg.text())) {
      errors.push(`console.error: ${msg.text()}`);
    }
  });

  try {
    await page.goto(`${BASE}/iframe.html?id=${id}&viewMode=${viewMode}`, {
      waitUntil: "networkidle",
      timeout: 20000,
    });
    // Give effects/timers a beat to fire (where mount-time loops throw).
    await page.waitForTimeout(400);
  } catch (e) {
    errors.push(`navigation: ${e.message}`);
  }

  const tag = viewMode === "docs" ? " [docs]" : "";
  if (errors.length) {
    failures.push({ id, errors });
    console.log(`✗ ${id}${tag}`);
    for (const e of errors) console.log(`    ${e}`);
  } else {
    console.log(`✓ ${id}${tag}`);
  }
  await page.close();
}

await browser.close();

console.log(`\n${items.length - failures.length}/${items.length} entries rendered clean.`);
if (failures.length) {
  console.log(`\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f.id}`);
  process.exit(1);
}
process.exit(0);
