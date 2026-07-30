# GP4U — Telemedicine Prototype

A working prototype of an Irish telemedicine website: patients pick a service, fill in a short
questionnaire, choose a time, pay by card, and get a private video link. You (the GP) manage
bookings, messages, and prescriptions from a simple dashboard.

This is built to be **tried out safely first** — it defaults to "demo mode" (bookings auto-confirm,
no real payment) until you add real Stripe keys.

## 1. Running it on your own computer

Every time you want to start the site:

1. Open this folder (`Documents/GP4U`) in a terminal.
2. Run: `npm start`
3. Open your browser to: **http://localhost:4000**

Stop it any time with `Ctrl+C` in the terminal.

## 2. Editing your practice details

Open the `.env` file in this folder in any text editor (Notepad is fine) and update:

- `PRACTICE_NAME` — shown across the site
- `PRACTICE_ADDRESS` / `PRACTICE_PHONE` — shown on the letterhead of prescriptions, sick certs and referral letters
- `DOCTOR_NAME` — your name, shown on the dashboard and on prescriptions
- `DOCTOR_REG_NUMBER` — your Irish Medical Council registration number
- `DOCTOR_PASSWORD` — the password you'll use to log into `/dashboard.html`
- `DOCTOR_EMAIL` — where you get emailed for new bookings/messages (needs `SMTP_*` set too, see Section 3.5)

Restart the server (`Ctrl+C` then `npm start` again) after changing `.env`.

## 3. Turning on real payments (Stripe)

Right now, bookings skip payment and auto-confirm ("demo mode") so you can try the whole site.
To take real card payments:

1. Go to https://dashboard.stripe.com/register and create a free account (needs your business/PPS
   details — Stripe will ask what's needed).
2. Once logged in, make sure you're in **Test mode** (toggle top-right of the Stripe dashboard).
3. Go to Developers → API keys, and copy the **Secret key** (starts `sk_test_...`).
4. Paste it into `.env` as `STRIPE_SECRET_KEY=sk_test_...`
5. Restart the server. The booking flow will now redirect to a real Stripe payment page.
6. Test it with Stripe's test card: card number `4242 4242 4242 4242`, any future expiry date, any
   3-digit CVC, any postcode. No real money moves in test mode.

When you're ready to take real payments from real patients, switch Stripe out of Test mode, copy
your **live** secret key (`sk_live_...`) into `.env` instead, and go through Stripe's identity
verification for your business. Only do this once you're ready to go live (see Section 6).

## 4. What's in this prototype

- **Homepage** — services, pricing, how it works, about section
- **Booking flow** (`/book.html`) — choose service → intake questionnaire → pick a time → pay.
  Name, phone, email, pharmacy name, and reason for consultation are required (marked with a red
  `*`) and the form won't let you continue until they're filled in and the email looks valid.
  Patients can also attach photos (e.g. a rash, a letter) — optional, up to 5 images.
- **Confirmation page** — booking details, join-call link, secure messaging, prescriptions,
  issued documents, uploaded attachments, and an offer to set a password for one-click access next
  time. Once you mark a booking complete, the message box here is replaced with a closed notice —
  patients can't message you about a consultation you've already finished (they can always book a
  new one).
- **Patient login** (`/patient-login.html`, `/patient-portal.html`) — once a patient sets a
  password, they get a sidebar with three sections: **Book a New Consultation**, **Previous
  Consultations** (with a "New" badge on any booking with an unread message or newly issued
  document), and **Documents Issued** (every prescription/sick cert/referral letter across all
  their bookings in one place).
