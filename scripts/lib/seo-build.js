/*
 * Search-engine parts of `npm run pages` (called from scripts/build-pages.js). Everything comes from server/pages.js.
 *
 *   <!-- @seo --> … <!-- @/seo -->        in <head>: title, description, canonical, robots, Open Graph, X/Twitter,
 *                                         breadcrumb structured data (and MedicalWebPage data on condition pages)
 *   <!-- @crumbs --> … <!-- @/crumbs -->  top of <main>: the visible breadcrumb trail
 *   <!-- @cond-* --> … <!-- @/cond-* -->  condition pages: the safety list, "about", FAQs and related services written
 *                                         into the HTML (from questionnaires.js / condition-content.js), so the content
 *                                         is there for patients and search engines before any script runs
 *   <!-- @rx-hub --> … <!-- @/rx-hub -->  repeat-prescription page: the list of conditions, same idea
 *   <!-- @faq-* --> … <!-- @/faq-* -->    FAQ page (faq-all + faq-ld) and short FAQ lists, from server/faqDefaults.js
 *
 * It also points every link to a public page at its current address (/walk-in.html -> /walk-in-gp-newbridge/).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ORIGIN, PAGES, BY_FILE, BY_URL, REDIRECTS, CONDITIONS, crumbsFor } = require('../../server/pages');

const PUBLIC = path.join(__dirname, '..', '..', 'public');
const attr = (s) => String(s).replace(/&(?!(amp|lt|gt|quot|#\d+);)/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const text = (s) => String(s).replace(/&(?!(amp|lt|gt|quot|#\d+);)/g, '&amp;').replace(/</g, '&lt;');
const ld = (o) => `<script type="application/ld+json">\n${JSON.stringify(o, null, 2).split('<').join('\\u003c')}\n</script>`;
const plain = (h) => String(h).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// Browser data files, loaded once
let DATA = null;
function data() {
  if (DATA) return DATA;
  const code = ['questionnaires.js', 'condition-content.js'].map((f) => fs.readFileSync(path.join(PUBLIC, 'js', f), 'utf8')).join('\n;\n')
    + '\n;({ QUESTIONNAIRES, CATEGORIES, PAGE_SLUGS, SERVICE_TAGLINES, CONDITION_CONTENT })';
  DATA = vm.runInNewContext(code, { window: {}, console });
  return DATA;
}
const h1Of = (file) => { const m = fs.readFileSync(path.join(PUBLIC, file), 'utf8').match(/<h1[^>]*>([\s\S]*?)<\/h1>/); return m ? plain(m[1]) : file; };
const fileForKey = (key) => { const c = CONDITIONS.find(([slug]) => slug === data().PAGE_SLUGS[key]); if (!c) throw new Error(`no page for service ${key}`); return c[1]; };

// ---------------------------------------------------------------- head
function seoBlock(page) {
  const url = ORIGIN + page.url;
  const img = ORIGIN + (page.image || '/img/social/gp4u-one-tap-real-care.jpg');
  const imgAlt = img.includes('walk-in') ? 'GP4U walk-in GP clinic, Newbridge, Co. Kildare — GP care when you need it.' : 'GP4U — One tap. Real care. Online GP across Ireland and a walk-in GP clinic in Newbridge.';
  const lines = [
    `<title>${text(page.title)}</title>`,
    `<meta name="description" content="${attr(page.description)}">`,
    page.index ? '' : '<meta name="robots" content="noindex, follow">',
    `<link rel="canonical" href="${url}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="GP4U">',
    '<meta property="og:locale" content="en_IE">',
    `<meta property="og:title" content="${attr(page.title)}">`,
    `<meta property="og:description" content="${attr(page.description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${img}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${attr(imgAlt)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${attr(page.title)}">`,
    `<meta name="twitter:description" content="${attr(page.description)}">`,
    `<meta name="twitter:image" content="${img}">`,
    `<meta name="twitter:image:alt" content="${attr(imgAlt)}">`,
  ].filter(Boolean);
  const chain = crumbsFor(page);
  if (chain.length > 1) {
    lines.push(ld({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: chain.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.crumb, item: ORIGIN + p.url })),
    }));
  }
  return lines.join('\n');
}

function crumbsHtml(page) {
  const chain = crumbsFor(page);
  if (chain.length < 2) return '';
  const items = chain.map((p, i) => (i === chain.length - 1
    ? `<li><span aria-current="page">${text(p.crumb)}</span></li>`
    : `<li><a href="${p.url}">${text(p.crumb)}</a></li>`)).join('');
  return `<nav class="crumbs" aria-label="Breadcrumb"><div class="container"><ol>${items}</ol></div></nav>`;
}

// ---------------------------------------------------------------- condition pages
function conditionParts(file, html) {
  const m = html.match(/const PAGE_SERVICE_KEY = '([a-z_]+)'/);
  if (!m) return null;
  const key = m[1];
  const D = data();
  const page = BY_FILE.get(file);
  const content = D.CONDITION_CONTENT[key] || {};
  const q = D.QUESTIONNAIRES[key];
  const parts = {};
  parts['cond-flags'] = q ? q.redFlags.map((rf) => `<li>${rf.bullet}</li>`).join('') : '';
  const topic = /^[A-Z]{2}/.test(page.crumb) ? page.crumb : page.crumb[0].toLowerCase() + page.crumb.slice(1);
  parts['cond-about'] = content.about && content.about.length
    ? `<h2 class="section-title" style="font-size:1.3rem;">About ${text(topic)}</h2>\n` + content.about.map((p) => `<p>${p}</p>`).join('\n')
    : '';
  if (content.faqs && content.faqs.length) {
    parts['cond-faq'] = `<h2 class="section-title" style="font-size:1.3rem;">Frequently asked questions</h2>
<div class="faq">${content.faqs.map((f) => `
  <details><summary>${f.q}</summary><p>${f.a}</p></details>`).join('')}
</div>
${ld({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: content.faqs.map((f) => ({ '@type': 'Question', name: plain(f.q), acceptedAnswer: { '@type': 'Answer', text: plain(f.a) } })) })}`;
  }
  const group = Object.entries(D.CATEGORIES).find(([, keys]) => keys.includes(key));
  const related = group ? group[1].filter((k) => k !== key) : [];
  parts['cond-related'] = `<h2 class="section-title" style="font-size:1.3rem;">Related online GP services</h2>
<div class="grid">${related.map((k) => { const f = fileForKey(k); return `
  <a class="card service-card" style="text-decoration:none; color:inherit; display:block;" href="${BY_FILE.get(f).url}"><h3>${text(h1Of(f))}</h3><p style="color:var(--ink-500);font-size:0.85rem;">${text(D.SERVICE_TAGLINES[k] || '')}</p></a>`; }).join('')}
</div>
<p style="margin:22px 0 0;">See <a href="/online-gp/">all online GP consultations</a>, <a href="/online-gp/repeat-prescription/">repeat prescriptions</a> or <a href="/fees/">our fees</a>. Prefer to be seen in person? <a href="/walk-in-gp-newbridge/">Visit our walk-in GP clinic in Newbridge</a>.</p>`;
  parts['cond-ld'] = ld({
    '@context': 'https://schema.org', '@type': 'MedicalWebPage',
    name: h1Of(file), url: ORIGIN + page.url, description: page.description, inLanguage: 'en-IE',
    about: { '@type': 'MedicalCondition', name: h1Of(file).replace(/ (Treatment|Review|Support)$/, '') },
    audience: { '@type': 'MedicalAudience', audienceType: 'Patient' },
    publisher: { '@id': `${ORIGIN}/#organization` },
  });
  return parts;
}

function rxHubHtml() {
  const D = data();
  return Object.entries(D.CATEGORIES).map(([cat, keys]) => `<h2 class="section-title section-title-left" style="padding-left:14px;">${text(cat)}</h2>
<div class="grid">${keys.map((k) => { const f = fileForKey(k); return `
  <a class="card service-card" style="text-decoration:none; color:inherit; display:block;" href="${BY_FILE.get(f).url}"><h3>${text(h1Of(f))}</h3><p style="color:var(--ink-500);font-size:0.85rem;">${text(D.SERVICE_TAGLINES[k] || '')}</p></a>`; }).join('')}
</div>`).join('\n');
}

// ---------------------------------------------------------------- FAQs (server/faqDefaults.js is the one source)
// The FAQ page (all of them, plus its FAQPage data) and short lists on other pages. {{hours}} becomes the walk-in
// hours (filled in by the server from the live settings, and by clinic.js in the browser).
const HOURS_SPAN = '<span data-clinic-hours-text>seven days a week</span>';
const FAQ_PICKS = {
  'faq-online': ['online:*', 'Will I always be given a prescription', 'How much does a consultation cost', 'How do I pay for an online'],
  'faq-walkin': ['walk-in:*', 'Do I need to register to use the walk-in', 'Do you see children', 'How much does a consultation cost', 'Can I get a medical certificate'],
};
function faqItems(picks) {
  const { FAQ } = freshFaq();
  return picks.flatMap((p) => {
    if (p.endsWith(':*')) return FAQ.find((g) => g.id === p.slice(0, -2)).items;
    for (const g of FAQ) for (const it of g.items) if (it[0].startsWith(p)) return [it];
    throw new Error('FAQ not found: ' + p);
  });
}
function freshFaq() { delete require.cache[require.resolve('../../server/faqDefaults')]; return require('../../server/faqDefaults'); }
const faqList = (items) => `<div class="faq">${items.map(([q, a]) => `
  <details><summary>${q}</summary><p>${a.split('{{hours}}').join(HOURS_SPAN)}</p></details>`).join('')}
</div>`;
const faqLd = (items) => ld({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: plain(q), acceptedAnswer: { '@type': 'Answer', text: plain(a.split('{{hours}}').join('seven days a week')) } })) });
function faqAll() {
  const { FAQ } = freshFaq();
  return `<nav class="faq-cats" aria-label="FAQ topics">${FAQ.map((g) => `<a href="#${g.id}">${text(g.title)}</a>`).join('')}</nav>
${FAQ.map((g) => `<div class="faq-group" id="${g.id}">
  <h2>${text(g.title)}</h2>
  ${faqList(g.items)}
</div>`).join('\n')}`;
}

// ---------------------------------------------------------------- links
// href="/walk-in.html#book-in" -> href="/walk-in-gp-newbridge/#book-in" (only pages that have moved)
function rewriteLinks(html) {
  return html.replace(/href="(\/[a-z0-9-]+\.html)([?#][^"]*)?"/g, (m, p, rest = '') => (REDIRECTS.has(p) ? `href="${REDIRECTS.get(p)}${rest}"` : m));
}

// ---------------------------------------------------------------- per page
const OWN = /<!-- @(seo|crumbs|rx-hub|cond-[a-z]+|faq-[a-z]+) -->[\s\S]*?<!-- @\/\1 -->/g;
function apply(file, html) {
  const page = BY_FILE.get(file);
  const cond = conditionParts(file, html);
  let out = html.replace(OWN, (match, name) => {
    let body = null;
    if (name === 'seo' && page) body = seoBlock(page);
    else if (name === 'crumbs' && page) body = crumbsHtml(page);
    else if (name === 'rx-hub') body = rxHubHtml();
    else if (name === 'faq-all') body = faqAll();
    else if (name === 'faq-ld') body = faqLd(freshFaq().FAQ.flatMap((g) => g.items));
    else if (FAQ_PICKS[name]) body = faqList(faqItems(FAQ_PICKS[name]));
    else if (cond && name in cond) body = cond[name];
    if (body === null) { console.warn(`  ! ${file}: nothing to put in @${name}`); return match; }
    return `<!-- @${name} -->\n${body}\n<!-- @/${name} -->`;
  });
  out = rewriteLinks(out);
  return out;
}

module.exports = { apply, rewriteLinks, OWN_NAMES: /^(seo|crumbs|rx-hub|cond-[a-z]+|faq-[a-z]+)$/, PAGES, BY_URL };
