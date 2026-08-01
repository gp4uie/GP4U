const db = require('./db');
const { SERVICES } = require('./services');

const DAYS_AHEAD = 10;
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 17;
const SLOT_STEP_MINS = 15;

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

// Returns available slot start times (ISO strings) for a given service type,
// checked against existing paid/pending bookings so the doctor is never double-booked.
async function getAvailableSlots(serviceKey) {
  const service = SERVICES[serviceKey];
  if (!service) return [];

  const durationMs = service.durationMins * 60 * 1000;
  const existing = await db.all("SELECT slot_start, slot_end FROM bookings WHERE status IN ('paid', 'pending_payment')");

  const slots = [];
  const now = new Date();

  for (let d = 0; d < DAYS_AHEAD; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() + d);
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue; // weekdays only for the prototype

    for (let hour = DAY_START_HOUR; hour < DAY_END_HOUR; hour++) {
      for (let min = 0; min < 60; min += SLOT_STEP_MINS) {
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, min, 0, 0);
        if (start <= now) continue;
        const end = new Date(start.getTime() + durationMs);
        if (end.getHours() > DAY_END_HOUR || (end.getHours() === DAY_END_HOUR && end.getMinutes() > 0)) continue;

        const clash = existing.some((b) =>
          overlaps(start, end, new Date(b.slot_start), new Date(b.slot_end))
        );
        if (!clash) {
          slots.push({ start: start.toISOString(), end: end.toISOString() });
        }
      }
    }
  }
  return slots;
}

module.exports = { getAvailableSlots };
