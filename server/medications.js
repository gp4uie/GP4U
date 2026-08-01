// Starter medication list for the prescription form's search/autocomplete.
//
// IMPORTANT: this is a convenience typing-aid list only — common Irish general
// practice medications with typical strengths. It is NOT the Irish Medicines
// Formulary, the BNF, or the HSE PCRS reimbursement list, and has not been
// clinically verified or kept in sync with any of those. Always apply your own
// clinical judgement on dose, interactions, and current licensing/availability
// before prescribing — this list exists purely to reduce typing, not to replace it.
//
// Add, edit, or remove entries here freely; each is just { name, strengths }.
const MEDICATIONS = [
  // Analgesics / antipyretics
  { name: 'Paracetamol', strengths: ['500mg', '1g'] },
  { name: 'Ibuprofen', strengths: ['200mg', '400mg'] },
  { name: 'Codeine Phosphate', strengths: ['15mg', '30mg'] },
  { name: 'Co-codamol', strengths: ['8mg/500mg', '30mg/500mg'] },
  { name: 'Naproxen', strengths: ['250mg', '500mg'] },
  { name: 'Diclofenac Sodium', strengths: ['50mg'] },

  // Antibiotics — common GP indications (UTI, respiratory, skin)
  { name: 'Amoxicillin', strengths: ['250mg', '500mg', '125mg/5ml'] },
  { name: 'Co-amoxiclav', strengths: ['375mg', '625mg'] },
  { name: 'Trimethoprim', strengths: ['200mg'] },
  { name: 'Nitrofurantoin', strengths: ['50mg', '100mg'] },
  { name: 'Flucloxacillin', strengths: ['250mg', '500mg'] },
  { name: 'Clarithromycin', strengths: ['250mg', '500mg'] },
  { name: 'Doxycycline', strengths: ['100mg'] },
  { name: 'Penicillin V (Phenoxymethylpenicillin)', strengths: ['250mg', '500mg'] },
  { name: 'Metronidazole', strengths: ['200mg', '400mg'] },
  { name: 'Cefalexin', strengths: ['250mg', '500mg'] },

  // Antihistamines / allergy
  { name: 'Cetirizine', strengths: ['10mg'] },
  { name: 'Loratadine', strengths: ['10mg'] },
  { name: 'Fexofenadine', strengths: ['120mg', '180mg'] },
  { name: 'Chlorphenamine', strengths: ['4mg'] },

  // GI / reflux
  { name: 'Omeprazole', strengths: ['10mg', '20mg', '40mg'] },
  { name: 'Lansoprazole', strengths: ['15mg', '30mg'] },
  { name: 'Ranitidine', strengths: ['150mg'] },
  { name: 'Domperidone', strengths: ['10mg'] },
  { name: 'Loperamide', strengths: ['2mg'] },

  // Cardiovascular / chronic disease repeats
  { name: 'Atorvastatin', strengths: ['10mg', '20mg', '40mg', '80mg'] },
  { name: 'Simvastatin', strengths: ['10mg', '20mg', '40mg'] },
  { name: 'Ramipril', strengths: ['2.5mg', '5mg', '10mg'] },
  { name: 'Amlodipine', strengths: ['5mg', '10mg'] },
  { name: 'Bisoprolol', strengths: ['2.5mg', '5mg', '10mg'] },
  { name: 'Losartan', strengths: ['25mg', '50mg', '100mg'] },
  { name: 'Bendroflumethiazide', strengths: ['2.5mg'] },
  { name: 'Aspirin (low dose)', strengths: ['75mg'] },
  { name: 'Clopidogrel', strengths: ['75mg'] },

  // Diabetes / endocrine
  { name: 'Metformin', strengths: ['500mg', '850mg', '1g'] },
  { name: 'Gliclazide', strengths: ['40mg', '80mg'] },
  { name: 'Levothyroxine', strengths: ['25mcg', '50mcg', '100mcg'] },

  // Respiratory / inhalers
  { name: 'Salbutamol Inhaler', strengths: ['100mcg/dose'] },
  { name: 'Beclometasone Inhaler', strengths: ['50mcg/dose', '100mcg/dose'] },
  { name: 'Montelukast', strengths: ['10mg'] },
  { name: 'Prednisolone', strengths: ['5mg'] },

  // Mental health
  { name: 'Sertraline', strengths: ['50mg', '100mg'] },
  { name: 'Citalopram', strengths: ['10mg', '20mg'] },
  { name: 'Escitalopram', strengths: ['10mg', '20mg'] },
  { name: 'Mirtazapine', strengths: ['15mg', '30mg'] },
  { name: 'Diazepam', strengths: ['2mg', '5mg'] },
  { name: 'Zopiclone', strengths: ['3.75mg', '7.5mg'] },

  // Women's health / contraception
  { name: 'Combined Oral Contraceptive Pill', strengths: ['standard pack'] },
  { name: 'Progesterone-only Pill', strengths: ['standard pack'] },
  { name: 'Norethisterone', strengths: ['5mg'] },
  { name: 'Clotrimazole (vaginal)', strengths: ['500mg pessary', '1% cream', '2% cream'] },
  { name: 'Folic Acid', strengths: ['400mcg', '5mg'] },

  // Skin
  { name: 'Hydrocortisone Cream', strengths: ['1%'] },
  { name: 'Betnovate (Betamethasone) Cream', strengths: ['0.1%'] },
  { name: 'Fusidic Acid Cream', strengths: ['2%'] },
  { name: 'Clotrimazole Cream', strengths: ['1%'] },

  // Travel health
  { name: 'Doxycycline (malaria prophylaxis)', strengths: ['100mg'] },
  { name: 'Atovaquone/Proguanil (Malarone)', strengths: ['250mg/100mg'] },
  { name: 'Diamox (Acetazolamide)', strengths: ['250mg'] },
];

module.exports = { MEDICATIONS };
