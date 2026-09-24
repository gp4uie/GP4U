# Conversion funnel — journey, friction and website recommendations

```
SOCIAL / SEARCH / EMAIL → WEBSITE (/online-gp/) → SERVICE INFO (fees, what we treat) → TRUST (doctors, privacy, FAQs)
→ BOOKING (/book.html: service → questions → time → pay) → CONSULTATION → FOLLOW-UP (messages, documents)
→ REPEAT USE → (later) REFERRAL
```

| Stage | Likely friction | Status / recommendation |
|---|---|---|
| Social → website | Generic links; landing on homepage | ✅ Bio/ad links go to `/online-gp/` with UTMs (utm-framework) |
| Website first view | "Is this real / Irish / for me?" | ✅ Hero: slogan + "Online GP care from wherever you are in Ireland" + Irish-registered + 7 days. **To do:** add named doctors with photos + Medical Council numbers on About and a small "Your GPs" strip on `/online-gp/` (needs real details — owner) |
| Clinic confusion | Visitors think the clinic is open | ✅ Fixed: pre-launch mode, Book a GP goes straight to online booking |
| Service info | "How much? What can you help with?" | ✅ Prices live from the catalogue; condition pages; FAQ. **Consider:** a single "From €25" price line near the hero (true today: repeat Rx/condition reviews €25; phone €35; video €40 — confirm) |
| Trust | No reviews yet; stock photos | Real photography (brief); reviews once patients exist; press mentions when earned; privacy promise already on site |
| Booking | 4 steps, questionnaire length, account questions | ✅ Progress bar and live summary exist. **Measure** drop-off per step in GA4 (`start` → `checkout`); **consider** adding step events (`booking_step_2/3/4`) — small change in `book.js` |
| Payment | Stripe redirect trust | Keep "processed securely by Stripe" copy; test Apple/Google Pay in Stripe settings (owner) |
| Consultation | Tech worries (video) | "What to have ready" (V09) sent with confirmation email — **add** to the confirmation email template (Dev) |
| Follow-up | Patients don't know what's next | ✅ Messages, documents, portal. **Add** a post-consultation email with how to reach us and (later) a review request |
| Repeat use | Forgetting GP4U next time | Opt-in newsletter only; encourage saving gp4u.ie; portal login; *no* marketing to patients who haven't opted in |
| Referral | — | Non-financial share link (policy) |

**Emergency safety** stays visible at every stage (top bar, footer, booking page) — never removed to "improve conversion".