- **Video consultations** (`/consult.html`) — built-in video call, no Zoom/Meet needed
- **Doctor dashboard** (`/dashboard.html`) — password-protected, with three top-level tabs:
  - **Schedule** — a day view with 15-minute slots; each booking block shows the patient's name
    and a preview of their reason for the visit, amber if still open, green once completed; use
    ← Prev / Next → / Today to move between days
  - **Search Patients** — find a patient's records by name, phone number, or exact date of birth
  - **Recent Cases** — the last 40 paid/completed bookings, most recent first
  - A **notification bell** (top right) lights up with a red count when a new booking comes in or
    a patient sends a message — click it to see recent activity and jump straight to that booking
  - Clicking any booking opens it as a **chart** in the same page (no new tab/page load), with its
    own left-hand sub-tabs so everything about that visit is one click away:
    - **Overview** — intake answers, join call / mark complete, any photos the patient attached
    - **Previous Consultations** — this same patient's other bookings, click one to jump straight to it
    - **Message Patient** — the conversation thread for this booking
    - **Clinical Notes** — append-only, timestamped, never shown to the patient
    - **Prescription** — issue, print, or send to a pharmacy by email
    - **Sick Cert** — issue (patient details auto-filled) and send straight to the patient
    - **Referral Letter** — to an Emergency Department or a specialist
    - **Documents Issued** — everything issued for this consultation in one combined list
  - **◀ Previous Case / Next Case ▶** buttons at the top of the chart move to the next/previous
    booking in whichever list you opened it from (Schedule, Search, or Recent Cases), so you can
    work through a day's appointments without going back to the list each time.
- **Health info / blog** (`/blog.html`) — sample articles, editable without touching code (below)
- **Privacy & GDPR notice** (`/privacy.html`) — starting template, see Section 5
- **Website content editor** (`/content-editor.html`, linked from the dashboard) — log in as the
  doctor first, then edit the homepage headline/subtitle/about text and add, edit, or delete blog
  posts from a simple form. Changes appear on the site immediately, no file editing or restart
  needed. This is the easiest way to change wording day to day — reach for editing `.env` or the
  `.html` files directly (Section 2) only for things not covered here, like prices or your name.

Service types and prices live in `server/services.js` — edit that file to change what's offered or
how much it costs. Sick cert / referral letter field templates live in `server/documentTypes.js`.

## 3.5. Email setup (booking confirmations, notifications, Healthmail-ready sending)

All outgoing email in this app — the patient's booking confirmation link, your new-booking/new-message
alerts, and "Send to Pharmacy"/"Send to Patient"/"Send by Email" on the dashboard — goes through the
same `SMTP_*` settings in `.env`. Until you set them, the app still works, it just skips email:
patients rely on bookmarking their confirmation page, you rely on the in-app notification bell, and
the "Send" buttons show a message telling you email isn't set up yet (with Print → Save as PDF
always available as a fallback).

**Important: Healthmail itself doesn't offer a public API for outside apps to plug into.** It's the
HSE's closed, secure email network — every GP, pharmacy and hospital department on it has their own
`@healthmail.ie` address, and messages between those addresses travel over their secure system. What
this app can do is send a normal email *from an account you control* — so:

- **Once you have a Healthmail account**: ask Healthmail support for your account's SMTP host,
  port, username and password, and put them in `.env` as `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
  `SMTP_PASS`, `SMTP_FROM`. From then on, prescriptions and letters really do send from your
  `@healthmail.ie` address, over their secure network, to any other Healthmail address (like a
  pharmacy's).
- **Before you have one, for testing**: you can point it at any ordinary mailbox (e.g. a Gmail
  account with an "app password" generated in its security settings) just to see the sending flow
  work end to end. Don't use this for real patient prescriptions — only a genuine Healthmail (or
  similarly secure) channel is appropriate for real patient health information.

## 5. Important — read before using this with real patients

This prototype is a strong starting point, but there are things a solicitor, your medical indemnity
insurer, and (for some items) a developer should help you close off before real patient use:

- **Medical Council of Ireland telemedicine guidance** — covers patient identity verification,
  when telemedicine is *not* appropriate (e.g. some presentations need in-person examination), and
  record-keeping. Review the current guidance at medicalcouncil.ie before offering remote
  consultations to the public.
- **Prescribing** — the "Issue a Prescription" feature creates a printable/emailable note; it is
  **not** a certified e-prescribing system, and "sending via Healthmail" only becomes real once you
  connect your own genuine Healthmail account (Section 3.5) — until then, emails go through
  whatever ordinary mailbox you configure, which is not appropriate for real patient prescriptions.
  Controlled drugs generally cannot be prescribed via telemedicine without an in-person exam — do
  not use this feature for real prescriptions until you've confirmed your approach with your
  indemnity insurer.
- **Sick certs and referral letters** are similarly printable/emailable templates, not connected to
  any official certification or hospital referral system — confirm with your indemnity insurer and
  any receiving hospital/department what format and channel they expect for real referrals.
- **Clinical note-keeping** — the notes feature is a reasonable start (append-only, timestamped,
  attributed) but is not a full clinical records system; check it meets your obligations for record
  content and retention under Medical Council guidance before relying on it as your only record.
- **Patient identity verification** — there's currently no ID check before booking. Real services
  typically verify identity (e.g. photo ID upload) before a first consultation.
- **GDPR / health data** — `privacy.html` is a template covering the basics; have it reviewed
  properly, especially data retention periods and any additional processors you add later.
- **Professional indemnity insurance** — confirm your cover (e.g. Medisec, MPS) explicitly extends
  to remote/telemedicine consultations.
- **HIQA** — depending on how the service is structured (e.g. if you bring on other GPs or expand
  scope), you may need to check registration requirements with HIQA.
- **A Data Protection Impact Assessment (DPIA)** — processing health data systematically like this
  is very likely to legally require one under GDPR Article 35. This is a specific document your
  solicitor/DPO should help produce; it's separate from (and more involved than) the privacy notice.
- **HTTPS** — this only runs over plain `http://localhost` on your own computer right now. The
  moment it's reachable over the internet, it must run under HTTPS/TLS — this happens at the
  hosting stage (Section 6), not something to fix on your own PC.

