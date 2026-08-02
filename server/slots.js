const db = require('./db');
const { SERVICES } = require('./services');

const DAYS_AHEAD = 10;
const SLOT_STEP_MINS = 15;

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Returns available slot start times (ISO strings) for a given service type. A slot is offered
// only if at least one doctor's own working hours (set in the dashboard's Availability tab)
// cover it, and fewer existing bookings overlap it than doctors covering it — so two doctors
// both free at 10am means two patients can book that same 10am slot, one each.
async function getAvailableSlots(serviceKey) {
  const service = SERVICES[serviceKey];
  if (!service) return [];

  const durationMs = service.durationMins * 60 * 1000;
  const availability = await db.all('SELECT doctor_id, day_of_week, start_time, end_time FROM doctor_availability');
  if (availability.length === 0) return [];

  const existing = await db.all("SELECT slot_start, slot_end FROM bookings WHERE status IN ('paid', 'pending_payment')");

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

      const startMins = mins;
      const endMins = mins + service.durationMins;
      const coveringDoctors = dayAvailability.filter(
        (a) => timeToMinutes(a.start_time) <= startMins && timeToMinutes(a.end_time) >= endMins
      ).length;
      if (coveringDoctors === 0) continue;

      const overlappingBookings = existing.filter((b) =>
        overlaps(start, end, new Date(b.slot_start), new Date(b.slot_end))
      ).length;

      if (overlappingBookings < coveringDoctors) {
        slots.push({ start: start.toISOString(), end: end.toISOString() });
      }
    }
  }
  return slots;
}

module.exports = { getAvailableSlots };
