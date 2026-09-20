#!/usr/bin/env node
/*
 * Stamps the shared page parts (scripts/partials/*.html) into every public page.
 *
 * Pages mark where a shared part goes with a pair of comments, e.g.
 *     <!-- @header --> ...anything... <!-- @/header -->
 * Running this script replaces whatever is between the markers with the current partial, so the
 * header, footer, top bar, mobile booking bar and <head> links stay identical on every page.
 *
 * Usage:  node scripts/build-pages.js      (or: npm run pages)
 * Edit a partial, run the script, commit the changed HTML. No dependencies.
 */
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const PARTIALS = path.join(__dirname, 'partials');
const parts = {};
fs.readdirSync(PARTIALS).filter((f) => f.endsWith('.html')).forEach((f) => {
  parts[path.basename(f, '.html')] = fs.readFileSync(path.join(PARTIALS, f), 'utf8').trim();
});

const MARKER = /<!-- @(\w[\w-]*) -->[\s\S]*?<!-- @\/\1 -->/g;
let changed = 0;
let unknown = 0;
for (const file of fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.html'))) {
  const full = path.join(PUBLIC, file);
  const before = fs.readFileSync(full, 'utf8');
  const after = before.replace(MARKER, (match, name) => {
    if (!parts[name]) { console.warn(`  ! ${file}: no partial named "${name}"`); unknown += 1; return match; }
    return `<!-- @${name} -->\n${parts[name]}\n<!-- @/${name} -->`;
  });
  if (after !== before) { fs.writeFileSync(full, after); changed += 1; }
}
console.log(`Shared parts applied — ${changed} page(s) updated${unknown ? `, ${unknown} unknown marker(s)` : ''}.`);
