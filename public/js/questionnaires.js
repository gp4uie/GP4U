// =============================================================================
// DRAFT CLINICAL CONTENT — READ BEFORE LAUNCH
// =============================================================================
// Every question, contraindication, and routing rule in this file is a starting
// structural draft, not a validated clinical decision tool. It was compiled by
// a non-clinician (the developer) and adapted from the publicly published
// suitability/contraindication lists of a comparable Irish online-prescription
// service (webdoctor.ie), reworded as patient-facing yes/no questions — it is
// NOT copied clinical protocol from GP4U's own prescribing standards. The
// prescribing GP must review and adjust every question and every red-flag rule
// below before any of this goes live.
//
// How this works: each entry below is a yes/no safety question shown before the
// normal booking form. By default, answering "Yes" is the red-flag trigger; set
// triggerOn: 'no' for the rare question where "No" is the concerning answer
// (e.g. "has a doctor diagnosed you with X before?"). If ANY red-flag question
// is triggered, the patient is blocked from the written-request payment flow
// and offered a Video Consultation instead (see public/js/book.js). Questions
// marked urgent: true additionally show emergency guidance (call 112/999)
// rather than just "book a video call" — currently only used for the migraine
// emergency symptoms below.
//
// `info` holds non-safety, condition-specific questions (free text) shown
// alongside the red-flag questions, purely to give the doctor useful context —
// they never affect routing.
// =============================================================================

