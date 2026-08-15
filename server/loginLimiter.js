// In-memory brute-force protection for password logins. No new dependency and no DB table —
// a restart clears it, which is an acceptable tradeoff for a single-process app (an attacker who
// can restart the server has much bigger problems than a cleared lockout list).
//
// Two layers: a per-account lockout (protects one doctor's password from being guessed) and a
// coarser per-IP throttle (slows down someone scanning many email addresses from one source).

const ACCOUNT_MAX_ATTEMPTS = 5;
const ACCOUNT_LOCKOUT_MS = 15 * 60 * 1000;
const IP_MAX_ATTEMPTS = 20;
const IP_WINDOW_MS = 15 * 60 * 1000;

const accountAttempts = new Map(); // key -> { count, lockedUntil }
const ipAttempts = new Map(); // key -> { count, windowStart }

function prune(map, isStale) {
  for (const [key, entry] of map) {
    if (isStale(entry)) map.delete(key);
  }
}

// Returns { blocked: true, retryAfterMs } if this login attempt should be rejected outright,
// before even checking the password.
function checkLimit(accountKey, ip) {
  const now = Date.now();
  prune(accountAttempts, (e) => e.lockedUntil && e.lockedUntil < now && e.count < ACCOUNT_MAX_ATTEMPTS);
  prune(ipAttempts, (e) => now - e.windowStart > IP_WINDOW_MS);

  const account = accountAttempts.get(accountKey);
  if (account && account.lockedUntil && account.lockedUntil > now) {
    return { blocked: true, retryAfterMs: account.lockedUntil - now, reason: 'account' };
  }

  const ipEntry = ipAttempts.get(ip);
  if (ipEntry && now - ipEntry.windowStart < IP_WINDOW_MS && ipEntry.count >= IP_MAX_ATTEMPTS) {
    return { blocked: true, retryAfterMs: IP_WINDOW_MS - (now - ipEntry.windowStart), reason: 'ip' };
  }

  return { blocked: false };
}

function recordFailure(accountKey, ip) {
  const now = Date.now();

  const account = accountAttempts.get(accountKey) || { count: 0, lockedUntil: null };
  account.count += 1;
  if (account.count >= ACCOUNT_MAX_ATTEMPTS) {
    account.lockedUntil = now + ACCOUNT_LOCKOUT_MS;
    account.count = 0; // reset so a lockout doesn't stack indefinitely once it expires
  }
  accountAttempts.set(accountKey, account);

  const ipEntry = ipAttempts.get(ip) || { count: 0, windowStart: now };
  if (now - ipEntry.windowStart > IP_WINDOW_MS) {
    ipEntry.count = 0;
    ipEntry.windowStart = now;
  }
  ipEntry.count += 1;
  ipAttempts.set(ip, ipEntry);
}

function recordSuccess(accountKey) {
  accountAttempts.delete(accountKey);
}

module.exports = { checkLimit, recordFailure, recordSuccess };
