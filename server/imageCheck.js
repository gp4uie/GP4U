// Recognises a real photo from its first bytes, ignoring the file name and the type the browser claims
// (both are chosen by whoever uploads the file). Anything else, SVG included, is refused: an SVG or HTML file
// served from this site could run script in a doctor's signed-in session.
function detectImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (buf.slice(0, 6).toString('latin1') === 'GIF87a' || buf.slice(0, 6).toString('latin1') === 'GIF89a') return { mime: 'image/gif', ext: 'gif' };
  // iPhone photos (HEIC/HEIF): browsers can't show these inline, so they are offered as a download.
  if (buf.slice(4, 8).toString('latin1') === 'ftyp' && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(buf.slice(8, 12).toString('latin1'))) return { mime: 'image/heic', ext: 'heic' };
  return null;
}

const INLINE_OK = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// Sends a stored upload safely: the type is re-checked from the bytes (older rows stored whatever the browser
// claimed), unknown content is only ever downloaded, and a sandbox policy stops anything in it from running.
function sendUpload(res, att) {
  const kind = detectImage(att.data);
  const mime = kind ? kind.mime : 'application/octet-stream';
  const safeName = String(att.original_name || 'photo').replace(/[^\w.\- ]+/g, '_').slice(0, 80) || 'photo';
  res.setHeader('Content-Type', mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Content-Disposition', `${INLINE_OK.has(mime) ? 'inline' : 'attachment'}; filename="${safeName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(att.data);
}

module.exports = { detectImage, sendUpload };