None of this blocks you from building and testing — it just needs sign-off before real patients use it.

## 6. Known technical limitations of this prototype (fine for testing, not for scale)

- **Database**: uses a simple local file (`data/gp4u.db`), fine for one GP testing this out. A real
  launch with multiple doctors and volume would move to a hosted database.
- **Video calls**: the call itself only starts once the server confirms the patient's token (or a
  logged-in doctor session) is valid for that booking — knowing/guessing a booking ID alone isn't
  enough to join. Signalling (finding the other participant) goes through PeerJS's free public
  server; the audio/video itself flows directly between the two browsers, encrypted by WebRTC, not
  through that server. This is good enough to demo and test, but for real launch, a dedicated video
  provider (e.g. Daily.co,
  Twilio Video) is more reliable and easier to keep compliant.
- **Doctor login**: a single shared password (from `.env`). Fine for one GP; a multi-doctor version
  needs individual logins.
- **Patient search — and the "Previous Consultations" list in a chart — matches on name/phone/DOB
  or email text**, not a dedicated patient ID — there's no separate "patient record" table yet,
  just bookings linked by the email address used. If two patients share a name, double-check DOB
  and phone before relying on a match.
- **Photo attachments** are stored as plain files under `data/uploads/` and aren't scanned for
  malware or size-limited beyond 8MB/5 photos per booking — fine for a small trial, but a real
  launch should add virus scanning and move storage to something like S3.
- **Patient accounts have no "forgot password" flow yet** — if a patient forgets their password,
  they'd need a new booking confirmation email to set a new one (there's also no email verification
  step: whoever clicks the booking confirmation link can set the password, same trust level as a
  typical "magic link"). Fine for testing; worth hardening before wide real-world use.
- **Notifications are in-app only** — the bell updates while the dashboard is open (checking every
  15 seconds) and can email you too if `SMTP_*`/`DOCTOR_EMAIL` are set, but there's no phone push
  notification; that would need a proper mobile app or PWA setup later.
- **Schedule view** is a single doctor's day calendar, fixed to weekdays 9am–5pm (matches the slots
  patients can book — edit `server/slots.js` to change the hours/days).
- **Hosting**: right now this only runs on your own computer. Going live on `www.GP4U.ie` means
  deploying it to a hosting provider (e.g. Render, Railway, or a VPS) and pointing your domain's DNS
  at it — happy to help with that step when you're ready.

## 7. Multi-doctor platform

The dashboard and data model are built around a single doctor for now (as agreed for this first
version). Adding more GPs — separate logins, individual calendars, and a public doctor directory —
is a well-scoped next step once this version has been tested.
