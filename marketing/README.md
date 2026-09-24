# GP4U marketing

**One tap. Real care.** — Online GP care from wherever you are in Ireland.
Clinic line (Phase 2–3 only): **GP care when you need it.**

This folder is the working marketing system for GP4U: strategy, copy, calendars, scripts, ad builds, email, tracking and
the Newbridge clinic launch kit. Everything here is written for the **current phase** unless it says otherwise.

## Where we are

| Phase | What | Status |
|---|---|---|
| **1 — Now** | Online GP launch: awareness, trust, bookings | **Active** |
| **2 — Anticipation** | "Something new is coming to Newbridge" — no address, no opening date until confirmed | Ready to start |
| **3 — Clinic launch** | Address, Google Business Profile, local SEO, launch campaign, PR, community | **Locked** until the owner says *"The clinic is ready to launch."* |

## Three rules that override everything else

1. **Never publish the clinic address** — not on the website, social, ads, emails, directories, photos (street signs,
   shopfronts, Eircode in shot) or metadata — until the owner explicitly approves it. Say *"our upcoming Newbridge
   clinic"* or *"our new walk-in GP clinic in Newbridge, Co. Kildare"*.
2. **Never market the clinic as open.** No hours, no "walk in today", no opening date until confirmed.
3. **Nothing fake.** No invented doctors, patients, testimonials, reviews, statistics, awards, outcomes or photos.
   All medical content gets clinician review before it goes out. See [compliance/](compliance/).

## Map

| Folder | What's in it |
|---|---|
| [strategy/](strategy/) | **[Master strategy](strategy/GP4U-marketing-strategy.md)** (all 20 sections incl. personas, messaging, competitors, budgets, 12-month roadmap), [90-day plan](strategy/90-day-plan.md), [conversion funnel](strategy/conversion-funnel.md) |
| [brand/](brand/) | Brand guidelines (voice, colours, type, logo), photography brief |
| [social/](social/) | Profile copy per platform, setup checklist, content pillars, **90-day calendar (CSV)**, **first 30 posts**, design templates |
| [video/](video/) | 36 short-form concepts, reusable 15/30/45/60-second scripts, first scripts ready to film |
| [google-ads/](google-ads/) | Campaign structure, keywords, ads (CSV), negatives, assets |
| [meta-ads/](meta-ads/) | Awareness / consideration / conversion / retargeting builds; TikTok ads |
| [email/](email/) | GDPR rules, 5-email welcome sequence (HTML), clinic-opening email |
| [content/](content/) | 6-month content plan with briefs, clinical review workflow |
| [clinic-launch/](clinic-launch/) | Phase 2 teaser plan, Phase 3 launch campaign, website switch-on steps, GBP checklist, local outreach, PR |
| [analytics/](analytics/) | Tracking plan (what the site already measures), UTM framework + link builder, campaign naming, dashboard |
| [compliance/](compliance/) | Pre-publish checklist, reviews/testimonials/referrals policy, AI content rules |

## What is already built into the website

- Clinic **"opening soon" mode** — one switch in *Admin → Website settings → Clinic details*. See
  [clinic-launch/website-launch-steps.md](clinic-launch/website-launch-steps.md).
- **"Be the first to know" email sign-up** (clinic opening), with consent wording, unsubscribe links and a CSV export
  at `/api/admin/signups?format=csv` (admin login needed).
- **Consent-first measurement**: add `GA4_MEASUREMENT_ID`, `META_PIXEL_ID`, `TIKTOK_PIXEL_ID` to the server settings and a
  cookie banner appears; nothing loads until a visitor agrees, and ad pixels never run on condition, booking or account
  pages. See [analytics/tracking-plan.md](analytics/tracking-plan.md).
