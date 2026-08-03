const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { encrypt, decrypt } = require('./encryption');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

// The rest of the app (both server and browser JS) works entirely in ISO-8601 UTC datetime
// strings, e.g. from `new Date().toISOString()`. MySQL's DATETIME columns only accept
// 'YYYY-MM-DD HH:MM:SS' and return the same on the way out. These two helpers translate at
// the database boundary so nowhere else in the codebase has to know MySQL's format exists —
// callers pass and receive plain ISO strings exactly as they did with the old SQLite version.
const MYSQL_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;

function toMySQLDateTime(isoString) {
  return isoString.slice(0, 19).replace('T', ' ');
}

// Health-content columns encrypted at rest (see server/encryption.js) — matched by column name
// alone regardless of table, so this stays correct automatically as new query shapes are added.
// decrypt() is a no-op passthrough for anything not tagged as ciphertext, so this is also safe
// for rows written before encryption existed.
const ENCRYPTED_COLUMNS = new Set([
  'note_text', 'medication', 'dose', 'frequency', 'duration', 'instructions', 'fields',
  'reason', 'symptoms_duration', 'current_medications', 'allergies', 'extra_details',
  'patient_address', 'address', 'safety_answers',
]);

function reviveDates(row) {
  if (!row) return row;
  const revived = {};
  for (const [key, value] of Object.entries(row)) {
    if (ENCRYPTED_COLUMNS.has(key)) {
      revived[key] = decrypt(value);
    } else {
      revived[key] = typeof value === 'string' && MYSQL_DATETIME_RE.test(value)
        ? `${value.slice(0, 19).replace(' ', 'T')}.000Z`
        : value;
    }
  }
  return revived;
}

// Thin helpers so call sites read close to the old synchronous style, just with `await`.
async function get(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return reviveDates(rows[0]);
}
async function all(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows.map(reviveDates);
}
async function run(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return { lastInsertRowid: result.insertId, changes: result.affectedRows };
}

