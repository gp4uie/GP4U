// Doxy.me rooms for video/audio consultations.
//  - The practice's room comes from DOXY_ROOM_URL in the hosting settings (e.g. https://doxy.me/gp4u/gp4u).
//  - Each doctor can also have their own room (Admin > Doctors > Edit). A patient is sent to the room of the doctor
//    who claimed / started their consultation, falling back to the practice's room.
// Only doxy.me addresses are accepted, so a typo or a pasted link can never send patients somewhere else.
const db = require('./db');

function normalizeDoxyUrl(value) {
  let v = String(value || '').trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) {
    // "doxy.me/drarshad" or "www.doxy.me/..." typed without https://, or just a room name like "drarshad"
    v = /^(www\.)?doxy\.me(\/|$)/i.test(v) ? 'https://' + v : 'https://doxy.me/' + v.replace(/^\/+/, '');
  }
  try {
    const u = new URL(v);
    if (u.hostname !== 'doxy.me' && !u.hostname.endsWith('.doxy.me')) return null;
    if (u.pathname.replace(/\/+$/, '') === '') return null; // a room name is required
    u.protocol = 'https:'; u.hash = ''; u.search = '';
    return u.toString().replace(/\/+$/, '');
  } catch (e) { return null; }
}

function clinicRoom() { return normalizeDoxyUrl(process.env.DOXY_ROOM_URL); }

async function doctorRoom(doctorId) {
  if (!doctorId) return null;
  const d = await db.get('SELECT video_room_url FROM doctors WHERE id = ?', [doctorId]);
  return d ? normalizeDoxyUrl(d.video_room_url) : null;
}

// The room a patient should go to for a booking: the claiming doctor's own room, else the practice's.
async function roomForBooking(booking) {
  return (await doctorRoom(booking && booking.claimed_by)) || clinicRoom();
}

module.exports = { normalizeDoxyUrl, clinicRoom, doctorRoom, roomForBooking };
