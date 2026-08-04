// =============================================================================
// DRAFT CLINICAL CONTENT — READ BEFORE LAUNCH
// =============================================================================
// Every question, contraindication, and routing rule in this file is a starting
// structural draft written by a non-clinician (the developer), not a validated
// clinical decision tool. The prescribing GP must review and adjust every
// question and every red-flag rule below before any of this goes live.
//
// Two conditions — `period_delay` and `acne` — were not given a red-flag list
// at all when this was built. Each has exactly ONE conservative placeholder
// question (a basic pregnancy check) so the booking path isn't completely
// unscreened, but this is NOT a substitute for a proper safety review. Search
// this file for "PLACEHOLDER" to find them.
//
// How this works: each entry below is a yes/no safety question shown before the
// normal booking form. By default, answering "Yes" is the red-flag trigger; set
// triggerOn: 'no' for the rare question where "No" is the concerning answer
// (see hypothyroidism's noRecentBloods). If ANY red-flag question is triggered,
// the patient is blocked from the written-request payment flow and offered a
// Video Consultation instead (see public/js/book.js). Questions marked
// urgent: true additionally show emergency guidance (call 112/999) rather than
// just "book a video call" — currently only used for the migraine emergency
// symptoms below.
// =============================================================================

const QUESTIONNAIRES = {
  contraception: {
    redFlags: [
      { id: 'smoker35', question: 'Are you a smoker aged 35 or older?', bullet: 'You smoke and are aged 35 or over' },
      { id: 'clotHistory', question: "Have you ever had a blood clot (DVT or PE), or been told you have an increased risk of one?", bullet: 'History of blood clots (DVT/PE), or a known increased risk' },
      { id: 'migraineAura', question: 'Do you get migraines with aura (warning signs such as visual disturbance before the headache starts)?', bullet: 'Migraine with aura' },
      { id: 'breastfeedingEarly', question: 'Are you currently breastfeeding a baby under 6 weeks old?', bullet: 'Breastfeeding a baby under 6 weeks old' },
      { id: 'uncontrolledBP', question: "Do you have high blood pressure that isn't well controlled?", bullet: 'Uncontrolled high blood pressure' },
    ],
  },

  // PLACEHOLDER — no red-flag list was provided for Period Delay. This single
  // pregnancy-check question is a conservative placeholder only.
  period_delay: {
    redFlags: [
      { id: 'pregnancyCheck', question: 'Is there any chance you could currently be pregnant?', bullet: 'Any chance of current pregnancy' },
    ],
  },

  uti: {
    redFlags: [
      { id: 'kidneyInfectionSigns', question: 'Do you have a fever, pain in your back or side (loin/flank pain), or vomiting alongside your urinary symptoms?', bullet: 'Fever, loin/flank pain, or vomiting (possible kidney infection)' },
      { id: 'pregnant', question: 'Are you currently pregnant?', bullet: 'Currently pregnant' },
      { id: 'malePatient', question: 'Are you male?', bullet: 'Male patient' },
      { id: 'recurrent', question: 'Have you had 3 or more urine infections in the last 12 months?', bullet: '3 or more UTIs in the last 12 months (recurrent)' },
      { id: 'antibioticAllergy', question: 'Do you have a known allergy to the standard antibiotics used for urine infections (e.g. nitrofurantoin, trimethoprim)?', bullet: 'Known allergy to standard UTI antibiotics' },
    ],
  },

  ed: {
    redFlags: [
      { id: 'cardiacRisk', question: 'Do you have chest pain, take nitrate medication, or have a diagnosed heart condition?', bullet: 'Chest pain, on nitrate medication, or a diagnosed cardiac condition' },
      { id: 'suddenOnset', question: 'Did this start suddenly and recently, rather than gradually over time?', bullet: 'Sudden, recent onset (may need assessment rather than routine treatment)' },
    ],
  },

  hair_loss: {
    redFlags: [
      { id: 'pregnancyPlanning', question: 'Are you (or your partner) planning a pregnancy, or could you or they become pregnant while you take this treatment?', bullet: 'Planning a pregnancy (relevant to finasteride)' },
      { id: 'patchyLoss', question: 'Is your hair loss patchy or sudden, rather than a gradual thinning pattern?', bullet: 'Patchy or sudden hair loss (needs assessment, not routine treatment)' },
    ],
  },

  // PLACEHOLDER — no red-flag list was provided for Acne. This single
  // pregnancy-check question is a conservative placeholder only.
  acne: {
    redFlags: [
      { id: 'pregnancyCheck', question: 'Are you currently pregnant, or planning a pregnancy in the next few months?', bullet: 'Pregnant or planning pregnancy' },
    ],
  },

  asthma: {
    redFlags: [
      { id: 'recentAE', question: 'Have you had an A&E visit or hospital admission for your asthma recently?', bullet: 'Recent A&E visit or hospital admission for asthma' },
      { id: 'relieverOveruse', question: 'Are you using your reliever (blue) inhaler more than usual?', bullet: 'Using reliever inhaler more than usual' },
      { id: 'nightSymptoms', question: 'Are your night-time asthma symptoms getting worse?', bullet: 'Increasing night-time symptoms' },
    ],
  },

  migraine: {
    redFlags: [
      { id: 'worstEverHeadache', question: 'Is this the worst headache of your life, or did it come on suddenly like a thunderclap?', bullet: "Sudden 'worst-ever' or thunderclap headache", urgent: true },
      { id: 'neuroSymptoms', question: 'Do you have any new weakness, numbness, vision loss, or difficulty speaking?', bullet: 'New neurological symptoms (weakness, vision loss, speech difficulty)', urgent: true },
      { id: 'headInjury', question: 'Did this headache start after a recent head injury?', bullet: 'Headache following a head injury', urgent: true },
    ],
  },

  hypothyroidism: {
    redFlags: [
      { id: 'pregnancyPlanning', question: 'Are you currently pregnant, or planning a pregnancy?', bullet: 'Pregnant or planning pregnancy' },
      { id: 'cardiacSymptoms', question: 'Do you have chest pain or palpitations?', bullet: 'Chest pain or palpitations' },
      { id: 'noRecentBloods', question: 'Have you had a thyroid (TSH) blood test within the last 6 months?', bullet: 'No recent thyroid blood tests on file', triggerOn: 'no' },
    ],
  },

  stop_smoking: {
    redFlags: [
      { id: 'pregnant', question: 'Are you currently pregnant?', bullet: 'Currently pregnant' },
      { id: 'cardiacEvent', question: 'Have you ever had a heart attack, stroke, or other cardiovascular event?', bullet: 'History of cardiovascular event (relevant to medication choice)' },
    ],
  },

  hay_fever: {
    redFlags: [
      { id: 'anaphylaxisHistory', question: 'Have you ever had a severe allergic reaction (anaphylaxis)?', bullet: 'History of anaphylaxis (needs a different pathway, not routine antihistamines)' },
    ],
  },

  cold_sores: {
    redFlags: [
      { id: 'immunocompromised', question: 'Are you immunocompromised, or taking medication that suppresses your immune system?', bullet: 'Immunocompromised or on immunosuppressant medication' },
      { id: 'nearEye', question: 'Are your symptoms near your eye?', bullet: 'Symptoms near the eye' },
    ],
  },

  eczema_psoriasis: {
    redFlags: [
      { id: 'infectionSigns', question: 'Do you have any signs of skin infection — spreading redness, pus, or fever?', bullet: 'Signs of skin infection (spreading redness, pus, fever)' },
      { id: 'widespread', question: 'Is the affected area widespread or extensive, and has it not been assessed by a doctor before?', bullet: 'Widespread/extensive involvement not previously assessed' },
    ],
  },

  travel_health: {
    redFlags: [
      { id: 'pregnant', question: 'Are you currently pregnant?', bullet: 'Currently pregnant' },
      { id: 'immunocompromised', question: 'Are you immunocompromised, or taking medication that suppresses your immune system?', bullet: 'Immunocompromised' },
      { id: 'yellowFever', question: 'Does your destination require a Yellow Fever vaccination certificate?', bullet: 'Destination requires a Yellow Fever certificate (may need an in-person/specialist travel clinic)' },
    ],
  },
};

