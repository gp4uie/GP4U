// Doctors' handwritten signatures, printed above the doctor's name on prescriptions, certificates and referral letters.
// Each saved signature is its own row and is never changed afterwards: a document remembers the signature that was in
// use when it was issued (signature_id on prescriptions/documents), so replacing or removing a signature later never
// alters a document that was already sent. Only PNG images made by the dashboard's signature pad are accepted.
const db = require('./db');

const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_BYTES = 120 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Returns an error message, or null when the image is acceptable.
function problemWith(dataUrl) {
  const m = typeof dataUrl === 'string' && dataUrl.match(PNG_DATA_URL);
  if (!m) return 'The signature must be a PNG image.';
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 100 || !buf.slice(0, 8).equals(PNG_MAGIC)) return 'The signature image could not be read.';
  if (buf.length > MAX_BYTES) return 'The signature image is too large.';
  return null;
}

async function save(doctorId, dataUrl) {
  const info = await db.run('INSERT INTO doctor_signatures (doctor_id, image) VALUES (?, ?)', [doctorId, dataUrl]);
  await db.run('UPDATE doctors SET signature_id = ? WHERE id = ?', [info.lastInsertRowid, doctorId]);
  return info.lastInsertRowid;
}

async function dataUrl(id) {
  if (!id) return null;
  const row = await db.get('SELECT image FROM doctor_signatures WHERE id = ?', [id]);
  return row && PNG_DATA_URL.test(row.image) ? row.image : null;
}

async function buffer(id) {
  const url = await dataUrl(id);
  return url ? Buffer.from(url.slice(url.indexOf(',') + 1), 'base64') : null;
}

module.exports = { problemWith, save, dataUrl, buffer };
