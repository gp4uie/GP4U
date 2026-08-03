const db = require('./db');

// Called whenever a booking is made, so the patients table always has this person's
// latest contact details. Never touches password_hash — that's only set via /api/patient/set-password.
async function upsertPatient({ email, name, dob, phone, address }) {
  await db.run(`
    INSERT INTO patients (email, name, dob, phone, address)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE name = VALUES(name), dob = VALUES(dob),
      phone = VALUES(phone), address = VALUES(address)
  `, [email, name, dob, phone, db.encrypt(address)]);
}

async function getPatient(email) {
  return db.get('SELECT * FROM patients WHERE email = ?', [email]);
}

module.exports = { upsertPatient, getPatient };
