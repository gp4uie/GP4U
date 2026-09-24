/*
 * The built-in FAQ (question/answer pairs, grouped). One source for the generated pages and for the admin FAQ editor.
 * Answers are simple HTML (links, bold). {{hours}} is replaced on the page with the current walk-in opening hours.
 */
const FAQ = [
  {
    "id": "online",
    "title": "Online GP",
    "items": [
      [
        "What is an online GP consultation?",
        "A consultation with a GP by video or phone instead of at the clinic. You book a time online, pay securely, and join from your phone, tablet or computer."
      ],
      [
        "Can I see a GP online in Ireland?",
        "Yes. You can book a video or phone consultation with one of our Irish-registered GPs from anywhere in Ireland. Choose <a href=\"/book.html\">Book Online</a>, pick a service and a time that suits you."
      ],
      [
        "How do I book an online GP consultation?",
        "Choose <a href=\"/book.html\">Book Online</a>, pick a service, tell us briefly what's going on, choose a time and pay by card. You'll get a confirmation with a private link to your consultation."
      ],
      [
        "What happens during an online consultation?",
        "At your appointment time you join a private video or phone call using the link on your confirmation page. Your GP will talk through what's going on, ask the questions they need to, and advise on next steps. Where clinically appropriate that may include a prescription, a certificate, a letter or a referral — or a recommendation to be seen in person."
      ],
      [
        "What do I need for a video consultation?",
        "A phone, tablet or computer with a camera and microphone, a stable internet connection, and somewhere private. For a phone consultation you just need your phone."
      ],
      [
        "Is an online consultation right for every problem?",
        "No. Some problems need to be examined in person. If your GP thinks you need an in-person examination they will tell you, and you can be seen at our walk-in clinic."
      ],
      [
        "Should I see a GP online or at the walk-in clinic?",
        "Online consultations suit advice, repeat prescriptions, certificates and follow-ups, and you can have one from anywhere in Ireland. If your problem needs to be examined — a sore ear, a rash that needs a closer look, an injury — come to our <a href=\"/walk-in-gp-newbridge/\">walk-in clinic in Newbridge</a> instead. If you're unsure, the walk-in clinic is the safer choice."
      ]
    ]
  },
  {
    "id": "walk-in",
    "title": "Walk-in clinic",
    "items": [
      [
        "Where is the GP4U walk-in clinic?",
        "Our walk-in clinic is in Newbridge, Co. Kildare. Opening hours and how to reach us are on our <a href=\"/walk-in-gp-newbridge/\">walk-in clinic page</a> and <a href=\"/contact/\">contact page</a>."
      ],
      [
        "Do I need an appointment?",
        "No appointment is required. You can simply walk in during opening hours. Checking in online lets us know you're on your way and helps us prepare for your visit, but it does not reserve a specific appointment time. You can <a href=\"/walk-in-gp-newbridge/#book-in\">check in online</a> if you'd like to."
      ],
      [
        "How does the walk-in clinic work?",
        "Walk in during opening hours, check in at reception, and see a GP. If you'd like, you can <a href=\"/walk-in-gp-newbridge/#book-in\">check in online</a> first so we know you're on your way. Waiting times vary depending on how busy we are."
      ],
      [
        "When is the walk-in clinic open?",
        "We're open {{hours}}. Hours may differ on public holidays."
      ],
      [
        "How long will I wait?",
        "Waiting times vary depending on how busy we are. Checking in online lets us know you're coming, but it doesn't reserve a set appointment time."
      ],
      [
        "What should I bring to the clinic?",
        "A list of any medicines you take, and anything relevant such as recent test results or letters from other doctors."
      ]
    ]
  },
  {
    "id": "appointments",
    "title": "Appointments & registration",
    "items": [
      [
        "How do I register as a family practice patient?",
        "Complete our short <a href=\"/family-gp/\">registration form</a>. Our team will review your details and get in touch, and you'll receive a confirmation email with a reference number."
      ],
      [
        "Can I register my family?",
        "Yes. The registration form lets you add your partner, children and other family members — up to eight people in one go."
      ],
      [
        "Do I need to register to use the walk-in clinic?",
        "No. Anyone can use the walk-in clinic without registering. Registering with our <a href=\"/family-gp/\">family practice</a> is for ongoing care — for you and your family, including reviews of long-term conditions and follow-up — rather than one-off visits."
      ]
    ]
  },
  {
    "id": "prescriptions",
    "title": "Prescriptions",
    "items": [
      [
        "Can I get a prescription?",
        "Yes, where your GP considers it clinically appropriate. You can request a repeat prescription online, or speak to your GP during a consultation. For online consultations, prescriptions are sent to the pharmacy you name."
      ],
      [
        "How do repeat prescriptions work online?",
        "Choose your condition on the <a href=\"/online-gp/repeat-prescription/\">repeat prescription page</a>, answer a few safety questions and pick a time. If your GP approves the request, they email the prescription directly to the pharmacy you name."
      ],
      [
        "Will I always be given a prescription?",
        "No. A prescription is only issued where your GP considers it clinically appropriate and safe for you."
      ]
    ]
  },
  {
    "id": "certificates",
    "title": "Medical certificates",
    "items": [
      [
        "Can I get a medical certificate?",
        "Yes, where your GP considers it appropriate. You can request a sick certificate through our online booking, or ask your GP during a walk-in visit. Your GP can also write medical letters where clinically appropriate."
      ],
      [
        "What do I need for a sick certificate?",
        "Your name, date of birth and address as they should appear on the certificate. Your GP will ask about your illness and the dates involved."
      ]
    ]
  },
  {
    "id": "referrals",
    "title": "Referrals",
    "items": [
      [
        "Can you refer me to a specialist?",
        "Where your GP considers a referral appropriate, they can write a referral letter after assessing you."
      ]
    ]
  },
  {
    "id": "results",
    "title": "Test results",
    "items": [
      [
        "How will I get my test results?",
        "If your GP arranges tests, they will explain at your consultation how you'll receive the results. If you're unsure, please <a href=\"/contact/\">contact us</a>."
      ]
    ]
  },
  {
    "id": "payments",
    "title": "Payments",
    "items": [
      [
        "How much does a consultation cost?",
        "Online consultation prices are shown on our <a href=\"/fees/\">Fees page</a> and again before you pay. For walk-in and family practice fees, please <a href=\"/contact/\">contact us</a> or ask at reception."
      ],
      [
        "How do I pay for an online consultation?",
        "By card when you book. Payment is processed securely by Stripe — GP4U never sees or stores your card details."
      ]
    ]
  },
  {
    "id": "children",
    "title": "Children",
    "items": [
      [
        "Do you see children?",
        "Our family practice cares for children as well as adults, and children can be brought to the walk-in clinic. For an online consultation for a child, please <a href=\"/contact/\">contact us</a> first."
      ]
    ]
  },
  {
    "id": "privacy",
    "title": "Privacy",
    "items": [
      [
        "Is my health information private?",
        "Yes. Your health information is encrypted and handled in line with GDPR, and access is restricted to authorised staff. Read our <a href=\"/privacy/\">Privacy &amp; GDPR Notice</a> for full details."
      ]
    ]
  },
  {
    "id": "cancellations",
    "title": "Cancellations",
    "items": [
      [
        "What if I need to cancel or change my booking?",
        "Please <a href=\"/contact/\">contact us</a> as soon as you can and we'll help you."
      ]
    ]
  },
  {
    "id": "emergencies",
    "title": "Emergencies",
    "items": [
      [
        "What should I do in an emergency?",
        "GP4U is not an emergency service. In an emergency call <strong>112</strong> or <strong>999</strong>, or go to your nearest Emergency Department — for example for chest pain, severe difficulty breathing, signs of a stroke, heavy bleeding or loss of consciousness."
      ],
      [
        "What if my symptoms get worse after I book?",
        "If you feel worse or unsafe at any point, don't wait for your appointment — call 112 or 999, or go to your nearest Emergency Department."
      ]
    ]
  }
];

module.exports = { FAQ };
