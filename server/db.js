const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', 'data', 'gp4u.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  patient_token TEXT NOT NULL,
  service_type TEXT NOT NULL,
  patient_name TEXT NOT NULL,
  patient_dob TEXT NOT NULL,
  patient_phone TEXT NOT NULL,
  patient_email TEXT NOT NULL,
  reason TEXT NOT NULL,
  symptoms_duration TEXT,
  current_medications TEXT,
  allergies TEXT,
  extra_details TEXT,
  slot_start TEXT NOT NULL,
  slot_end TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  stripe_session_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT NOT NULL,
  medication TEXT NOT NULL,
  dose TEXT NOT NULL,
  instructions TEXT NOT NULL,
  quantity TEXT NOT NULL,
  doctor_name TEXT NOT NULL,
  doctor_reg_number TEXT NOT NULL,
  sent_to_email TEXT,
  sent_at TEXT,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

-- Append-only clinical notes: real clinical records are never edited after saving,
-- only added to, so there is deliberately no update/delete on this table.
CREATE TABLE IF NOT EXISTS clinical_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT NOT NULL,
  note_text TEXT NOT NULL,
  doctor_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

-- Generic table for templated documents: sick certs and referral letters.
-- doc_type: 'sick_cert' | 'referral_ae' | 'referral_specialist'
-- fields: JSON text, shape depends on doc_type (see server/documentTypes.js)
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  fields TEXT NOT NULL,
  doctor_name TEXT NOT NULL,
  doctor_reg_number TEXT NOT NULL,
  sent_to_email TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

-- One row per patient email. Created/kept up to date automatically whenever that email
-- makes a booking. password_hash is NULL until the patient chooses to set one.
CREATE TABLE IF NOT EXISTS patients (
  email TEXT PRIMARY KEY,
  password_hash TEXT,
  name TEXT,
  dob TEXT,
  phone TEXT,
  address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- type: 'new_booking' | 'new_message'
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  booking_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT,
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

-- Simple key/value store for editable homepage text, so it can be changed from the
-- content editor instead of by hand-editing index.html.
CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Photos the patient attaches to their booking (e.g. a photo of a rash).
-- Stored on disk under data/uploads/<filename>; served only through token/session-protected routes.
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);
`);

// Seed default homepage text and starter blog posts once, so the site looks the same
// as before the content editor existed until someone actually edits it.
const contentDefaults = {
  hero_title: 'See a GP online, from anywhere in Ireland.',
  hero_subtitle: 'GP4U connects you with Irish-registered GPs for video and audio consultations, repeat prescriptions and sick certs — book in minutes, no waiting room.',
  about_text: 'GP4U is a telemedicine service built by a practising Irish GP, aimed at making everyday GP care more convenient — without losing the personal, careful approach of a good family doctor. Every consultation is carried out by a GP registered with the Irish Medical Council.',
};
const insertDefaultContent = db.prepare('INSERT OR IGNORE INTO site_content (key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(contentDefaults)) insertDefaultContent.run(key, value);

const postCount = db.prepare('SELECT COUNT(*) AS n FROM blog_posts').get().n;
if (postCount === 0) {
  const insertPost = db.prepare('INSERT INTO blog_posts (title, body) VALUES (?, ?)');
  insertPost.run(
    'Travelling abroad? Plan your health needs early',
    "Some vaccines need to be given weeks before travel to be effective. Book a travel health consultation at least 4–6 weeks before you fly so there's time to complete any course of vaccinations and get antimalarial advice if needed."
  );
  insertPost.run(
    "When a sick cert is — and isn't — the right option",
    'A short-term illness like a cold or flu can often be certified after a brief online consultation. But if symptoms are severe, unusual, or ongoing beyond a few days, an in-person examination is safer — your GP will advise if that\'s needed.'
  );
  insertPost.run(
    'Repeat prescriptions: what to have ready',
    "Have your current medication names, doses, and your regular pharmacy's name and address to hand. This helps your GP issue an accurate repeat prescription without delay."
  );
}

// --- Lightweight migrations for columns added after the first release ---
// (CREATE TABLE IF NOT EXISTS above only helps on a brand new database; existing
// databases need existing tables patched with any newly added columns.)
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('bookings', 'patient_address', 'TEXT');
ensureColumn('bookings', 'pharmacy_name', 'TEXT');
ensureColumn('bookings', 'patient_last_viewed_at', 'TEXT');
ensureColumn('prescriptions', 'sent_to_email', 'TEXT');
ensureColumn('prescriptions', 'sent_at', 'TEXT');

module.exports = db;
