# PHASE 3 — Clinic launch campaign (locked until the owner confirms "The clinic is ready to launch.")

Needs from the owner first: **approved address + Eircode, phone, opening hours, fees, opening date, doctors' names/photos
(with consent), clinic photos, confirmation of services offered in person.**

## Timeline (counting back from opening day = D)

| When | Theme | Social | Email | Website / GBP | Paid | PR / local |
|---|---|---|---|---|---|---|
| **D-6 weeks** | Awareness | "Opening [month] in Newbridge" (date only if confirmed); founder video; team intros | Clinic list: "We have a date" | Website still "opening soon" + date line (Dev: add date to `/walk-in-gp-newbridge/`) | Meta local reach (Newbridge +15 km) | Start local outreach (templates) |
| **D-4 weeks** | Reveal | Reveal the clinic (interior, then exterior) and the address | "Here's where we'll be" | **Owner approves address** → enter in Admin (still switch OFF); GBP created & verification requested | Google: `IE_Search_Newbridge` built, paused | Press release to local media under embargo |
| **D-2 weeks** | Countdown | "2 weeks" — what walk-in will be like; FAQs | — | GBP verified; photos, services, hours (opening date set as "opening date" in GBP) | — | Local radio slot / interview requests |
| **D-1 week** | Daily countdown | Daily stories: team, room, equipment, "see you Monday" | "Opening next [day]" | Final check list below | Meta local + Google Newbridge scheduled to start on D | Community notice boards, partners told |
| **Opening day** | Launch | "We're open" video + photos; pin post | Opening announcement (template) | **Switch on** (Admin → clinic open) — website, schema, titles all flip | Campaigns live | Press release (no embargo); invite local photographer |
| **D+1 to D+30** | Local awareness + reputation | Walk-in explainers, "what to bring", real moments (consent), community | 1 email: "How the clinic is going" | Weekly GBP posts; reply to every review | Optimise on calls/directions (GBP) + walk-in page visits | Community partnerships (real ones), sports club / employer info packs |

## Opening-day checklist
- [ ] Admin → Website settings: street address, Eircode, phone, hours, fees, lead GP → **then** tick "The Newbridge clinic is open to patients"
- [ ] Check: homepage/walk-in/contact show hours, address, map, directions; check-in form works; `npm run seo-check` against live
- [ ] Restore open-clinic FAQ: `marketing/clinic-launch/faq-when-clinic-open.json` → `server/faqDefaults.js` (Dev), rebuild, deploy
- [ ] GBP: verified, hours, website link `https://www.gp4u.ie/walk-in-gp-newbridge/?utm_source=google&utm_medium=organic&utm_campaign=gbp&utm_content=website`
- [ ] Social bios updated (Phase 3 lines in each profile file); Facebook address added; Instagram contact options
- [ ] Organization `sameAs` + clinic phone in structured data (automatic from settings) — validate with Google Rich Results Test
- [ ] Directory citations started (same NAP everywhere): Golden Pages, local business directories, Irish health directories
- [ ] Google Ads location assets linked to GBP; Newbridge campaign on
- [ ] Reviews process switched on (see compliance policy)