// `CREATE TABLE IF NOT EXISTS` only helps for tables that don't exist yet — it silently does
// nothing to add a new column to a table that's already there (e.g. this site's live `patients`
// table, created before reset_token existed). This adds a column only if it's actually missing,
// so it's safe to call every startup against both a brand-new database and an existing one.
async function ensureColumn(table, column, definition) {
  try {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

// Widens a column already deployed as VARCHAR to TEXT — needed where encryption's ciphertext
// (base64, plus IV/auth-tag overhead) can exceed a VARCHAR(255) limit that was fine for
// plaintext. MODIFY COLUMN is safe to re-run every startup; MySQL no-ops if it's already TEXT.
async function widenColumn(table, column, definition) {
  await pool.query(`ALTER TABLE ${table} MODIFY COLUMN ${column} ${definition}`);
}

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id VARCHAR(32) PRIMARY KEY,
      patient_token VARCHAR(64) NOT NULL,
      service_type VARCHAR(32) NOT NULL,
      patient_name VARCHAR(255) NOT NULL,
      patient_dob VARCHAR(20) NOT NULL,
      patient_phone VARCHAR(64) NOT NULL,
      patient_email VARCHAR(255) NOT NULL,
      patient_address TEXT,
      pharmacy_name VARCHAR(255),
      reason TEXT NOT NULL,
      symptoms_duration TEXT,
      current_medications TEXT,
      allergies TEXT,
      extra_details TEXT,
      safety_answers TEXT,
      slot_start DATETIME NOT NULL,
      slot_end DATETIME NOT NULL,
      amount_cents INT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending_payment',
      stripe_session_id VARCHAR(255),
      patient_last_viewed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_patient_email (patient_email),
      INDEX idx_slot_start (slot_start),
      INDEX idx_status (status)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      booking_id VARCHAR(32) NOT NULL,
      sender VARCHAR(16) NOT NULL,
      body TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS prescriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      booking_id VARCHAR(32) NOT NULL,
      medication TEXT NOT NULL,
      dose TEXT NOT NULL,
      frequency TEXT NOT NULL,
      duration TEXT NOT NULL,
      instructions TEXT NOT NULL,
      quantity VARCHAR(255) NOT NULL,
      doctor_name VARCHAR(255) NOT NULL,
      doctor_reg_number VARCHAR(64) NOT NULL,
      sent_to_email VARCHAR(255),
      sent_at DATETIME NULL,
      issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    )
  `);
  // Migration for sites where `prescriptions` already existed before frequency/duration split
  // out of the old single "instructions" field.
  await ensureColumn('prescriptions', 'frequency', "VARCHAR(255) NOT NULL DEFAULT ''");
  await ensureColumn('prescriptions', 'duration', "VARCHAR(255) NOT NULL DEFAULT ''");
  // Widen columns that now hold encrypted (larger) values instead of plain short text.
  await widenColumn('prescriptions', 'medication', 'TEXT NOT NULL');
  await widenColumn('prescriptions', 'dose', 'TEXT NOT NULL');
  await widenColumn('prescriptions', 'frequency', 'TEXT NOT NULL');
  await widenColumn('prescriptions', 'duration', 'TEXT NOT NULL');
  await widenColumn('bookings', 'symptoms_duration', 'TEXT');
  // Migration for sites where `bookings` already existed before the repeat-prescription safety
  // questionnaire (medication changes / taken-as-prescribed) was added.
  await ensureColumn('bookings', 'safety_answers', 'TEXT');

  // Append-only clinical notes: real clinical records are never edited after saving,
  // only added to, so there is deliberately no update/delete on this table.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clinical_notes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      booking_id VARCHAR(32) NOT NULL,
      note_text TEXT NOT NULL,
      doctor_name VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    )
  `);

  // Generic table for templated documents: sick certs and referral letters.
  // doc_type: 'sick_cert' | 'referral_ae' | 'referral_specialist'
  // fields: JSON text, shape depends on doc_type (see server/documentTypes.js)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      booking_id VARCHAR(32) NOT NULL,
      doc_type VARCHAR(32) NOT NULL,
      fields TEXT NOT NULL,
      doctor_name VARCHAR(255) NOT NULL,
      doctor_reg_number VARCHAR(64) NOT NULL,
      sent_to_email VARCHAR(255),
      sent_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    )
  `);

  // One row per patient email. Created/kept up to date automatically whenever that email
  // makes a booking. password_hash is NULL until the patient chooses to set one.
  // reset_token/reset_token_expires back the "forgot password" email flow (see routes/patient.js).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS patients (
      email VARCHAR(255) PRIMARY KEY,
      password_hash VARCHAR(255),
      name VARCHAR(255),
      dob VARCHAR(20),
      phone VARCHAR(64),
      address TEXT,
      reset_token VARCHAR(128) NULL,
      reset_token_expires DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Migration for sites where `patients` already existed before reset_token was added.
  await ensureColumn('patients', 'reset_token', 'VARCHAR(128) NULL');
  await ensureColumn('patients', 'reset_token_expires', 'DATETIME NULL');

  // Real per-doctor accounts (replacing the old single shared DOCTOR_PASSWORD). Every
  // prescription/document/clinical note is stamped with the name+reg number of whichever
  // doctor issued it (see routes/doctor.js), so multiple doctors can share the same site.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS doctors (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      reg_number VARCHAR(64) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      reset_token VARCHAR(128) NULL,
      reset_token_expires DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Each doctor's own weekly working hours — any number of rows per day (e.g. a split shift
  // 12:00-13:00 and 19:00-23:00 on the same day), no rows means that doctor doesn't work that
  // day. server/slots.js offers a slot to patients if at least one doctor's hours cover it and
  // fewer bookings exist for that slot than doctors covering it — patients never pick a specific
  // doctor, whoever's free takes it.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS doctor_availability (
      id INT AUTO_INCREMENT PRIMARY KEY,
      doctor_id INT NOT NULL,
      day_of_week TINYINT NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id)
    )
  `);
  // Migration for sites created before split-shift support: the old schema only allowed one
  // row per doctor per day, enforced by this unique key — drop it so multiple rows are allowed.
  // MySQL won't drop it while it's the only index backing the doctor_id foreign key, so add a
  // plain (non-unique) index on doctor_id first to take over that job.
  try {
    await pool.query('ALTER TABLE doctor_availability ADD INDEX idx_doctor_id (doctor_id)');
  } catch (err) {
    if (err.code !== 'ER_DUP_KEYNAME') throw err;
  }
  try {
    await pool.query('ALTER TABLE doctor_availability DROP INDEX unique_doctor_day');
  } catch (err) {
    if (err.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw err;
  }

  // Separate admin accounts (distinct from doctors) for platform management: onboarding
  // doctors, setting any doctor's schedule, and viewing/sending patient summaries. Admins have
  // no clinical role — they never issue prescriptions/notes/documents themselves.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      reset_token VARCHAR(128) NULL,
      reset_token_expires DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Audit trail every time an admin emails a patient's compiled summary to an external GP —
  // the summary itself is always compiled fresh from live clinical data (see routes/admin.js),
  // this table just records that a send happened, to whom, and when.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS patient_summary_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      patient_email VARCHAR(255) NOT NULL,
      sent_to_email VARCHAR(255) NOT NULL,
      sent_by_admin_name VARCHAR(255) NOT NULL,
      sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // type: 'new_booking' | 'new_message'
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type VARCHAR(32) NOT NULL,
      booking_id VARCHAR(32) NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      read_at DATETIME NULL,
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    )
  `);

  // Simple key/value store for editable homepage text, so it can be changed from the
  // content editor instead of by hand-editing index.html.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_content (
      \`key\` VARCHAR(64) PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Bookable services, editable from the admin content editor instead of a code file.
  // `key` is the stable identifier used throughout bookings/slots (e.g. 'general', 'repeat_rx').
  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      \`key\` VARCHAR(32) PRIMARY KEY,
      label VARCHAR(255) NOT NULL,
      duration_mins INT NOT NULL,
      price_cents INT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0
    )
  `);

  // A doctor's own task list. Currently only populated automatically when a prescription is
  // issued (type 'send_prescription') — the doctor marks it complete either by hand or
  // automatically when they successfully send it (see routes/doctor.js).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      doctor_id INT NOT NULL,
      booking_id VARCHAR(32) NOT NULL,
      type VARCHAR(32) NOT NULL,
      description TEXT NOT NULL,
      related_id INT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME NULL,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id),
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    )
  `);

  // Guards the auto-summary-to-admin email (sent when a consultation is marked complete)
  // against being sent twice for the same booking.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS consultation_summary_log (
      booking_id VARCHAR(32) PRIMARY KEY,
      sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Photos the patient attaches to their booking (e.g. a photo of a rash). Stored directly in
  // the database as a BLOB — not on the app server's own filesystem, which some hosts (including
  // typical shared/PaaS Node hosting) wipe on every redeploy.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attachments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      booking_id VARCHAR(32) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      data LONGBLOB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    )
  `);

  // Seed default homepage text and starter blog posts once, so the site looks the same
  // as before the content editor existed until someone actually edits it.
  const contentDefaults = {
    hero_title: 'See a GP online, from anywhere in Ireland.',
    hero_subtitle: 'GP4U connects you with Irish-registered GPs for video and audio consultations, repeat prescriptions and sick certs — book in minutes, no waiting room.',
    about_text: 'GP4U is a telemedicine service built by a practising Irish GP, aimed at making everyday GP care more convenient — without losing the personal, careful approach of a good family doctor. Every consultation is carried out by a GP registered with the Irish Medical Council.',
    hero_badge_1: 'Irish Medical Council registered GPs',
    hero_badge_2: 'Encrypted video & data',
    hero_badge_3: 'Secure card payment',
    hero_card_title: 'Same-day appointments',
    hero_card_text: "Choose a consultation type, answer a few quick questions about why you're getting in touch, pick a time that suits, and pay securely online. You'll get a private video link for your appointment.",
    services_section_title: 'Our Services',
    services_section_subtitle: "Pick the type of consultation that fits what you need — prices are shown upfront, no surprises.",
    how_it_works_1_title: 'Choose a service',
    how_it_works_1_text: "Video, travel health, women's health, men's health, repeat prescription or a sick cert.",
    how_it_works_2_title: "Tell us what's going on",
    how_it_works_2_text: 'A short, private questionnaire so your GP is prepared before you speak.',
    how_it_works_3_title: 'Pick a time & pay securely',
    how_it_works_3_text: 'Choose a slot that suits you and pay by card — processed securely by Stripe.',
    how_it_works_4_title: 'Have your consultation',
    how_it_works_4_text: 'Join your private video or audio call right from your confirmation page.',
    footer_contact_email: 'admin@gp4u.ie',
    footer_legal_text: 'GP4U is an online GP consultation service. Not for use in a medical emergency — call 112 / 999 or attend your nearest Emergency Department. This service does not replace in-person examination where one is clinically necessary.',
  };
  for (const [key, value] of Object.entries(contentDefaults)) {
    await pool.query('INSERT IGNORE INTO site_content (`key`, value) VALUES (?, ?)', [key, value]);
  }

  // Seed the service catalogue once from the previous static list, so pricing/labels look the
  // same as before until an admin actually edits them.
  const serviceCountRow = await get('SELECT COUNT(*) AS n FROM services');
  if (serviceCountRow.n === 0) {
    const defaultServices = [
      ['general', 'General GP Consultation', 15, 3500, 1],
      ['video', 'Video Consultation', 15, 4000, 2],
      ['travel', 'Travel Health Consultation', 20, 4500, 3],
      ['womens', "Women's Health Consultation", 20, 4500, 4],
      ['mens', "Men's Health Consultation", 20, 4500, 5],
      ['repeat_rx', 'Repeat Prescription', 10, 2500, 6],
      ['sick_cert', 'Sick Certificate', 10, 2500, 7],
      ['weight_loss', 'Weight Loss Consultation', 20, 7500, 8],
    ];
    for (const [key, label, durationMins, priceCents, sortOrder] of defaultServices) {
      await run(
        'INSERT INTO services (`key`, label, duration_mins, price_cents, sort_order) VALUES (?, ?, ?, ?, ?)',
        [key, label, durationMins, priceCents, sortOrder]
      );
    }
  }

  const postCountRow = await get('SELECT COUNT(*) AS n FROM blog_posts');
  if (postCountRow.n === 0) {
    await run('INSERT INTO blog_posts (title, body) VALUES (?, ?)', [
      'Travelling abroad? Plan your health needs early',
      "Some vaccines need to be given weeks before travel to be effective. Book a travel health consultation at least 4–6 weeks before you fly so there's time to complete any course of vaccinations and get antimalarial advice if needed.",
    ]);
    await run('INSERT INTO blog_posts (title, body) VALUES (?, ?)', [
      "When a sick cert is — and isn't — the right option",
      "A short-term illness like a cold or flu can often be certified after a brief online consultation. But if symptoms are severe, unusual, or ongoing beyond a few days, an in-person examination is safer — your GP will advise if that's needed.",
    ]);
    await run('INSERT INTO blog_posts (title, body) VALUES (?, ?)', [
      'Repeat prescriptions: what to have ready',
      "Have your current medication names, doses, and your regular pharmacy's name and address to hand. This helps your GP issue an accurate repeat prescription without delay.",
    ]);
  }

  // Seed the very first doctor account once, from .env, so there's a way to log in before any
  // doctor has been added through the dashboard. DOCTOR_LOGIN_EMAIL/DOCTOR_PASSWORD are only read
  // here — once this row exists, doctors are managed from the dashboard's Doctors tab instead.
  const doctorCountRow = await get('SELECT COUNT(*) AS n FROM doctors');
  if (doctorCountRow.n === 0 && process.env.DOCTOR_LOGIN_EMAIL && process.env.DOCTOR_PASSWORD) {
    const hash = bcrypt.hashSync(process.env.DOCTOR_PASSWORD, 10);
    await run(`
      INSERT INTO doctors (name, reg_number, email, password_hash) VALUES (?, ?, ?, ?)
    `, [
      process.env.DOCTOR_NAME || 'Dr.',
      process.env.DOCTOR_REG_NUMBER || '',
      process.env.DOCTOR_LOGIN_EMAIL.toLowerCase().trim(),
      hash,
    ]);
  }

  // Seed the very first admin account once, from .env — same pattern as the doctor seed above.
  // Once this row exists, admins are managed from the admin dashboard instead (once that's built).
  const adminCountRow = await get('SELECT COUNT(*) AS n FROM admins');
  if (adminCountRow.n === 0 && process.env.ADMIN_LOGIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
    await run(`
      INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)
    `, [
      process.env.ADMIN_NAME || 'Admin',
      process.env.ADMIN_LOGIN_EMAIL.toLowerCase().trim(),
      hash,
    ]);
  }
}

module.exports = { pool, get, all, run, initSchema, toMySQLDateTime, encrypt };
