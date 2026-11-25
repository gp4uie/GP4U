// Shared by the printable prescription and document pages. Same content as the emailed PDFs (see server/pdf.js):
// letterhead from the clinic's own details, a reference number, and a footer. Everything from the database is escaped.
(function () {
  const esc = (v) => String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const dateIE = (d) => new Date(d).toLocaleDateString('en-IE', { timeZone: 'Europe/Dublin', day: 'numeric', month: 'long', year: 'numeric' });
  const dateTimeIE = (d) => new Date(d).toLocaleString('en-IE', { timeZone: 'Europe/Dublin', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const dobIE = (dob) => { const d = new Date(dob + 'T12:00:00Z'); return Number.isNaN(d.getTime()) ? esc(dob) : d.toLocaleDateString('en-IE', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }); };
  const visitLine = (b) => `${b.service_type === 'walk_in' ? 'Walk-in clinic visit' : 'Online GP consultation'}${b.slot_start ? ', ' + dateIE(b.slot_start) : ''}`;
  const field = (label, value) => (String(value || '').trim() ? `<div class="field"><label>${esc(label)}</label>${esc(value)}</div>` : '');

  function letterhead(p) {
    const lines = [...p.addressLines, p.phone && 'Tel ' + p.phone, p.email, p.website].filter(Boolean);
    return `
      <div class="letterhead">
        <div>
          <h1 class="letterhead-brand"><img src="/img/gp4u-logo-print.png" alt="${esc(p.name)}" class="letterhead-logo" style="display:block;height:46px;width:auto;"></h1>
          <p class="letterhead-slogan">${esc(p.tagline)}</p>
        </div>
        <p class="letterhead-domain">${lines.map(esc).join('<br>')}</p>
      </div>`;
  }
  function footer(p, reference, issued) {
    return `
      <div class="letter-footer">
        ${p.company.length ? `<div>${p.company.map(esc).join(' &middot; ')}</div>` : ''}
        <div>Reference ${esc(reference)} &middot; Issued ${esc(dateTimeIE(issued))}</div>
        <div>Confidential: this document contains health information intended for the person named above or the recipient it is addressed to.</div>
      </div>`;
  }
  function patientFields(b, withPhone) {
    return field('Patient', b.patient_name) + field('Date of birth', dobIE(b.patient_dob)) + field('Address', b.patient_address) + (withPhone ? field('Phone', b.patient_phone) : '');
  }
  // sigImage: the doctor's handwritten signature (a PNG data URL from the server), shown above the name.
  const signature = (name, reg, practice, withSlogan, sigImage) => `
    <div class="sig">
      ${withSlogan ? '<p>Yours sincerely,</p>' : ''}
      ${/^data:image\/png;base64,[A-Za-z0-9+\/=]+$/.test(sigImage || '') ? `<img class="sig-img" src="${sigImage}" alt="Signature of ${esc(name)}" style="display:block;max-width:220px;max-height:64px;margin:4px 0 -6px;">` : ''}
      <p class="sig-name">${esc(name)}</p>
      <p class="sig-meta">IMC Reg No: ${esc(reg)}<br>Issued electronically by ${esc(practice.name)}</p>
    </div>`;

  window.PrintLetter = { esc, dateIE, dateTimeIE, dobIE, visitLine, field, letterhead, footer, patientFields, signature };
})();
