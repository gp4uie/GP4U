# Google Ads — initial build (Phase 1, online GP)

**Before launch:** (1) confirm conversion tracking — import GA4 key event `online_booking_confirmed` (primary) and
`online_booking_checkout` (secondary); (2) read Google's *Healthcare and medicines* policy for Ireland — ads that promote
prescription medicines or online prescribing may need certification, so **keep ad text about GP consultations, never
about named medicines**; (3) all ads say what's true today (7 days, video or phone, Irish-registered GPs, price shown
before booking). Don't say "same day" or "24/7".

## Account settings
- Location: **Ireland — "presence: people in or regularly in"** (not "interest in").
- Language: English. Networks: **Search only** (no Display/Search partners at first).
- Bidding: start **Maximise clicks with a max CPC cap** for 2–3 weeks → switch to **Maximise conversions** once there are
  ≥ 15 conversions in 30 days → tCPA later.
- Ad schedule: all week (the service runs 7 days); review by hour after 4 weeks.
- Audiences: observation only (no health-based audiences — not allowed and not wanted).

## Campaign 1 — `IE_Search_Brand` (5–10% budget)
Ad group `Brand`: [gp4u], [gp4u ie], "gp4u online gp", "gp4u doctor". Protects the name cheaply.

## Campaign 2 — `IE_Search_OnlineGP` (70–80%)
| Ad group | Keywords (phrase "…" and exact […]) | Landing page |
|---|---|---|
| `Online_GP` | "online gp ireland", "online gp", [online gp], "gp online ireland", "online gp appointment" | `/online-gp/` |
| `Online_Doctor` | "online doctor ireland", "online doctor", "doctor online ireland", "speak to a doctor online" | `/online-gp/` |
| `Video_GP` | "video gp", "video doctor ireland", "virtual gp ireland", "gp video call" | `/online-gp/` |
| `GP_Appointment` | "gp appointment online", "book gp online", "gp appointment today" (only if availability supports it) | `/online-gp/` |

## Campaign 3 — `IE_Search_Services` (10–20%, start after week 4)
| Ad group | Keywords | Landing page | Note |
|---|---|---|---|
| `Sick_Cert` | "sick cert online", "online sick note ireland", "medical certificate online" | `/online-gp/` | Wording: "where your GP considers it appropriate" |
| `Repeat_Rx` | "repeat prescription online ireland" | `/online-gp/repeat-prescription/` | **Policy check first** |

**Not now:** condition/medicine keywords (ED, hair loss, contraception brands, antibiotics), competitor names.
**Phase 3 only:** `IE_Search_Newbridge` — "gp newbridge", "walk in doctor newbridge", "gp kildare" → `/walk-in-gp-newbridge/`, radius targeting.

## Ads (Responsive Search Ads) — see [ads.csv](ads.csv)
Pin headline 1 to a keyword-matching line; leave the rest unpinned. At least 10 headlines, 4 descriptions per ad group.

## Assets (extensions)
- **Sitelinks:** How it works (`/online-gp/`), Prices (`/fees/`), FAQs (`/faq/`), Repeat prescriptions (`/online-gp/repeat-prescription/`), About GP4U (`/about/`)
- **Callouts:** Irish-registered GPs · Video or phone · 7 days a week · Price shown before you book · Secure & private · Prescriptions to your pharmacy*
  (*"where appropriate" must be clear on the landing page — it is)
- **Structured snippet — Services:** Video consultation, Phone consultation, Sick certificates, Repeat prescriptions, Women's health, Men's health
- **Price assets:** only with the live prices from `/fees/` on the day of setup; update when prices change
- **Image assets:** website online-GP photo; later, real GP4U photos
- **No** call assets (no published phone), **no** location assets (Phase 3)

## Negative keywords — see [negative-keywords.txt](negative-keywords.txt)

## UTMs
Final URL suffix (account level):
`utm_source=google&utm_medium=cpc&utm_campaign={_campaign}&utm_content={creative}&utm_term={keyword}` — set custom
parameter `{_campaign}` per campaign (e.g. `online_gp_launch`), see [../analytics/utm-framework.md](../analytics/utm-framework.md).
Keep auto-tagging (gclid) on.

## Weekly routine (20–30 min)
Search terms → add negatives / new exact keywords · pause ads with CTR < 60% of the group average after 1,000 impressions ·
check disapprovals · compare cost per `online_booking_confirmed` by ad group · move budget to what books.
