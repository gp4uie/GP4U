const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

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

function reviveDates(row) {
  if (!row) return row;
  const revived = {};
  for (const [key, value] of Object.entries(row)) {
    revived[key] = typeof value === 'string' && MYSQL_DATETIME_RE.test(value)
      ? `${value.slice(0, 19).replace(' ', 'T')}.000Z`
      : value;
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
      symptoms_duration VARCHAR(255),
      current_medications TEXT,
      allergies TEXT,
      extra_details TEXT,
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
      medication VARCHAR(255) NOT NULL,
      dose VARCHAR(255) NOT NULL,
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
  };
  for (const [key, value] of Object.entries(contentDefaults)) {
    await pool.query('INSERT IGNORE INTO site_content (`key`, value) VALUES (?, ?)', [key, value]);
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
}

module.exports = { pool, get, all, run, initSchema, toMySQLDateTime };
