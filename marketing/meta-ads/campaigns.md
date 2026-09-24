# Meta ads (Facebook + Instagram) — Phase 1

**Policy guardrails (Meta advertising standards + GP4U rules):**
- Never imply you know someone's health ("Suffering from UTIs?", "Your acne…"). Talk about the service, or use
  general, third-person education.
- No targeting by health conditions or health interests; no custom audiences built from condition pages (the website
  never loads the pixel there anyway); no uploading patient lists — ever.
- No named prescription medicines, no before/after, no outcome promises, no fear.
- Special ad category: not normally required for healthcare, but check Meta's current rules for health & wellness
  advertisers in the EU when setting up — some optimisation/audience options may be restricted. **REVIEW at setup.**
- Emergency line in any symptom-related ad: "Not for emergencies — call 112 or 999."

## Audiences
- **Prospecting:** Ireland, 25–65 (adjust after data), all genders, Advantage+ audience with *no* detailed targeting, or
  broad with location only. Exclude employees.
- **Phase 2/3 local:** Newbridge + ~15 km radius, 18+ (clinic teaser and launch only).
- **Retargeting:** website visitors last 30 days on general pages (pixel only fires there) · Instagram/Facebook profile
  engagers 90 days · video viewers ≥ 50% 30 days. **Exclude** people who fired `online_booking_confirmed` in the last 30 days.

## Campaigns

| Campaign | Objective | Budget share | Audience | Creative | CTA | Destination |
|---|---|---|---|---|---|---|
| `META_Awareness_OnlineGP` | Awareness (ThruPlay / reach) | 30% | Ireland broad | A1–A3 video | Learn more | `/online-gp/` |
| `META_Consideration_HowItWorks` | Traffic (landing page views) | 25% | Ireland broad + video viewers | C1–C3 carousel / video | Learn more | `/online-gp/` |
| `META_Conversion_Book` | Sales/Leads → conversion `online_booking_click` then `online_booking_confirmed`* | 30% | Broad + engagers | B1–B3 | Book now | `/online-gp/` |
| `META_Retargeting_Visitors` | Traffic or conversions | 15% | Retargeting pool | R1–R3 | Book now | `/online-gp/` or `/fees/` |
| `META_Phase2_Newbridge` (owner go-ahead) | Reach / lead (email sign-up) | from Phase 2 | Newbridge radius | clinic teasers | Sign up | `/walk-in-gp-newbridge/#clinic-news` |

*`online_booking_confirmed` fires on the confirmation page for GA4 only; for Meta, optimise on `online_booking_click`
(general pages) or use GA4-imported conversions in reporting. Server-side conversions (CAPI) are **not** set up — they
would need a legal/DPO review before any booking data is shared.

## Creative & copy

**A1 — "One tap. Real care." (video 20–30 s, GP to camera, V01 cut-down)**
- Primary text: *Getting to a GP shouldn't be the hard part. With GP4U you can see an Irish-registered GP by video or phone, 7 days a week, from wherever you are in Ireland.*
- Headline: *Online GP care across Ireland* · Description: *Price shown before you book*

**A2 — "What happens in an online consultation" (V02)** · Primary: *Never seen a GP online? Here's exactly what happens — from booking to your consultation.* · Headline: *See how GP4U works*

**A3 — Brand still (template `announcement`)** · Primary: *Real doctors. Real care. Made easier.* · Headline: *One tap. Real care.*

**C1 — Carousel "4 steps"** (post #4) · Primary: *Choose a service, tell us what's going on, pick a time, speak to your GP.* · Headline: *Online GP in 4 steps*

**C2 — "What can an online GP help with?"** (post #6, general list, last card: when to be seen in person)

**C3 — FAQ video (V30)**

**B1 — "Need a GP this week?"** · Primary: *See an Irish-registered GP online by video or phone. Pick a time that suits you — the price is shown before you book.* · Headline: *Book an online GP* · CTA: Book now

**B2 — "Weekend" (post #21)** · Primary: *Online GP consultations 7 days a week.* · Headline: *Book online*

**B3 — "No waiting room" (post #10)**

**R1 — "Still thinking about it?"** · Primary: *Questions about seeing a GP online? Our FAQs cover prices, prescriptions, privacy and what to expect.* · Headline: *GP4U FAQs* → `/faq/`

**R2 — Prices** · Primary: *Every online consultation price is on our website — you'll see it again before you pay.* → `/fees/`

**R3 — Meet the GP (post #5)** — only with a real GP.

**Every ad URL carries UTMs:** `utm_source=facebook|instagram&utm_medium=paid_social&utm_campaign=online_gp_launch&utm_content=a1_video_gp_intro`
(see [../analytics/utm-framework.md](../analytics/utm-framework.md)).

## Rules of thumb
- Launch 2–3 ads per ad set; let each spend ~3× the target cost per booking before judging.
- Refresh creative every 3–4 weeks or when frequency > 3 on prospecting.
- Judge on cost per booking in GA4 (UTM-attributed), not on likes.
