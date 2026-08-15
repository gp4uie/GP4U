const crypto = require('crypto');

// RFC 6238 TOTP, hand-rolled with Node's built-in crypto rather than adding a dependency for
// something this small — SHA-1/6-digits/30s-step is the universal default every authenticator
// app (Google Authenticator, Authy, 1Password, etc.) expects when no other algorithm is specified.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0, value = 0, output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const bytes = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secretBuffer, counter) {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

// window=1 tolerates the code from one 30s step before/after "now", for normal clock drift
// between the server and the doctor's phone.
function verifyTotp(base32Secret, code, window = 1) {
  const trimmed = String(code || '').trim();
  if (!base32Secret || !/^\d{6}$/.test(trimmed)) return false;
  const secretBuffer = base32Decode(base32Secret);
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let drift = -window; drift <= window; drift++) {
    if (hotp(secretBuffer, counter + drift) === trimmed) return true;
  }
  return false;
}

function otpauthUrl(email, secret, issuer) {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}

module.exports = { generateSecret, verifyTotp, otpauthUrl };
