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

module.exports = { DOCUMENT_TYPES };
