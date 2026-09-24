# Marketing dashboard (weekly, Monday, 20 minutes)

Build in **Looker Studio** (free) with GA4 + Search Console + Google Ads connectors; paste Meta/TikTok/email numbers
into a sheet tab until a connector is worth paying for. True booking totals come from the **admin dashboard →
Analytics** (bookings don't depend on cookie consent).

| Section | Metric | Source | Why |
|---|---|---|---|
| **Awareness** | Reach, impressions | Meta, TikTok, LinkedIn, YouTube | Are we being seen? |
| | Website users & sessions | GA4 | |
| | Branded searches ("gp4u") — impressions/clicks | Search Console | Best proxy for brand growth |
| **Acquisition** | Sessions by source/medium, landing page | GA4 (UTMs) | Which channels bring people |
| | Spend, CPC, CTR | Google Ads, Meta, TikTok | |
| | Cost per completed booking (by channel) | Spend ÷ GA4 `online_booking_confirmed` (attributed) | The number that decides budget |
| **Conversion** | `online_booking_click` → `start` → `checkout` → `confirmed` | GA4 funnel | Where people drop off |
| | Completed bookings (true total) | Admin → Analytics | Consent-independent |
| | Conversion rate (confirmed ÷ sessions on `/online-gp/`) | GA4 | |
| **Retention** | Returning patients %, bookings per patient | Admin → Analytics (new vs returning) | Never exported to ad platforms |
| | Returning website users | GA4 | |
| **Social** | Saves, shares, comments, profile visits, link clicks, video views & watch-through | Platform insights | Quality signals — **not** follower count |
| **Email** | List size (clinic/news), clicks, unsubscribes | Email tool + admin signups count | |
| **Reputation** (Phase 3) | Reviews count, average, response time | GBP, Facebook | |
| **Local** (Phase 2–3) | Clinic sign-ups, Kildare audience share, GBP calls/directions | Admin, Meta, GBP | |

**Decisions each week:** 1 thing to stop, 1 to do more of, 1 test to start. Keep a one-line log.
