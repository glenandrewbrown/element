#!/usr/bin/env node
/**
 * Index the cloned uiverse-io/galaxy repo (MIT) into queryable JSON.
 *
 *   node scripts/index-galaxy.mjs            # build the full + neumorphism index
 *   node scripts/index-galaxy.mjs neumorphism  # filter by a tag (default: neumorphism)
 *
 * Each galaxy `.html` file = raw markup + a <style> block, with a first-line
 * comment: `/* From Uiverse.io by {author} - Tags: a, b, c *​/`.
 * Output: vendor/galaxy-index.json (all) + vendor/galaxy-<tag>.json (filtered).
 *
 * These elements are pure HTML+CSS; use scripts/neu-from-galaxy.mjs (or hand)
 * to convert a chosen one into a React+Tailwind component reskinned to the
 * Element design tokens. Many neumorphism-tagged elements fit the locked system.
 */
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const GALAXY = join(HERE, "../vendor/galaxy");
const OUT_DIR = join(HERE, "../vendor");
const filterTag = (process.argv[2] || "neumorphism").toLowerCase();

// matches both /* ... */ and <!-- ... --> comment forms
const TAG_RE = /From Uiverse\.io by\s+(\S+)\s*-\s*Tags:\s*([^*\->\n]+)/i;

async function main() {
  let dirs;
  try {
    const entries = await readdir(GALAXY, { withFileTypes: true });
    dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    console.error(`✗ galaxy not found at ${GALAXY}. Run:\n  git clone --depth 1 https://github.com/uiverse-io/galaxy.git vendor/galaxy`);
    process.exit(1);
  }

  const elements = [];
  for (const dir of dirs) {
    let files = [];
    try {
      files = await readdir(join(GALAXY, dir));
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".html")) continue;
      const raw = await readFile(join(GALAXY, dir, file), "utf8");
      const m = raw.match(TAG_RE);
      const author = m ? m[1].trim() : "unknown";
      const tags = m
        ? m[2].split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
        : [];
      const styleStart = raw.indexOf("<style>");
      const html = styleStart > -1 ? raw.slice(0, styleStart).trim() : raw.trim();
      const css =
        styleStart > -1
          ? raw.slice(styleStart + 7, raw.indexOf("</style>")).trim()
          : "";
      elements.push({
        id: `${dir}/${file.replace(/\.html$/, "")}`,
        category: dir,
        author,
        tags,
        html,
        css,
      });
    }
  }

  await writeFile(join(OUT_DIR, "galaxy-index.json"), JSON.stringify(elements, null, 2));
  const filtered = elements.filter((e) => e.tags.includes(filterTag));
  await writeFile(
    join(OUT_DIR, `galaxy-${filterTag}.json`),
    JSON.stringify(filtered, null, 2),
  );

  // category breakdown for the filtered set
  const byCat = {};
  for (const e of filtered) byCat[e.category] = (byCat[e.category] || 0) + 1;
  console.log(`Indexed ${elements.length} elements from ${dirs.length} categories.`);
  console.log(`Tag "${filterTag}": ${filtered.length} →`, byCat);
  console.log(`Wrote vendor/galaxy-index.json + vendor/galaxy-${filterTag}.json`);
}

main();
