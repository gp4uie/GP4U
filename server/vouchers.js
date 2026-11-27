// Voucher / discount codes for online bookings (Admin > Vouchers).
//  - A code takes a percentage off (1–100%) or a fixed euro amount off the consultation price.
//  - Admins can switch a code on/off, change it, cap how many times it can be used and give it an end date.
//  - The price is always worked out here on the server — the browser only ever shows what the server said.
//  - A booking that comes to €0 (e.g. a 100% code) is confirmed without going to the card payment page.
const db = require('./db');

// Card payments under 50 cent can't be taken (Stripe's minimum), so anything below that is treated as free.
const MIN_CHARGE_CENTS = 50;

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 40);
}
const CODE_RE = /^[A-Z0-9_-]{3,40}$/;

// "Used" = bookings that went through (paid or free), not ones abandoned at the card page.
async function timesUsed(code) {
  const r = await db.get("SELECT COUNT(*) AS n FROM bookings WHERE voucher_code = ? AND status <> 'pending_payment'", [code]);
  return Number(r ? r.n : 0);
}

function describe(v) {
  return v.discount_type === 'amount'
    ? `€${(v.discount_value / 100).toFixed(v.discount_value % 100 ? 2 : 0)} off`
    : `${v.discount_value}% off`;
}

function discountFor(v, priceCents) {
  let off = v.discount_type === 'amount'
    ? Math.min(priceCents, Number(v.discount_value))
    : Math.round(priceCents * Math.min(100, Number(v.discount_value)) / 100);
  let finalCents = priceCents - off;
  if (finalCents > 0 && finalCents < MIN_CHARGE_CENTS) { off = priceCents; finalCents = 0; }
  return { discountCents: off, finalCents };
}

// Returns { ok: true, code, label, discountCents, finalCents } or { ok: false, error } (a patient-friendly message).
async function evaluate(rawCode, priceCents) {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, error: 'Please enter a voucher code.' };
  const v = await db.get('SELECT * FROM vouchers WHERE code = ?', [code]);
  if (!v || !v.active) return { ok: false, error: "That voucher code isn't valid. Please check it and try again." };
  if (v.expires_at) {
    const end = new Date(String(v.expires_at).slice(0, 10) + 'T23:59:59');
    if (Date.now() > end.getTime()) return { ok: false, error: 'That voucher code has expired.' };
  }
  if (v.max_uses && (await timesUsed(code)) >= v.max_uses) {
    return { ok: false, error: 'That voucher code has already been used the maximum number of times.' };
  }
  return { ok: true, code, label: describe(v), ...discountFor(v, priceCents) };
}

module.exports = { normalizeCode, CODE_RE, evaluate, timesUsed, describe };
