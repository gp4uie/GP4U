// Prescription requests (repeat prescriptions and the condition-specific prescription pages) are not live
// consultations: the patient sends a request, a doctor issues the prescription (sent to the pharmacy by the practice
// team via Healthlink) or declines it and messages the patient. Mirrors PRESCRIPTION_SERVICE_KEYS in
// public/js/questionnaires.js — update both if a condition page is added or removed.
const PRESCRIPTION_SERVICE_KEYS = [
  'contraception', 'period_delay', 'uti', 'ed', 'hair_loss', 'acne', 'asthma',
  'migraine', 'hypothyroidism', 'stop_smoking', 'hay_fever', 'cold_sores',
  'eczema_psoriasis',
];
const RX_REQUEST_KEYS = ['repeat_rx', ...PRESCRIPTION_SERVICE_KEYS];
function isRxService(serviceType) {
  return RX_REQUEST_KEYS.includes(serviceType);
}
module.exports = { PRESCRIPTION_SERVICE_KEYS, RX_REQUEST_KEYS, isRxService };
