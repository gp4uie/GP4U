# Website: switching from "opening soon" to "open"

The website is built for both states. While the switch is **off** (now): "opening soon" everywhere; no clinic hours,
open/closed badge, check-in form, street address, map, directions or clinic structured data; the server refuses
walk-in check-ins; Google is told only about the online service.

## On launch day (owner, ~15 minutes)
1. Admin login → **Website settings → Clinic details**: fill in street address, Eircode, phone; check opening hours
   and closures; **Fees & lead GP**: walk-in fees and lead GP details. Save. *(Nothing shows publicly yet.)*
2. Tick **"The Newbridge clinic is open to patients."** → Save.
3. Within ~10 seconds the site flips: open-clinic copy, hours, address, map, directions, check-in form, clinic-open page
   titles/descriptions (`whenOpen` in `server/pages.js`), MedicalClinic schema with hours/address/phone, clinic social image.

## Developer follow-ups (same day)
- Restore the open-clinic FAQ: copy `marketing/clinic-launch/faq-when-clinic-open.json` into `server/faqDefaults.js`
  (it's the `FAQ` array), update the "Where is the GP4U walk-in clinic?" answer with the address, `npm run pages`, commit, deploy.
- Homepage/walk-in copy review against reality (hours, services).
- `node scripts/seo-check.js https://www.gp4u.ie` and `node scripts/e2e.js --live https://www.gp4u.ie` (the tests check whichever state the site is in).
- Search Console: request indexing for `/`, `/walk-in-gp-newbridge/`, `/contact/`; resubmit sitemap.

**Undo:** untick the switch — everything goes back to "opening soon" (the address stays hidden even though it's saved).
