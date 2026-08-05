// =============================================================================
// DRAFT PATIENT-EDUCATION CONTENT — READ BEFORE LAUNCH
// =============================================================================
// Like questionnaires.js, every "about" paragraph and FAQ answer below is a
// structural first draft written by a non-clinician (the developer) from
// general, widely-published patient-information sources — not reviewed or
// approved by the prescribing GP. It exists to give each condition page more
// substance than a single paragraph (both for patients deciding whether to
// book, and because thin content is a real disadvantage for medical pages in
// search rankings), but every sentence needs the GP's clinical sign-off
// before it should be treated as the practice's approved patient information.
// Nothing here overrides or duplicates the actual safety questions in
// questionnaires.js — those still drive booking eligibility.
// =============================================================================

const CONDITION_CONTENT = {
  ed: {
    about: [
      "Erectile dysfunction (ED) — persistent difficulty getting or keeping an erection firm enough for sex — is common, and becomes more common with age. Most men experience it occasionally; ongoing ED is still very treatable.",
      "Causes are often a mix of physical factors (blood flow, hormones, some medications) and psychological ones (stress, anxiety, relationship factors). Because the blood vessels involved are often affected before symptoms appear elsewhere, ED occasionally signals underlying cardiovascular risk — part of why the safety questions ask about heart health.",
      "Online review generally suits ED that's developed gradually in someone otherwise healthy. Sudden-onset ED, or ED alongside chest pain or uncontrolled blood pressure, needs a closer look — the questionnaire routes you to a video consultation if that applies."
    ],
    faqs: [
      { q: 'Is treatment available same-day?', a: 'Usually yes, once the safety questionnaire and booking form are complete, subject to appointment availability.' },
      { q: 'Will I need an in-person exam?', a: "Not usually for gradually-developing ED in an otherwise healthy adult. If your answers suggest a closer look is needed, you'll be offered a video consultation instead." },
      { q: 'Is this confidential?', a: 'Yes — handled under the same clinical confidentiality standards as any GP visit.' },
      { q: "What if the medication doesn't work for me?", a: "Message your GP through your booking or book a follow-up — response varies by person and sometimes needs a dose or approach change." },
    ],
  },

  hair_loss: {
    about: [
      "Male-pattern hair loss (androgenetic alopecia) is the most common cause of hair thinning in men, usually starting at the temples or crown and progressing gradually over years. It's driven by genetics and hormones, not poor health or diet in most cases.",
      "Two licensed treatments — a topical solution and an oral tablet — can slow or partially reverse pattern hair loss, most effectively when started early. Results take months to appear and continued use is needed to maintain them.",
      "Online review suits established, gradual pattern hair loss. Sudden or patchy hair loss, scalp scarring, or hair loss alongside other symptoms can have different causes and is better assessed in person."
    ],
    faqs: [
      { q: 'How soon will I see results?', a: 'Typically 3-6 months of consistent use before any visible change, and results are only maintained with continued treatment.' },
      { q: 'Are these treatments suitable for women?', a: 'The prescription options offered here are licensed for male-pattern hair loss. Women with hair loss should book a video consultation for a tailored assessment.' },
      { q: 'Does this treat sudden or patchy hair loss?', a: "No — sudden shedding or patchy bald spots have different possible causes and need an in-person or video review rather than a written request." },
      { q: 'Are there side effects to be aware of?', a: 'Your GP will go through the specific medication’s side-effect profile with you before prescribing, based on your answers.' },
    ],
  },

  acne: {
    about: [
      "Acne happens when hair follicles become blocked with oil and dead skin cells, often inflamed by bacteria — most common in teenagers but common in adults too, particularly women in their 20s-40s.",
      "Treatment is usually stepped: topical treatments first, oral options (like antibiotics or, for some women, certain contraceptive pills) for more widespread or persistent acne, with stronger options reserved for severe or scarring acne that a GP may refer on for.",
      "Online review suits an existing, mild-to-moderate acne pattern needing an ongoing or adjusted treatment. Severe, cystic, or scarring acne is often better served by an in-person assessment or dermatology referral."
    ],
    faqs: [
      { q: 'How long before treatment works?', a: 'Most acne treatments take 6-8 weeks to show real improvement, and some take longer — consistency matters more than switching treatments early.' },
      { q: 'Can this treat severe or cystic acne?', a: "Severe or scarring acne is usually better assessed in person, since it may need referral to a dermatologist." },
      { q: "I'm not sure if a doctor has diagnosed my acne before — does that matter?", a: "It's fine either way — the questionnaire asks so your GP has context, not as a strict requirement." },
      { q: 'Will you prescribe antibiotics or the contraceptive pill for acne?', a: 'Your GP will discuss what’s appropriate based on your history — not every option suits every patient.' },
    ],
  },

  asthma: {
    about: [
      "Asthma is a long-term condition where the airways become inflamed and narrowed, causing wheeze, breathlessness, chest tightness, or cough — often triggered by allergens, cold air, exercise, or infections.",
      "Good control usually means using a preventer inhaler regularly (even when well) and a reliever inhaler as needed, with technique and adherence reviewed periodically — a large part of what an asthma review online covers.",
      "Online review suits an existing, formally diagnosed asthma that's stable, for prescription renewal or a technique/control check-in. Worsening symptoms, frequent reliever use, or any breathing emergency need urgent in-person or emergency care instead."
    ],
    faqs: [
      { q: 'Can I get my inhaler prescription renewed online?', a: "Yes, if your asthma is stable and previously diagnosed — that's exactly what this review is for." },
      { q: "What if I'm using my reliever inhaler more than usual?", a: "That's a sign your asthma isn't well controlled — the questionnaire will route you to a video consultation rather than a written renewal." },
      { q: 'Do you check my inhaler technique?', a: "Your GP will ask about it as part of the review — poor technique is one of the most common reasons asthma feels poorly controlled." },
      { q: 'What if I have never been formally diagnosed?', a: 'This service is for reviewing an existing diagnosis — book a video consultation instead if you haven’t been diagnosed before.' },
    ],
  },

  migraine: {
    about: [
      "Migraine is a neurological condition causing recurrent, often severe headaches, typically one-sided and throbbing, frequently with nausea, and sensitivity to light or sound. Some people experience 'aura' — visual or sensory warning symptoms beforehand.",
      "Treatment ranges from simple painkillers and anti-sickness medication for occasional attacks, to specific migraine medications, to preventive daily treatment for frequent migraines — your GP will tailor this to how often and how severely migraines affect you.",
      "Online review suits an established migraine pattern needing ongoing treatment. New, unusually severe ('thunderclap'), or changing headaches — or any headache with neurological symptoms like weakness or vision loss — need urgent in-person assessment, since these can (rarely) signal something more serious."
    ],
    faqs: [
      { q: 'How is migraine different from a bad headache?', a: 'Migraine typically involves throbbing, one-sided pain with nausea and light/sound sensitivity, often lasting hours to days — more disruptive than a typical tension headache.' },
      { q: 'What should I do if this is the worst headache of my life?', a: 'Treat that as an emergency — call 112/999 or attend your nearest Emergency Department rather than booking online.' },
      { q: 'Can you prescribe preventive migraine treatment?', a: 'Yes, where appropriate — your GP will discuss options based on how frequently you get migraines.' },
      { q: 'Is it safe to treat migraine while pregnant?', a: 'Some migraine treatments aren’t suitable in pregnancy — tell your GP if this applies so they can advise safely.' },
    ],
  },

  hypothyroidism: {
    about: [
      "Hypothyroidism means the thyroid gland doesn't produce enough thyroid hormone, slowing the body's metabolism. Common symptoms include tiredness, weight gain, feeling cold, and low mood, though many people on stable treatment have no symptoms at all.",
      "Treatment is a daily hormone replacement tablet, with the dose fine-tuned based on regular blood tests (TSH) — usually checked every 6-12 months once stable, or sooner after any dose change.",
      "Online review suits an existing, formally diagnosed hypothyroidism with recent bloods on file, for prescription renewal. New symptoms, missing recent blood tests, or a first-time suspected diagnosis need a fuller in-person or video assessment."
    ],
    faqs: [
      { q: 'How recent do my blood tests need to be?', a: 'Ideally within the last 6 months — your GP needs current TSH results to safely confirm your dose is still right.' },
      { q: 'Can you change my thyroid medication dose online?', a: 'Minor, evidence-based adjustments based on recent bloods are sometimes possible — your GP will advise based on your results and symptoms.' },
      { q: 'What if I’ve never been formally diagnosed?', a: 'This service is for reviewing an existing diagnosis — a first-time suspected thyroid problem needs its own assessment and blood tests first.' },
      { q: 'Do I need to take my tablet a certain way?', a: 'Most thyroid hormone tablets work best taken consistently, often on an empty stomach — your GP or pharmacist can confirm specifics for your medication.' },
    ],
  },

  stop_smoking: {
    about: [
      "Quitting smoking is one of the single biggest things you can do for your long-term health, and it's normal to need more than one attempt — most successful quitters tried several times first.",
      "Options include nicotine replacement therapy (patches, gum, etc.), prescription medications that reduce cravings, and behavioural support — often most effective combined rather than used alone.",
      "Online review can help you access appropriate medication and a plan suited to your smoking history and any past quit attempts, alongside advice on support services like the HSE's QUIT programme."
    ],
    faqs: [
      { q: 'What stop-smoking medications can you prescribe?', a: 'Your GP will discuss options suited to your smoking history and health — not every medication suits every patient.' },
      { q: 'Do I need to set a quit date first?', a: 'It helps to have one in mind, but your GP can talk through timing with you as part of the consultation.' },
      { q: 'Can I combine nicotine replacement with prescription medication?', a: 'Sometimes, depending on which options — your GP will advise what’s safe and appropriate for you.' },
      { q: 'What if I’ve tried before and it didn’t work?', a: 'That’s very common — tell your GP what you tried before so they can suggest a different approach this time.' },
    ],
  },

  hay_fever: {
    about: [
      "Hay fever (allergic rhinitis) is an allergic reaction to pollen causing sneezing, a runny or blocked nose, and itchy or watery eyes, typically worse in spring and summer, though some people react to mould or dust year-round.",
      "Treatment usually starts with antihistamines and a steroid nasal spray, used correctly and consistently — a large part of why symptoms don't improve is often technique or timing rather than the medication itself.",
      "Online review suits ongoing hay fever symptoms not settling with over-the-counter treatment. Symptoms with wheeze or breathlessness, or a first-time need for a formal diagnosis, may need a fuller assessment."
    ],
    faqs: [
      { q: 'I’ve tried antihistamines from the pharmacy — why book a GP?', a: 'A GP can prescribe stronger or different options, and check you’re using nasal sprays correctly, which is a common reason OTC treatment underperforms.' },
      { q: 'Can hay fever affect my asthma?', a: 'Yes, allergic rhinitis and asthma are often linked — mention any wheeze or breathlessness in your booking.' },
      { q: 'Is this suitable for allergies other than pollen?', a: 'The same general approach often applies to dust or pet allergies too — mention your specific triggers in your booking.' },
      { q: 'How long should I take treatment for?', a: 'Your GP will advise based on your pattern — seasonal treatment for pollen allergy, or longer-term for year-round triggers.' },
    ],
  },

  cold_sores: {
    about: [
      "Cold sores are small, painful blisters around the mouth caused by the herpes simplex virus, which stays dormant in the body between outbreaks and can be triggered by illness, stress, sun exposure, or tiredness.",
      "Antiviral cream or tablets work best started at the very first tingling sensation, before the blister appears — for people who get frequent outbreaks, a GP can also discuss preventive treatment.",
      "Online review suits recurring cold sores in someone who recognises their own pattern. A first-ever outbreak, or sores that are unusually severe, widespread, or not healing, are better assessed in person."
    ],
    faqs: [
      { q: 'When should I start treatment?', a: 'As early as possible — ideally at the first tingling or itching sensation, before the blister fully forms.' },
      { q: 'Can you prescribe something to prevent outbreaks, not just treat them?', a: 'For frequent recurrences, your GP can discuss preventive (suppressive) treatment options with you.' },
      { q: 'Is this the same as a canker sore (mouth ulcer)?', a: 'No — cold sores are viral blisters on the outer lip/skin; mouth ulcers are inside the mouth and have different causes.' },
      { q: 'Are cold sores contagious?', a: 'Yes, especially when a blister is present — avoid close contact and sharing items like cups or lip products during an outbreak.' },
    ],
  },

  eczema_psoriasis: {
    about: [
      "Eczema causes dry, itchy, inflamed skin and often flares with irritants, stress, or weather changes. Psoriasis causes red, scaly patches from faster-than-normal skin cell turnover — both are long-term conditions managed rather than cured, with flares and calmer periods.",
      "Treatment is usually stepped: regular moisturising (emollients) as the foundation, topical steroids or other creams for flares, with stronger options for more extensive or resistant cases.",
      "Online review suits a diagnosed flare-up needing treatment or a repeat prescription. Widespread, rapidly worsening, or infected-looking skin (increasing redness, warmth, pus) needs an in-person look."
    ],
    faqs: [
      { q: 'How often should I moisturise?', a: 'Most eczema-prone skin benefits from emollient use at least twice daily, even between flares — consistency matters more than the specific product.' },
      { q: 'Can I get a repeat of my steroid cream online?', a: 'Yes, for an established, diagnosed flare pattern — your GP will check nothing has changed since your last prescription.' },
      { q: 'How do I know if my skin is infected?', a: 'Signs include increasing redness, warmth, swelling, pus, or fever — these need an in-person assessment rather than a written request.' },
      { q: 'Is psoriasis contagious?', a: 'No — psoriasis is not infectious; it’s related to how skin cells regenerate, not to contact with others.' },
    ],
  },

  contraception: {
    about: [
      "Hormonal contraception (the pill, patch, or ring) is a safe, effective, and widely used way to prevent pregnancy for most women, with several types available depending on your health history and preference.",
      "The right method depends on individual factors — some options aren't suitable with certain migraine types, blood clot history, smoking status, or other conditions, which is exactly what the safety questionnaire is designed to check before a written renewal.",
      "Online review suits continuing a contraceptive method you're already using and tolerating well. Starting a new method for the first time, or significant side effects, are often better discussed over video."
    ],
    faqs: [
      { q: 'Can I switch to a different pill online?', a: 'Continuing your current method is the most straightforward request — switching methods is often better discussed over video so your GP can talk through the options.' },
      { q: 'What if I’m having side effects?', a: 'Mention this in your booking — significant side effects may mean a video consultation is more appropriate than a written renewal.' },
      { q: 'Does this cover emergency contraception?', a: 'No — emergency contraception is time-sensitive; contact a pharmacy directly or book a same-day video consultation.' },
      { q: 'Do I need a smear test before renewing?', a: 'Not for a routine contraception renewal, but keep your cervical screening up to date separately through the National Screening Service.' },
    ],
  },

  period_delay: {
    about: [
      "Period delay medication postpones your period by a few days, typically for an event, trip, or exam — it works by continuing the hormone level that normally drops before a period starts.",
      "It needs to be started a few days before your period is due, so timing your booking matters — check the medication's instructions or ask your GP how many days in advance to start.",
      "It's not a form of contraception and doesn't replace your regular contraceptive method if you use one — mention your current contraception (if any) in your booking so your GP can advise on interactions."
    ],
    faqs: [
      { q: 'How many days before my period should I start?', a: 'This depends on the specific medication — your GP will confirm timing, but generally it needs to start a few days before your period is due.' },
      { q: 'Does this work as contraception too?', a: 'No — period delay medication does not prevent pregnancy; keep using your regular contraception if applicable.' },
      { q: 'Can I use this if I’m already on the contraceptive pill?', a: 'Sometimes a simpler adjustment to your existing pill regimen achieves the same result — mention this in your booking.' },
      { q: 'Is it safe to delay my period regularly?', a: 'Occasional use for specific events is generally fine, but frequent use should be discussed with your GP.' },
    ],
  },

  uti: {
    about: [
      "A urinary tract infection (UTI), often called cystitis when it affects the bladder, causes a burning sensation when urinating, needing to go more often or urgently, and sometimes lower abdominal discomfort or cloudy, strong-smelling urine.",
      "Most straightforward UTIs are treated with a short course of antibiotics, and symptoms typically start improving within a day or two of starting treatment.",
      "Online review suits classic, uncomplicated UTI symptoms in someone who recognises the pattern. Fever, back/flank pain, vomiting, blood in the urine, or symptoms in men, pregnancy, or with a catheter need a closer in-person look, since these can indicate a more serious kidney infection or a different cause."
    ],
    faqs: [
      { q: 'How quickly will I feel better?', a: 'Most people notice improvement within 24-48 hours of starting antibiotics — if not, or if you feel worse, contact your GP.' },
      { q: 'What if I have back pain or a fever too?', a: 'These can suggest the infection has reached the kidneys, which needs an in-person or urgent assessment rather than a written request.' },
      { q: 'Can men use this service for UTI symptoms?', a: 'UTIs in men are less common and often need a fuller assessment — the questionnaire will route you to a video consultation.' },
      { q: 'How can I reduce the chance of getting another UTI?', a: 'Staying well hydrated, urinating after sex, and good hygiene are commonly recommended — ask your GP if you get them frequently, as further investigation may help.' },
    ],
  },

  travel_health: {
    about: [
      "Pre-travel health advice covers destination-specific vaccine recommendations, malaria prevention if relevant, and general advice for staying well abroad — ideally arranged 4-6 weeks before you travel, since some vaccines need time to take effect or require more than one dose.",
      "Requirements vary hugely by destination, itinerary (city vs. rural/adventure travel), and your own health history and existing vaccinations, so advice is tailored rather than generic.",
      "Online review suits general advice and routine travel vaccination guidance. Trips requiring a Yellow Fever certificate, or complex itineraries, are sometimes better suited to a specialist travel clinic with certification authority."
    ],
    faqs: [
      { q: 'How far in advance should I book?', a: 'Ideally 4-6 weeks before travel, to leave time for any vaccine course and for it to become effective.' },
      { q: 'Can you administer vaccines through this service?', a: 'This service covers advice and prescriptions where appropriate — ask about arrangements for administering any recommended vaccines.' },
      { q: 'Do I need malaria tablets for my trip?', a: 'This depends on your specific destination and itinerary — your GP will advise based on where exactly you’re going.' },
      { q: 'What if my destination requires a Yellow Fever certificate?', a: 'This typically needs a specialist, registered Yellow Fever centre — the questionnaire will flag this so you can arrange it separately.' },
    ],
  },
};
