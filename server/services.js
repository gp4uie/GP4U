// Service catalogue for GP4U. Edit prices/durations/labels here — nothing else needs to change.
const SERVICES = {
  general: { label: 'General GP Consultation', durationMins: 15, priceCents: 3500 },
  audio: { label: 'Audio Consultation', durationMins: 10, priceCents: 3000 },
  video: { label: 'Video Consultation', durationMins: 15, priceCents: 4000 },
  travel: { label: 'Travel Health Consultation', durationMins: 20, priceCents: 4500 },
  womens: { label: "Women's Health Consultation", durationMins: 20, priceCents: 4500 },
  repeat_rx: { label: 'Repeat Prescription', durationMins: 10, priceCents: 2500 },
  sick_cert: { label: 'Sick Certificate', durationMins: 10, priceCents: 2500 },
};

module.exports = { SERVICES };
