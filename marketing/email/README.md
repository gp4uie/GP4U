# Email marketing (GDPR-conscious)

## Rules
1. **Only people who opted in** through a GP4U sign-up form (live on the website: "Be the first to know" on the Newbridge
   clinic page and homepage). Consent wording, date and source are stored with each address.
2. **Never** add patients from bookings, registrations, walk-in check-ins or consultations to a marketing list, and
   never use consultation information (reasons, conditions, prescriptions) to segment or target. Service emails
   (booking confirmations, "a message is waiting") are separate and stay transactional.
3. Every email: who we are, why they're getting it, one-click unsubscribe, link to the privacy notice, emergency line.
4. Use an email platform with an EU data processing agreement (e.g. Mailchimp or Brevo with DPA signed, EU data where
   offered). Record it in the privacy notice's list of processors (**owner to confirm** — privacy notice currently lists hosting and Stripe).
5. Unsubscribes: honour immediately in the tool, and mark them in GP4U too (the unsubscribe link in the CSV export does
   this automatically — or import your tool's unsubscribes monthly).
6. Double opt-in is recommended (turn it on in the email tool at import) — **REVIEW with your DPO/solicitor**.

## Getting the list
Admin login → `https://www.gp4u.ie/api/admin/signups?format=csv` → import into the email tool (keep the
`unsubscribe_link` column as a merge field if you use GP4U's link).

## Welcome sequence (templates/)
| # | When | Subject | Goal |
|---|---|---|---|
| 1 | Day 0 | Welcome to GP4U | Who we are; online now; Newbridge soon |
| 2 | Day 2 | How online GP works (4 steps) | Remove friction |
| 3 | Day 5 | When an online GP can be useful | Educate + honest limits (GP review) |
| 4 | Day 9 | Meet GP4U | Human trust (founder writes it) |
| 5 | Day 14 | Book when you need us | Soft conversion |
| — | Phase 3 | Our Newbridge clinic is open | Launch (only on approval; fills approved address/hours) |

Rebuild after edits: `node marketing/email/build-emails.js`. Test in Gmail, Outlook and Apple Mail before sending.

## After the sequence
One email a month at most: a useful seasonal GP tip (reviewed), a GP4U update, clinic progress (Phase 2). Measure opens
(unreliable), clicks, bookings via UTM (`utm_medium=email`), unsubscribes.
