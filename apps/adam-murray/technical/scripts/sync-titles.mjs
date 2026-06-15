#!/usr/bin/env node
// ============================================================
//  sync-titles.mjs — keep blog frontmatter `title:` in sync
//  with each post's body `# Title` H1.
//
//  The body H1 is the source of truth (so the .mdx file is
//  fully stand-alone-readable in any markdown renderer). The
//  frontmatter `title:` is a cache used by Astro for the
//  page <title> tag, OG tags, sitemap, and the index listing.
//
//  Run automatically before `dev` and `build` via the
//  predev/prebuild hooks in package.json. Can be invoked
//  manually with `pnpm sync:titles`.
//
//  Behaviour:
//    - body H1 present, frontmatter matches → no-op
//    - body H1 present, frontmatter differs → frontmatter
//      rewritten from body
//    - body H1 present, frontmatter missing → frontmatter
//      receives a new `title:` line at the top
//    - body H1 missing → warn, leave frontmatter alone
// ============================================================

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = resolve(__dirname, '..', 'src', 'content', 'blog');

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
const FIRST_H1_RE   = /^# (.+)$/m;
const TITLE_LINE_RE = /^title:\s*(.+)$/m;

/** Parse a YAML string literal into the underlying string.
 *  Handles "double-quoted", 'single-quoted', and bare values. */
function parseYamlString(raw) {
  const s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
}

/** Serialize a string as a YAML double-quoted literal. */
function toYamlString(s) {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

const files = readdirSync(BLOG_DIR).filter((f) => f.endsWith('.mdx'));
let changed = 0;
let skipped = 0;

for (const fname of files) {
  const path = join(BLOG_DIR, fname);
  const raw = readFileSync(path, 'utf8');
  const fmMatch = raw.match(FRONTMATTER_RE);
  if (!fmMatch) {
    console.warn(`  skip ${fname}: no frontmatter block`);
    skipped++;
    continue;
  }
  const [, fmBlock, body] = fmMatch;
  const h1Match = body.match(FIRST_H1_RE);
  if (!h1Match) {
    console.warn(`  skip ${fname}: no body H1`);
    skipped++;
    continue;
  }
  const bodyTitle = h1Match[1].trim();

  const titleMatch = fmBlock.match(TITLE_LINE_RE);
  const currentTitle = titleMatch ? parseYamlString(titleMatch[1]) : null;

  if (currentTitle === bodyTitle) {
    continue; // already in sync
  }

  let newFmBlock;
  if (titleMatch) {
    newFmBlock = fmBlock.replace(TITLE_LINE_RE, `title: ${toYamlString(bodyTitle)}`);
  } else {
    newFmBlock = `title: ${toYamlString(bodyTitle)}\n${fmBlock}`;
  }
  const newRaw = `---\n${newFmBlock}\n---\n${body}`;
  writeFileSync(path, newRaw);
  console.log(`  ✓ ${fname}: title synced → ${bodyTitle}`);
  changed++;
}

console.log(`\n${changed} file(s) updated; ${files.length - changed - skipped} already in sync; ${skipped} skipped.`);
