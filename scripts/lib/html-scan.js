/*
 * A tiny HTML scanner used by scripts/tag-cms.js. It walks a page's markup and reports every element with the
 * text that sits directly inside it ("own text", ignoring child elements such as icons), plus where its opening
 * tag is, so an attribute can be added. It does not need to understand all of HTML — only the well-formed markup
 * this site's pages are written in.
 */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

function decode(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&rsquo;/g, '’').replace(/&mdash;/g, '—').replace(/&middot;/g, '·');
}
const collapse = (s) => decode(s).replace(/\s+/g, ' ').trim();

// Returns [{ tag, attrs, openStart, openEnd (index just after '>'), selfClosing, own, depth, ancestors:[tags] }]
// in document order (by opening tag), with `own` filled in when the element closes.
function scan(html) {
  const out = [];
  const stack = [];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g;
  let last = 0; let m;
  const addText = (txt) => { if (stack.length && txt) stack[stack.length - 1].text += txt; };
  while ((m = re.exec(html))) {
    addText(html.slice(last, m.index));
    last = re.lastIndex;
    if (m[0].startsWith('<!--')) continue;
    const closing = m[1] === '/'; const tag = m[2].toLowerCase(); const attrs = m[3]; const selfClose = m[4] === '/';
    if ((tag === 'script' || tag === 'style') && !closing && !selfClose) {
      const end = html.indexOf('</' + tag, re.lastIndex);
      if (end < 0) break;
      re.lastIndex = end; last = end; continue;
    }
    if (!closing) {
      const el = { tag, attrs, openStart: m.index, openEnd: m.index + m[0].length, selfClosing: selfClose || VOID.has(tag), text: '', own: '', ancestors: stack.map((s) => s.tag) };
      out.push(el);
      if (!el.selfClosing) stack.push(el);
    } else {
      // close the nearest matching open element (tolerate small nesting slips)
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].tag === tag) {
          const el = stack[i]; el.own = collapse(el.text); stack.length = i; break;
        }
      }
    }
  }
  return out;
}

module.exports = { scan, collapse, decode };
