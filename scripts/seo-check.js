#!/usr/bin/env node
/*
 * Search-engine health check of a running site. Needs no browser — it reads the HTML the server sends, which is what
 * search engines see first.
 *
 *   npm run seo-check                          (checks http://localhost:4000)
 *   node scripts/seo-check.js https://www.gp4u.ie
 *
 * For every page in server/pages.js: HTTP 200, exactly one <title> (unique across the site), a meta description
 * (unique), exactly one <h1>, one canonical pointing at the page's own address, noindex only where intended, Open Graph
 * and X tags, valid JSON-LD, images with alt text and width/height. Then: every internal link on those pages answers
 * 200 without a redirect, old addresses 301 to the new ones, unknown addresses give 404, robots.txt doesn't block
 * pages/CSS/JS/images, and the sitemap lists exactly the indexable pages.
 */
const { ORIGIN, PAGES, REDIRECTS } = require('../server/pages');

const BASE = (process.argv[2] || 'http://localhost:4000').replace(/\/$/, '');
const problems = [];
const bad = (where, msg) => problems.push(`${where}: ${msg}`);
const get = async (path, opts = {}) => { const r = await fetch(BASE + path, { redirect: 'manual', ...opts }); return { status: r.status, location: r.headers.get('location'), body: r.status === 200 ? await r.text() : '' }; };
const all = (re, s) => [...s.matchAll(re)];

(async () => {
  const titles = new Map();
  const descs = new Map();
  const links = new Set();
  for (const p of PAGES) {
    const where = p.url;
    const r = await get(p.url);
    if (r.status !== 200) { bad(where, `status ${r.status}`); continue; }
    const html = r.body;
    const t = all(/<title>([^<]*)<\/title>/g, html);
    if (t.length !== 1) bad(where, `${t.length} <title> tags`); else if (p.index) { if (titles.has(t[0][1])) bad(where, `title also used by ${titles.get(t[0][1])}`); titles.set(t[0][1], where); }
    const d = all(/<meta name="description" content="([^"]*)"/g, html);
    if (d.length !== 1 || d[0][1].length < 50) bad(where, 'missing or short meta description'); else if (p.index) { if (descs.has(d[0][1])) bad(where, `description also used by ${descs.get(d[0][1])}`); descs.set(d[0][1], where); }
    const h1 = all(/<h1[\s>]/g, html).length;
    if (h1 !== 1) bad(where, `${h1} <h1> elements`);
    const canon = all(/<link rel="canonical" href="([^"]*)"/g, html);
    if (canon.length !== 1 || canon[0][1] !== ORIGIN + p.url) bad(where, `canonical ${canon.map((c) => c[1]).join(', ') || 'missing'}`);
    const noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
    if (noindex === p.index) bad(where, p.index ? 'indexable page is marked noindex' : 'should be noindex');
    ['og:title', 'og:description', 'og:url', 'og:image'].forEach((k) => { if (!html.includes(`property="${k}"`)) bad(where, `missing ${k}`); });
    ['twitter:card', 'twitter:title', 'twitter:image'].forEach((k) => { if (!html.includes(`name="${k}"`)) bad(where, `missing ${k}`); });
    for (const m of all(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, html)) {
      try { const o = JSON.parse(m[1]); if (!o['@context']) bad(where, 'JSON-LD without @context'); } catch (e) { bad(where, `invalid JSON-LD: ${e.message}`); }
    }
    for (const m of all(/<img\b[^>]*>/g, html)) {
      if (!/\salt="/.test(m[0])) bad(where, `image without alt: ${m[0].slice(0, 80)}`);
      if (!/\swidth="/.test(m[0]) || !/\sheight="/.test(m[0])) bad(where, `image without width/height: ${m[0].slice(0, 80)}`);
    }
    if (/Loading services…<\/p>/.test(html)) bad(where, 'content still only loaded by script');
    for (const m of all(/href="(\/[^"#]*)(#[^"]*)?"/g, html)) links.add(m[1]);
  }

  // every internal link: 200, no redirect hop (pages behind a login may answer 200 or redirect to it — only 404/5xx count)
  for (const l of links) {
    if (l.startsWith('/api/') || l.includes('${')) continue; // API calls, and template strings inside scripts
    const r = await get(l);
    if (r.status >= 400) bad('link', `${l} -> ${r.status}`);
    else if (r.status >= 300) bad('link', `${l} redirects to ${r.location} (link to the final address)`);
  }
  // old addresses
  for (const [from, to] of REDIRECTS) {
    const r = await get(from);
    if (r.status !== 301 || !(r.location || '').endsWith(to)) bad('redirect', `${from} -> ${r.status} ${r.location}`);
  }
  // unknown address
  const nf = await get('/this-page-does-not-exist/');
  if (nf.status !== 404) bad('404', `unknown address answered ${nf.status}`);
  // robots.txt
  const robots = (await get('/robots.txt')).body;
  for (const p of PAGES.filter((x) => x.index)) if (robots.split('\n').some((l) => l.trim() === `Disallow: ${p.url}`)) bad('robots.txt', `blocks ${p.url}`);
  if (/Disallow: \/(css|js|img)\b/.test(robots)) bad('robots.txt', 'blocks CSS, JS or images');
  if (!/Allow: \/api\/site-settings\.js/.test(robots)) bad('robots.txt', 'blocks /api/site-settings.js, which every page needs');
  if (!/^Sitemap: https:\/\/www\.gp4u\.ie\/sitemap\.xml$/m.test(robots)) bad('robots.txt', 'no Sitemap line');
  // sitemap
  const sm = (await get('/sitemap.xml')).body;
  const inMap = new Set(all(/<loc>([^<]*)<\/loc>/g, sm).map((m) => m[1]));
  for (const p of PAGES) {
    if (p.index && !inMap.has(ORIGIN + p.url)) bad('sitemap', `missing ${p.url}`);
    if (!p.index && inMap.has(ORIGIN + p.url)) bad('sitemap', `lists noindex page ${p.url}`);
  }

  console.log(`Checked ${PAGES.length} pages, ${links.size} internal links, ${REDIRECTS.size} redirects on ${BASE}.`);
  if (problems.length) { console.log(`\n${problems.length} problem(s):`); problems.forEach((p) => console.log('  - ' + p)); process.exit(1); }
  console.log('No problems found.');
})().catch((e) => { console.error(e); process.exit(1); });
