/*
 * Marks the editable text and pictures on a page (see server/siteRegistry.js): adds data-cms="key" to each
 * matching element and data-cms-img="slot" to each matching <img>. It starts by removing any old marks, so the
 * result never depends on earlier runs, and it throws if a registry entry no longer matches the page — that is
 * how the list of editable text stays honest when someone changes a page.
 * Also makes sure every page that uses clinic.js loads the live site settings first.
 */
const { scan, collapse } = require('./html-scan');
const { TEXT, IMAGES } = require('../../server/siteRegistry');

const SETTINGS_TAG = '<script src="/api/site-settings.js"></script>\n';

function insertAttr(html, el, attr) {
  // put the attribute just before the closing ">" (or "/>") of the opening tag
  const open = html.slice(el.openStart, el.openEnd);
  const end = open.endsWith('/>') ? open.length - 2 : open.length - 1;
  const fixed = open.slice(0, end).replace(/\s+$/, '') + ' ' + attr + open.slice(end);
  return html.slice(0, el.openStart) + fixed + html.slice(el.openEnd);
}

function tagPage(file, htmlIn) {
  let html = htmlIn.replace(/ data-cms(?:-img)?="[^"]*"/g, '');
  const texts = TEXT.filter((t) => t.page === file);
  const images = IMAGES.filter((i) => i.pages.includes(file));
  if (texts.length || images.length) {
    const els = scan(html).filter((e) => e.ancestors.includes('main'));
    const edits = []; // [el, attr]
    for (const t of texts) {
      const want = collapse(t.text);
      const matches = els.filter((e) => e.own && e.own === want);
      const el = matches[t.nth];
      if (!el) throw new Error(`site registry: ${file} has no element #${t.nth + 1} with the text "${t.text}" (key ${t.key}). Update server/siteRegistry.js or the page.`);
      edits.push([el, `data-cms="${t.key}"`]);
    }
    for (const im of images) {
      const srcOf = (e) => { const m = e.attrs.match(/src="([^"]*)"/); return m ? m[1] : ''; };
      const matches = els.filter((e) => e.tag === 'img' && srcOf(e).includes(im.src));
      const el = matches[im.nth];
      if (!el) throw new Error(`site registry: ${file} has no picture #${im.nth + 1} containing "${im.src}" (slot ${im.slot}).`);
      edits.push([el, `data-cms-img="${im.slot}"`]);
    }
    // one element can carry both kinds only if it is an <img>; guard against two keys on one element
    const seen = new Set();
    for (const [el] of edits) { if (seen.has(el.openStart)) throw new Error(`site registry: two entries point at the same element in ${file}`); seen.add(el.openStart); }
    edits.sort((a, b) => b[0].openStart - a[0].openStart).forEach(([el, attr]) => { html = insertAttr(html, el, attr); });
  }
  // live settings must load before clinic.js
  if (/<script src="\/js\/clinic\.js/.test(html) && !html.includes('/api/site-settings.js')) {
    html = html.replace(/<script src="\/js\/clinic\.js/, SETTINGS_TAG + '<script src="/js/clinic.js');
  }
  // cookie consent + measurement (does nothing until IDs are configured and the visitor agrees)
  if (/<script src="\/js\/clinic\.js/.test(html) && !html.includes('/js/consent.js')) {
    html = html.replace(/(<script src="\/js\/clinic\.js[^"]*"><\/script>\n)/, '$1<script src="/js/consent.js"></script>\n');
  }
  return html;
}

module.exports = { tagPage };