// Human-readable labels for the service pages / homepage grid, keyed the same as QUESTIONNAIRES
// and the `services` table (underscore-case). Page filenames use hyphens for SEO-friendly URLs —
// see PAGE_SLUGS below for the key -> filename mapping.
const PRESCRIPTION_SERVICE_KEYS = [
  'contraception', 'period_delay', 'uti', 'ed', 'hair_loss', 'acne', 'asthma',
  'migraine', 'hypothyroidism', 'stop_smoking', 'hay_fever', 'cold_sores',
  'eczema_psoriasis', 'travel_health',
];

const PAGE_SLUGS = {
  contraception: 'contraception',
  period_delay: 'period-delay',
  uti: 'uti',
  ed: 'ed',
  hair_loss: 'hair-loss',
  acne: 'acne',
  asthma: 'asthma',
  migraine: 'migraine',
  hypothyroidism: 'hypothyroidism',
  stop_smoking: 'stop-smoking',
  hay_fever: 'hay-fever',
  cold_sores: 'cold-sores',
  eczema_psoriasis: 'eczema-psoriasis',
  travel_health: 'travel-health',
};

// One-line taglines for the homepage prescription-services grid (index.html).
const SERVICE_TAGLINES = {
  contraception: 'Continue your pill, patch, or ring',
  period_delay: 'Delay your period for a trip or event',
  uti: 'Fast-track treatment for UTI symptoms',
  ed: 'Confidential online ED review',
  hair_loss: 'Review for pattern hair loss',
  acne: 'Ongoing acne treatment review',
  asthma: 'Review your asthma control & inhalers',
  migraine: 'Treatment for an established diagnosis',
  hypothyroidism: 'Thyroid medication review',
  stop_smoking: 'Support and medication to quit',
  hay_fever: 'Allergy symptoms not settling with OTC meds',
  cold_sores: 'Treatment for recurring outbreaks',
  eczema_psoriasis: 'Review of a diagnosed flare-up',
  travel_health: 'Advice & vaccinations for your trip',
};

// Evaluates a filled-in answers object ({ [questionId]: 'yes'|'no' }) against a service's
// red-flag rules. Returns { triggered, urgent, triggeredBullets }.
function evaluateRedFlags(serviceKey, answers) {
  const config = QUESTIONNAIRES[serviceKey];
  if (!config) return { triggered: false, urgent: false, triggeredBullets: [] };
  const triggeredBullets = [];
  let urgent = false;
  config.redFlags.forEach((rf) => {
    const answer = answers[rf.id];
    const isTriggered = (rf.triggerOn === 'no') ? answer === 'no' : answer === 'yes';
    if (isTriggered) {
      triggeredBullets.push(rf.bullet);
      if (rf.urgent) urgent = true;
    }
  });
  return { triggered: triggeredBullets.length > 0, urgent, triggeredBullets };
}
