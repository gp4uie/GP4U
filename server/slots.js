const db = require('./db');
const { getService } = require('./services');

const DAYS_AHEAD = 10;
const SLOT_STEP_MINS = 15;
// At most this many online patients can book the same 15-minute slot (and never more than the doctors working then).
// Can be changed with MAX_PATIENTS_PER_SLOT in the hosting settings.
const MAX_PATIENTS_PER_SLOT = Math.max(1, parseInt(process.env.MAX_PATIENTS_PER_SLOT, 10) || 2);

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

const DEFAULT_DAY_START_MINS = 9 * 60; // 09:00 — used only when no doctor has set any hours yet
const DEFAULT_DAY_END_MINS = 17 * 60; // 17:00

// The actual working-hours span for one day of the week (0=Sunday..6=Saturday), spanning the
// earliest start and latest end across every doctor's availability that day — so the doctor
// dashboard's calendar can size itself to real hours (e.g. an evening shift) instead of a fixed
// 9-5 window. Falls back to a sensible default if nobody has set hours for that day at all.
async function getDayHoursRange(dayOfWeek) {
  const availability = await db.all(
    'SELECT start_time, end_time FROM doctor_availability WHERE day_of_week = ?',
    [dayOfWeek]
  );
  if (availability.length === 0) {
    return { startMins: DEFAULT_DAY_START_MINS, endMins: DEFAULT_DAY_END_MINS };
  }
  return {
    startMins: Math.min(...availability.map((a) => timeToMinutes(a.start_time))),
    endMins: Math.max(...availability.map((a) => timeToMinutes(a.end_time))),
  };
}

// Returns available slot start times (ISO strings) for a given service type.
// The online calendar is a grid of 15-minute slots. Every online booking takes exactly ONE slot (the one it starts in),
// whatever the consultation's length. A slot is offered while it has fewer bookings than its capacity:
// MAX_PATIENTS_PER_SLOT (2), or fewer if fewer doctors are working then (one doctor = one patient per slot).
// Once a slot is full it disappears from the list for the next patient.
async function getAvailableSlots(serviceKey) {
  const service = await getService(serviceKey);
  if (!service) return [];

  const durationMs = service.durationMins * 60 * 1000;
  // Only doctors whose account is active count (a deactivated doctor's old hours don't open slots).
  const availability = await db.all('SELECT a.doctor_id, a.day_of_week, a.start_time, a.end_time FROM doctor_availability a JOIN doctors d ON d.id = a.doctor_id AND d.active = 1');
  if (availability.length === 0) return [];

  // A booking waiting at the card page holds its time for 35 minutes only (Stripe's payment page expires after 30),
  // so a patient who abandons payment doesn't block that slot for everyone else.
  // Counted: confirmed and completed consultations (a consultation finished early still keeps its slot), plus ones
  // at the payment step in the last 35 minutes. Walk-ins at the clinic are not online appointments, so they don't count.
  const { RX_REQUEST_KEYS } = require('./rxServices'); // prescription requests aren't appointments either
  const existing = await db.all(`SELECT slot_start FROM bookings WHERE service_type <> 'walk_in' AND service_type NOT IN (${RX_REQUEST_KEYS.map(() => '?').join(',')}) AND (status IN ('paid', 'completed') OR (status = 'pending_payment' AND created_at > DATE_SUB(NOW(), INTERVAL 35 MINUTE)))`, RX_REQUEST_KEYS);
  const perSlot = new Map(); // slot start (ms, rounded down to the 15-minute grid) -> bookings in it
  const STEP_MS = SLOT_STEP_MINS * 60 * 1000;
  for (const b of existing) {
    const t = new Date(b.slot_start).getTime();
    const key = t - (((t % STEP_MS) + STEP_MS) % STEP_MS);
    perSlot.set(key, (perSlot.get(key) || 0) + 1);
  }

  const slots = [];
  const now = new Date();

  for (let d = 0; d < DAYS_AHEAD; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() + d);
    const dow = day.getDay();
    const dayAvailability = availability.filter((a) => a.day_of_week === dow);
    if (dayAvailability.length === 0) continue;

    const dayStartMins = Math.min(...dayAvailability.map((a) => timeToMinutes(a.start_time)));
    const dayEndMins = Math.max(...dayAvailability.map((a) => timeToMinutes(a.end_time)));

    for (let mins = dayStartMins; mins < dayEndMins; mins += SLOT_STEP_MINS) {
      const hour = Math.floor(mins / 60);
      const min = mins % 60;
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, min, 0, 0);
      if (start <= now) continue;
      const end = new Date(start.getTime() + durationMs);

      // Doctors working for this whole 15-minute slot
      const coveringDoctors = new Set(dayAvailability.filter(
        (a) => timeToMinutes(a.start_time) <= mins && timeToMinutes(a.end_time) >= mins + SLOT_STEP_MINS
      ).map((a) => a.doctor_id)).size;
      if (coveringDoctors === 0) continue;
      const capacity = Math.min(MAX_PATIENTS_PER_SLOT, coveringDoctors);

      if ((perSlot.get(start.getTime()) || 0) < capacity) {
        slots.push({ start: start.toISOString(), end: end.toISOString() });
      }
    }
  }
  return slots;
}

module.exports = { getAvailableSlots, getDayHoursRange };
