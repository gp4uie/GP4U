# Tracking plan

## What's already built into the website (public/js/consent.js)
- **Off until configured:** set `GA4_MEASUREMENT_ID`, `META_PIXEL_ID`, `TIKTOK_PIXEL_ID` in the server's environment
  variables (Hostinger → app → Environment variables), redeploy/restart. Invalid IDs are ignored.
- **Consent first:** a banner (Reject all / Save choices / Accept all; categories *Analytics* and *Advertising
  measurement*). Nothing loads before a choice. "Cookie settings" in the footer reopens it. The privacy notice switches
  automatically to the paragraph describing these tools once IDs are set. Google Consent Mode default: ads denied.
- **Where each tool may run:**
  | Tool | Pages |
  |---|---|
  | GA4 | Home, Online GP (incl. condition pages), Newbridge clinic, Family GP, Services, Fees, About, FAQ, Contact, Privacy, Book chooser, **booking steps** (`/book.html`, address stripped of `?service=…`) and **confirmation** (address stripped of the private link) |
  | Meta Pixel, TikTok Pixel | **General pages only:** `/`, `/online-gp/`, `/walk-in-gp-newbridge/`, `/family-gp/`, `/services/`, `/fees/`, `/about/`, `/faq/`, `/contact/`, `/book/` — **never** condition pages, booking, confirmation, account, staff, print pages |
- GA4 config: Google signals **off**, ad personalisation **off**, referrer blanked.

## Events (action names only — no service, condition, price, name, email or form text)
| Event | Fires when | Source |
|---|---|---|
| `page_view` | Allowed page loads | GA4 / pixels |
| `online_booking_click` | Click on any link to `/book.html` or `/book/` | nav-toggle.js |
| `online_booking_start` | Booking page opened | consent.js |
| `online_booking_checkout` | Booking submitted, going to payment | book.js |
| `online_booking_confirmed` | Confirmation page after payment (`session_id`/`demo` present) | consent.js (GA4 only — pixels never run there) |
| `walk_in_click` | Click to the Newbridge clinic page (the "clinic CTA") | nav-toggle.js |
| `registration_click` | Click to Family GP / registration | nav-toggle.js |
| `email_signup` | Clinic/news sign-up succeeds | signup.js |
| `phone_click` / `email_click` / `directions_click` | tel:, mailto:, Get directions (Phase 3) | nav-toggle.js |

**GA4 setup:** mark `online_booking_confirmed` as a **key event** (primary conversion), `online_booking_checkout` and
`email_signup` as secondary. Build a funnel exploration: click → start → checkout → confirmed. Set data retention to 14
months, IP-based location only at country/city. Link Search Console. Do **not** link Google Signals.

**Google Ads:** import `online_booking_confirmed` from GA4 as the primary conversion.

**Meta / TikTok:** optimise on `PageView` of `/online-gp/` + `online_booking_click` (general pages). No Conversions API
until a DPO/legal review — it would mean sending booking data from the server.

## Known limits
- `online_booking_confirmed` counts page loads with a payment/demo marker; a patient reopening that exact link could
  double-count — acceptable; reconcile monthly against real bookings in the admin Analytics tab.
- People who reject cookies aren't counted — use admin bookings for the true totals and GA4 for ratios and sources.
- Search Console needs no cookies — use it for organic search performance.

## Privacy review items (DPO / solicitor)
- GA4 on condition pages records that a page about a condition was viewed (no identity). Acceptable for analytics?
  Alternative: generalise those paths in GA4 (small code change in `consent.js`).
- Cookie banner wording and categories.
- Processor list in the privacy notice (Google, Meta, TikTok, email provider) once enabled.