const QUESTIONNAIRES = {
  contraception: {
    redFlags: [
      { id: 'pregnancyCheck', question: 'Is there any chance you could currently be pregnant?', bullet: 'Possible current pregnancy' },
      { id: 'smoker35', question: 'Are you a smoker aged 35 or older?', bullet: 'You smoke and are aged 35 or over' },
      { id: 'clotHistory', question: 'Have you ever had a blood clot (DVT or PE), or has a close relative had one before age 45?', bullet: 'History of blood clots (DVT/PE), or a strong family history' },
      { id: 'cardiacHistory', question: 'Have you had a heart attack, stroke, or been diagnosed with angina?', bullet: 'History of heart attack, stroke, or angina' },
      { id: 'migraineAura', question: 'Do you get migraines with aura (warning signs such as visual disturbance before the headache starts)?', bullet: 'Migraine with aura' },
      { id: 'uncontrolledBP', question: "Do you have high blood pressure that isn't well controlled?", bullet: 'Uncontrolled high blood pressure' },
      { id: 'breastfeedingEarly', question: 'Are you currently breastfeeding a baby under 6 weeks old?', bullet: 'Breastfeeding a baby under 6 weeks old' },
      { id: 'cancerHistory', question: 'Have you ever been diagnosed with breast cancer or another hormone-sensitive cancer?', bullet: 'History of breast cancer or another hormone-sensitive cancer' },
      { id: 'liverDisease', question: 'Do you have liver disease, or a history of liver problems?', bullet: 'Liver disease' },
      { id: 'malabsorption', question: 'Have you had weight-loss (bariatric) surgery, or do you have a condition that affects how you absorb medication?', bullet: 'Bariatric surgery or a malabsorption condition' },
      { id: 'sideEffects', question: 'Are you having significant side effects from your current contraceptive?', bullet: 'Significant side effects from current contraceptive — needs assessment' },
    ],
    info: [
      { id: 'currentMethod', label: 'Which pill, patch, or ring are you currently using (name)?', required: true },
    ],
  },

  period_delay: {
    redFlags: [
      { id: 'pregnancyCheck', question: 'Is there any chance you could currently be pregnant, or are you trying to conceive?', bullet: 'Possible pregnancy or trying to conceive' },
      { id: 'malePatient', question: 'Are you male?', bullet: 'Male patient' },
      { id: 'onCombinedContraception', question: 'Are you currently using a combined hormonal contraceptive (pill, patch, or ring)?', bullet: 'Already using combined hormonal contraception (different approach needed)' },
      { id: 'breastfeeding', question: 'Are you currently breastfeeding?', bullet: 'Currently breastfeeding' },
      { id: 'clotHistory', question: 'Have you ever had a blood clot (DVT or PE)?', bullet: 'History of blood clots (DVT/PE)' },
      { id: 'cancerHistory', question: 'Have you been diagnosed with breast cancer?', bullet: 'History of breast cancer' },
      { id: 'cardiacHistory', question: 'Do you have a history of stroke, heart attack, angina, or a cardiac stent?', bullet: 'Cardiovascular history' },
      { id: 'liverDisease', question: 'Do you have significant liver disease?', bullet: 'Significant liver disease' },
      { id: 'porphyria', question: 'Have you been diagnosed with porphyria?', bullet: 'Porphyria' },
    ],
    info: [
      { id: 'delayDates', label: 'What dates do you need your period delayed for (from / until)?', required: true },
    ],
  },

  uti: {
    redFlags: [
      { id: 'kidneyInfectionSigns', question: 'Do you have a fever, chills, vomiting, or pain in your back/side (flank pain)?', bullet: 'Fever, chills, vomiting, or flank pain (possible kidney infection)' },
      { id: 'pregnant', question: 'Are you pregnant or breastfeeding?', bullet: 'Pregnant or breastfeeding' },
      { id: 'malePatient', question: 'Are you male?', bullet: 'Male patient' },
      { id: 'ageRange', question: 'Are you under 17 or over 65 years old?', bullet: 'Outside the typical age range for this service (under 17 or over 65)' },
      { id: 'bloodInUrine', question: 'Have you noticed blood in your urine?', bullet: 'Blood in urine' },
      { id: 'abnormalBleeding', question: 'Are you experiencing vaginal bleeding or abnormal discharge alongside your symptoms?', bullet: 'Abnormal vaginal bleeding or discharge' },
      { id: 'catheter', question: 'Do you use a urinary catheter (including self-catheterisation)?', bullet: 'Urinary catheter use' },
      { id: 'kidneyFunction', question: 'Do you have a known kidney condition or reduced kidney function?', bullet: 'Known kidney condition or reduced kidney function' },
      { id: 'recurrent', question: 'Has this happened 3 or more times in the last 12 months (or 2+ times in the last 6 months)?', bullet: 'Recurrent UTIs' },
    ],
  },

  ed: {
    redFlags: [
      { id: 'cardiacRisk', question: 'Do you have chest pain, take nitrate medication, or have a diagnosed heart condition (heart failure, valve problems, irregular heart rhythm)?', bullet: 'Chest pain, on nitrate medication, or a diagnosed cardiac condition' },
      { id: 'recentCardiacEvent', question: 'Have you had a heart attack or stroke in the last 6 months, or been advised by a doctor to avoid sexual activity?', bullet: 'Recent heart attack/stroke, or advised to avoid sexual activity' },
      { id: 'bloodPressureIssues', question: 'Do you have uncontrolled high blood pressure, or low blood pressure with fainting episodes?', bullet: 'Uncontrolled high or low blood pressure' },
      { id: 'suddenOnset', question: 'Did this start suddenly and recently, or has it been present since you first became sexually active, rather than developing gradually?', bullet: 'Sudden onset, or lifelong rather than gradual (may need assessment)' },
      { id: 'organDisease', question: 'Do you have significant liver or kidney disease?', bullet: 'Significant liver or kidney disease' },
      { id: 'bloodDisorder', question: 'Have you been diagnosed with sickle cell anaemia, leukaemia, multiple myeloma, or a bleeding/clotting disorder?', bullet: 'Blood disorder (sickle cell, leukaemia, myeloma, or clotting disorder)' },
      { id: 'penileDeformity', question: 'Do you have a physical deformity of the penis (e.g. Peyronie\'s disease)?', bullet: 'Penile deformity' },
      { id: 'eyeConditions', question: 'Have you been diagnosed with retinitis pigmentosa, or vision loss from optic nerve damage?', bullet: 'Retinitis pigmentosa or optic nerve vision loss' },
      { id: 'poppersUse', question: "Do you use 'poppers' (amyl nitrite) or any recreational drugs containing nitrates?", bullet: 'Uses poppers/nitrate recreational drugs' },
    ],
  },

  hair_loss: {
    redFlags: [
      { id: 'pregnancyPlanning', question: 'Are you (or your partner) trying to conceive, or could your partner become pregnant while you take this treatment?', bullet: 'Trying to conceive / partner could become pregnant' },
      { id: 'cancerHistory', question: 'Have you been diagnosed with breast cancer or prostate cancer?', bullet: 'History of breast or prostate cancer' },
      { id: 'otherProstateMed', question: 'Are you already taking medication for a prostate condition?', bullet: 'Already on prostate medication' },
      { id: 'patchyLoss', question: 'Is your hair loss patchy or sudden, rather than a gradual thinning pattern?', bullet: 'Patchy or sudden hair loss (needs assessment, not routine treatment)' },
      { id: 'moodHistory', question: 'Have you experienced depression or significant mood changes linked to medication before?', bullet: 'History of medication-linked mood changes/depression' },
    ],
    info: [
      { id: 'currentTreatment', label: 'Which treatment are you currently using, if any?', required: false },
    ],
  },

  acne: {
    redFlags: [
      { id: 'pregnancyCheck', question: 'Are you currently pregnant, breastfeeding, or planning a pregnancy in the next few months?', bullet: 'Pregnant, breastfeeding, or planning pregnancy' },
      { id: 'severeAcne', question: 'Do you have severe acne with painful lumps, nodules, or scarring?', bullet: 'Severe/nodular or scarring acne (may need dermatology referral)' },
      { id: 'priorDiagnosis', question: 'Has a doctor previously diagnosed you with acne?', bullet: 'No prior doctor diagnosis of acne', triggerOn: 'no' },
      { id: 'otherSkinCondition', question: 'Do you think this might be a different skin condition rather than acne (e.g. rosacea)?', bullet: 'Possible different underlying skin condition' },
    ],
    info: [
      { id: 'triedSoFar', label: "Please describe your acne and what you've tried so far", required: false },
    ],
  },

  asthma: {
    redFlags: [
      { id: 'recentAE', question: 'Have you had an A&E visit or hospital admission for your asthma recently?', bullet: 'Recent A&E visit or hospital admission for asthma' },
      { id: 'relieverOveruse', question: 'Are you using your reliever (blue) inhaler more than usual?', bullet: 'Using reliever inhaler more than usual' },
      { id: 'nightSymptoms', question: 'Are your night-time asthma symptoms getting worse?', bullet: 'Increasing night-time symptoms' },
      { id: 'acuteSymptomsNow', question: 'Do you currently have shortness of breath, wheeze, chest pain, or a high temperature?', bullet: 'Current acute symptoms (shortness of breath, wheeze, chest pain, fever)' },
      { id: 'priorDiagnosis', question: 'Has a doctor formally diagnosed you with asthma before?', bullet: 'No prior formal asthma diagnosis', triggerOn: 'no' },
      { id: 'pregnant', question: 'Are you currently pregnant?', bullet: 'Currently pregnant' },
    ],
    info: [
      { id: 'currentInhalers', label: 'Which inhaler(s) are you currently prescribed?', required: true },
    ],
  },

  migraine: {
    redFlags: [
      { id: 'worstEverHeadache', question: 'Is this the worst headache of your life, or did it come on suddenly like a thunderclap?', bullet: "Sudden 'worst-ever' or thunderclap headache", urgent: true },
      { id: 'neuroSymptoms', question: 'Do you have any new weakness, numbness, vision loss, or difficulty speaking?', bullet: 'New neurological symptoms (weakness, vision loss, speech difficulty)', urgent: true },
      { id: 'headInjury', question: 'Did this headache start after a recent head injury?', bullet: 'Headache following a head injury', urgent: true },
      { id: 'recentOnsetOrLateOnset', question: 'Was your very first migraine less than 12 months ago, or did your migraines start after age 50?', bullet: 'Recent-onset (under 12 months) or late-onset (after 50) migraine — needs assessment, not routine treatment' },
      { id: 'symptomsChanged', question: 'Has your usual migraine pattern changed recently (more frequent, more severe, or different from before)?', bullet: 'Recent change in migraine pattern' },
      { id: 'cardiacRisk', question: 'Do you have heart disease, had a stroke/TIA, or uncontrolled high blood pressure?', bullet: 'Cardiovascular disease or uncontrolled blood pressure' },
      { id: 'epilepsy', question: 'Do you have epilepsy or have you ever had a seizure?', bullet: 'Epilepsy or seizure history' },
      { id: 'pregnancyCheck', question: 'Are you pregnant, planning a pregnancy, or breastfeeding?', bullet: 'Pregnant, planning pregnancy, or breastfeeding' },
    ],
    info: [
      { id: 'pastTreatment', label: 'Which medication has worked for you in the past, if any?', required: false },
    ],
  },

  hypothyroidism: {
    redFlags: [
      { id: 'priorDiagnosis', question: 'Have you been formally diagnosed with hypothyroidism by a doctor?', bullet: 'No formal hypothyroidism diagnosis', triggerOn: 'no' },
      { id: 'doseChange', question: 'Are you looking to change your current dose, rather than continue the same dose?', bullet: 'Requesting a dose change (needs review, not a routine repeat)' },
      { id: 'pregnancyPlanning', question: 'Are you currently pregnant, or planning a pregnancy?', bullet: 'Pregnant or planning pregnancy' },
      { id: 'cardiacSymptoms', question: 'Do you have chest pain or palpitations?', bullet: 'Chest pain or palpitations' },
      { id: 'noRecentBloods', question: 'Have you had a thyroid (TSH) blood test within the last 6 months?', bullet: 'No recent thyroid blood tests on file', triggerOn: 'no' },
      { id: 'notStable', question: 'Have there been any changes to your dose or symptoms in the last 6 months?', bullet: 'Not stable on current treatment for the last 6 months' },
    ],
    info: [
      { id: 'currentDose', label: 'What is your current medication name and dose (e.g. Levothyroxine 100mcg)?', required: true },
    ],
  },

  stop_smoking: {
    redFlags: [
      { id: 'pregnant', question: 'Are you currently pregnant, or breastfeeding?', bullet: 'Pregnant or breastfeeding' },
      { id: 'cardiacEvent', question: 'Have you ever had a heart attack, stroke, or other cardiovascular event?', bullet: 'History of cardiovascular event (relevant to medication choice)' },
      { id: 'seizureHistory', question: 'Do you have a history of seizures, or a condition that increases seizure risk?', bullet: 'Seizure history or increased seizure risk' },
      { id: 'mentalHealthHistory', question: 'Have you ever been treated for a psychological or psychiatric condition (e.g. depression, anxiety, bipolar disorder, schizophrenia)?', bullet: 'History of psychological/psychiatric treatment — needs discussion, not automatic exclusion' },
      { id: 'multipleTherapies', question: 'Are you already using more than one stop-smoking treatment at the same time?', bullet: 'Already combining more than one stop-smoking treatment' },
    ],
    info: [
      { id: 'preference', label: 'Do you have a preferred treatment (patches, gum, tablets), if any?', required: false },
    ],
  },

  hay_fever: {
    redFlags: [
      { id: 'anaphylaxisHistory', question: 'Have you ever had a severe allergic reaction (anaphylaxis)?', bullet: 'History of anaphylaxis (needs a different pathway, not routine antihistamines)' },
      { id: 'pregnancyCheck', question: 'Are you pregnant or breastfeeding?', bullet: 'Pregnant or breastfeeding' },
      { id: 'priorDiagnosis', question: 'Has a doctor confirmed you have hay fever or allergic rhinitis?', bullet: 'No confirmed hay fever/allergic rhinitis diagnosis', triggerOn: 'no' },
      { id: 'currentlyUnwell', question: 'Do you currently have a fever, facial pain, or coloured/green nasal discharge?', bullet: 'Signs of possible infection rather than hay fever' },
      { id: 'priorReaction', question: 'Have you had an allergic reaction to antihistamines before?', bullet: 'Prior allergic reaction to antihistamines' },
    ],
  },

  cold_sores: {
    redFlags: [
      { id: 'immunocompromised', question: 'Are you immunocompromised, or taking medication that suppresses your immune system?', bullet: 'Immunocompromised or on immunosuppressant medication' },
      { id: 'nearEye', question: 'Are your symptoms near your eye, on your eye, or inside your mouth/nose?', bullet: 'Symptoms near the eye or in an unusual location' },
      { id: 'firstEpisode', question: 'Is this the first time you have ever had a cold sore?', bullet: 'First-ever episode (needs assessment, not routine repeat treatment)' },
      { id: 'suppressionNeeded', question: 'Are you looking for ongoing/long-term suppression treatment, rather than treatment for a single outbreak?', bullet: 'Requesting long-term suppression therapy' },
      { id: 'kidneyDisease', question: 'Do you have severe kidney disease?', bullet: 'Severe kidney disease' },
    ],
  },

  eczema_psoriasis: {
    redFlags: [
      { id: 'infectionSigns', question: 'Do you have any signs of skin infection — spreading redness, pus, or fever?', bullet: 'Signs of skin infection (spreading redness, pus, fever)' },
      { id: 'widespread', question: 'Is the affected area widespread (more than about 5 handprints in size), or has it not been assessed by a doctor before?', bullet: 'Widespread/extensive involvement not previously assessed' },
      { id: 'sensitiveAreas', question: 'Is the affected area on your face, genitals, or skin folds (groin, armpits, under the breasts)?', bullet: 'Affects face, genitals, or skin folds — needs a different treatment approach' },
      { id: 'immunosuppressed', question: 'Are you taking immunosuppressant medication, or being treated with biologics or phototherapy?', bullet: 'On immunosuppressants, biologics, or phototherapy' },
      { id: 'jointSymptoms', question: 'Do you have joint pain, swelling, or stiffness alongside your skin symptoms?', bullet: 'Joint symptoms alongside skin flare' },
      { id: 'pregnancyCheck', question: 'Are you pregnant or breastfeeding?', bullet: 'Pregnant or breastfeeding' },
    ],
    info: [
      { id: 'affectedArea', label: "Which area of the body is affected, and what have you tried so far?", required: false },
    ],
  },

};

