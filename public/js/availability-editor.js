// Shared weekly-hours editor: a day-by-day list of time ranges, each day supporting any number
// of ranges (split shifts, e.g. 12:00-13:00 and 19:00-23:00 on the same day). Used both by the
// doctor dashboard (editing their own hours) and the admin dashboard (editing any doctor's hours).
const AVAILABILITY_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function renderAvailabilityEditor(containerEl, existingRanges) {
  const byDay = {};
  AVAILABILITY_DAY_NAMES.forEach((_, i) => { byDay[i] = []; });
  existingRanges.forEach((r) => { byDay[r.day_of_week].push(r); });

  containerEl.innerHTML = AVAILABILITY_DAY_NAMES.map((name, i) => `
    <div style="padding:12px 0; border-bottom:1px solid var(--line);">
      <strong>${name}</strong>
      <div class="avail-ranges" data-day="${i}" style="margin-top:8px; display:flex; flex-direction:column; gap:8px;">
        ${byDay[i].map((r) => availabilityRangeRow(r.start_time, r.end_time)).join('')}
      </div>
      <button type="button" class="btn btn-secondary" style="margin-top:8px; padding:5px 12px; font-size:0.85rem;" onclick="addAvailabilityRange(this)">+ Add time range</button>
    </div>
  `).join('');
}

function availabilityRangeRow(start, end) {
  return `
    <div style="display:flex; align-items:center; gap:10px;">
      <input type="time" class="avail-start" value="${start || '09:00'}" style="width:120px;">
      <span>to</span>
      <input type="time" class="avail-end" value="${end || '17:00'}" style="width:120px;">
      <button type="button" class="btn btn-secondary" style="padding:5px 10px; font-size:0.85rem;" onclick="this.parentElement.remove()">Remove</button>
    </div>
  `;
}

function addAvailabilityRange(button) {
  const rangesEl = button.previousElementSibling;
  rangesEl.insertAdjacentHTML('beforeend', availabilityRangeRow('09:00', '17:00'));
}

// Reads the current UI state back into [{ dayOfWeek, startTime, endTime }, ...]
function collectAvailabilityRanges(containerEl) {
  const ranges = [];
  containerEl.querySelectorAll('.avail-ranges').forEach((dayEl) => {
    const dayOfWeek = Number(dayEl.dataset.day);
    dayEl.querySelectorAll(':scope > div').forEach((row) => {
      const startTime = row.querySelector('.avail-start').value;
      const endTime = row.querySelector('.avail-end').value;
      ranges.push({ dayOfWeek, startTime, endTime });
    });
  });
  return ranges;
}
