// Ties a login session to the password it was made with. Sessions live in a signed cookie (cookie-session), so
// the server has no list of sessions to delete when a password changes. Instead each login stores a short
// fingerprint of the account's current password hash, and every signed-in request checks it still matches:
// changing or resetting a password therefore signs out every other browser that was signed in with the old one.
// (The fingerprint is a hash of a bcrypt hash — it reveals nothing about the password.)
const crypto = require('crypto');

function stamp(passwordHash) {
  return crypto.createHash('sha256').update(String(passwordHash || '')).digest('hex').slice(0, 16);
}

function matches(sessionStamp, passwordHash) {
  if (typeof sessionStamp !== 'string' || sessionStamp.length !== 16) return false;
  return crypto.timingSafeEqual(Buffer.from(sessionStamp), Buffer.from(stamp(passwordHash)));
}

module.exports = { stamp, matches };