// Groups conditions the same way webdoctor.ie's Repeat Prescription section does, for the
// repeat-prescription.html hub page.
const CATEGORIES = {
  "Women's Health": ['contraception', 'period_delay', 'uti'],
  "Men's Health": ['hair_loss', 'ed'],
  'Skin Health': ['acne', 'cold_sores', 'eczema_psoriasis'],
  'General Health': ['asthma', 'migraine', 'hypothyroidism', 'stop_smoking', 'hay_fever'],
};

// Human-readable labels for the service pages / hub page, keyed the same as QUESTIONNAIRES
// and the `services` table (underscore-case). Page filenames use hyphens for SEO-friendly URLs —
// see PAGE_SLUGS below for the key -> filename mapping.
// Note: travel health is deliberately not a repeat-prescription condition here — it's covered by
// the standalone "Travel Health Consultation" (`travel`) service instead, since a trip isn't a
// "repeat" of anything a patient already takes.
const PRESCRIPTION_SERVICE_KEYS = [
  'contraception', 'period_delay', 'uti', 'ed', 'hair_loss', 'acne', 'asthma',
  'migraine', 'hypothyroidism', 'stop_smoking', 'hay_fever', 'cold_sores',
  'eczema_psoriasis',
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
};

// One-line taglines for the repeat-prescription.html hub page cards.
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
