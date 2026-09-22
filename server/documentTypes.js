// Defines the editable fields for each document template.
// Used by the dashboard form and the printable letter renderer.
const DOCUMENT_TYPES = {
  sick_cert: {
    label: 'Sick Certificate',
    fields: ['dateFrom', 'dateTo', 'diagnosis', 'fitForWork'],
  },
  referral_ae: {
    label: 'Referral Letter — Emergency Department',
    fields: ['hospitalName', 'urgency', 'clinicalSummary', 'reasonForReferral'],
  },
  referral_specialist: {
    label: 'Referral Letter — Specialist',
    fields: ['specialty', 'consultantOrDept', 'urgency', 'clinicalSummary', 'reasonForReferral'],
  },
};

// A "sick_cert" document covers two different certificates — "unfit for work" (a date range) and
// "fit to return to work" (a single date). Label and file each one by what it actually certifies,
// so a fit-to-work cert is never emailed or downloaded looking like a sick note.
function certLabelFor(doc) {
  if (doc.doc_type !== 'sick_cert') return (DOCUMENT_TYPES[doc.doc_type] && DOCUMENT_TYPES[doc.doc_type].label) || doc.doc_type;
  try {
    const fields = typeof doc.fields === 'string' ? JSON.parse(doc.fields) : doc.fields;
    return fields && fields.fitForWork === 'fit to return to work' ? 'Fit to Work Certificate' : 'Sick Certificate';
  } catch (err) { return 'Sick Certificate'; }
}

module.exports = { DOCUMENT_TYPES, certLabelFor };
