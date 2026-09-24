#!/usr/bin/env node
/*
 * Stamps the shared page parts (scripts/partials/*.html) into every public page.
 *
 * Pages mark where a shared part goes with a pair of comments, e.g.
 *     <!-- @header --> ...anything... <!-- @/header -->
 * Running this script replaces whatever is between the markers with the current partial, so the
 * header, footer, top bar, mobile booking bar and <head> links stay identical on every page.
 *
 * It also adds a version stamp to every local stylesheet/script link, e.g. /css/clinic.css?v=1a2b3c4d,
 * made from the file's contents. Browsers and Hostinger's CDN keep CSS/JS files for a while without being
 * asked; a new stamp forces everyone to fetch the new file, so a redeploy can never leave a visitor with
 * old styling (which shows up as an unstyled "Skip to main content" link at the top left).
 * Re-run this after changing ANY css/js file, then commit and deploy.
 *
 * It then writes the search-engine parts from server/pages.js (titles, descriptions, canonical and social tags,
 * breadcrumbs, condition-page content, links to each page's current address) — see scripts/lib/seo-build.js.
 *
 * Usage:  node scripts/build-pages.js      (or: npm run pages)
 * Edit a partial or a css/js file, run the script, commit the changed HTML. No dependencies.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { tagPage } = require('./lib/tag-cms');
const seo = require('./lib/seo-build');

const PUBLIC = path.join(__dirname, '..', 'public');
const PARTIALS = path.join(__dirname, 'partials');
const parts = {};
fs.readdirSync(PARTIALS).filter((f) => f.endsWith('.html')).forEach((f) => {
  parts[path.basename(f, '.html')] = fs.readFileSync(path.join(PARTIALS, f), 'utf8').trim();
});

const MARKER = /<!-- @(\w[\w-]*) -->[\s\S]*?<!-- @\/\1 -->/g;

// /css/x.css or /js/x.js  ->  same URL + ?v=<first 8 hex characters of the file's md5>
const ASSET = /(href|src)="(\/(?:css|js)\/[^"?#]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"/g;
const versionCache = new Map();
function versionOf(urlPath) {
  if (!versionCache.has(urlPath)) {
    const file = path.join(PUBLIC, urlPath);
    versionCache.set(urlPath, fs.existsSync(file)
      ? crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex').slice(0, 8)
      : null);
  }
  return versionCache.get(urlPath);
}

let changed = 0;
let unknown = 0;
for (const file of fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.html'))) {
  const full = path.join(PUBLIC, file);
  const before = fs.readFileSync(full, 'utf8');
  const stamped = seo.apply(file, before).replace(MARKER, (match, name) => {
    if (seo.OWN_NAMES.test(name)) return match; // search-engine parts, written above
    if (!parts[name]) { console.warn(`  ! ${file}: no partial named "${name}"`); unknown += 1; return match; }
    return `<!-- @${name} -->\n${parts[name]}\n<!-- @/${name} -->`;
  });
  const tagged = seo.rewriteLinks(tagPage(file, stamped));
  const after = tagged.replace(ASSET, (match, attr, url) => {
    const v = versionOf(url);
    return v ? `${attr}="${url}?v=${v}"` : match;
  });
  if (after !== before) { fs.writeFileSync(full, after); changed += 1; }
}
console.log(`Shared parts and asset versions applied — ${changed} page(s) updated${unknown ? `, ${unknown} unknown marker(s)` : ''}.`);
