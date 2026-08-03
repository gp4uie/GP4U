const crypto = require('crypto');

// Encrypts the free-text health content columns (clinical notes, prescriptions, referral/sick
// cert details, intake answers) at rest, so a database copy alone doesn't expose readable health
// information — access within the app is already controlled separately (tokens/sessions).
//
// Ciphertext is tagged with a version prefix ("enc1:") so existing plaintext data written before
// this feature existed keeps reading back exactly as it always did — decrypt() only decrypts
// values that carry the tag, and passes anything else through unchanged. There is no need to
// migrate old rows; every new write is encrypted, old rows stay readable as-is.
const TAG = 'enc1:';
const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY is not set in .env — generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes) — see .env.example');
  }
  return key;
}

function encrypt(text) {
  if (text === null || text === undefined || text === '') return text;
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return TAG + Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decrypt(value) {
  if (typeof value !== 'string' || !value.startsWith(TAG)) return value;
  const key = getKey();
  const raw = Buffer.from(value.slice(TAG.length), 'base64');
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
