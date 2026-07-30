const db = require('./db');

// Called whenever a booking is made, so the patients table always has this person's
// latest contact details. Never touches password_hash — that's only set via /api/patient/set-password.
function upsertPatient({ email, name, dob, phone, address }) {
  db.prepare(`
    INSERT INTO patients (email, name, dob, phone, address)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET name = excluded.name, dob = excluded.dob,
      phone = excluded.phone, address = excluded.address
  `).run(email, name, dob, phone, address);
}

function getPatient(email) {
  return db.prepare('SELECT * FROM patients WHERE email = ?').get(email);
}

module.exports = { upsertPatient, getPatient };
