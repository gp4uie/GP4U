# GP4U — Telemedicine Prototype

A working prototype of an Irish telemedicine website: patients pick a service, fill in a short
questionnaire, choose a time, pay by card, and get a private video link. You (the GP) manage
bookings, messages, and prescriptions from a simple dashboard.

This is built to be **tried out safely first** — it defaults to "demo mode" (bookings auto-confirm,
no real payment) until you add real Stripe keys.

## 1. Running it on your own computer

This app stores its data in a **MySQL database** (not a plain file), so a MySQL server needs to be
running before you start the app. One-time setup:

1. Install MySQL Server if you haven't already (e.g. via the MySQL installer, or `winget install
   Oracle.MySQL` in PowerShell).
2. Create a database and a user for the app. In a terminal:
   ```
   mysql -u root -e "CREATE DATABASE gp4u; CREATE USER 'gp4u_app'@'localhost' IDENTIFIED BY 'choose-a-password'; GRANT ALL PRIVILEGES ON gp4u.* TO 'gp4u_app'@'localhost';"
   ```
3. In `.env`, set `DB_USER` and `DB_PASSWORD` to match what you just created (`DB_HOST=localhost`,
   `DB_NAME=gp4u`, `DB_PORT=3306` already default to the right values).

Every time you want to start the site after that:

1. Make sure MySQL is running (if you installed it as a Windows service, it starts automatically;
   if not, start `mysqld` first).
2. Open this folder (`Documents/GP4U`) in a terminal.
3. Run: `npm start`
4. Open your browser to: **http://localhost:4000**

The first time it starts, it automatically creates all the tables it needs — nothing else to set up.
Stop the app any time with `Ctrl+C` in the terminal (MySQL itself keeps running separately).

## 2. Editing your practice details

Open the `.env` file in this folder in any text editor (Notepad is fine) and update:

- `PRACTICE_NAME` — shown across the site
- `PRACTICE_ADDRESS` / `PRACTICE_PHONE` — shown on the letterhead of prescriptions, sick certs and referral letters
- `DOCTOR_NAME` / `DOCTOR_REG_NUMBER` / `DOCTOR_LOGIN_EMAIL` / `DOCTOR_PASSWORD` — used **once**, to create your own doctor login the very first time the app connects to a brand-new database. After that first login exists, these four are ignored — manage doctors (including yourself) from the dashboard's **Doctors** tab instead: add a colleague with their own name, IMC number, email and password, or remove one.
- `DOCTOR_EMAIL` — where you get emailed for new bookings/messages (needs `SMTP_*` set too, see Section 3.5)

Restart the server (`Ctrl+C` then `npm start` again) after changing `.env`.

Forgotten your dashboard password? Click "Forgot your password?" on the login screen — it emails you
a reset link (needs `SMTP_*` configured, see Section 3.5). Patients have the same option on
`/patient-login.html`.

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
  - The **Prescription** tab's Medication/Dose fields have a search-as-you-type dropdown, seeded
    from a starter list of ~60 common medications in `server/medications.js`. Read the notice on
    that tab — it's a typing aid, not the Irish Medicines Formulary/BNF/HSE list (see Section 5).
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
- **Medication search list** (`server/medications.js`) is a starter convenience list the developer
  drafted from general knowledge — it is **not** the Irish Medicines Formulary, the BNF, the HSE
  PCRS reimbursement list, or any clinically verified/maintained source, and hasn't been checked
  against current licensing, availability, or dosing guidance. It only exists to reduce typing; you
  still need to apply your own clinical judgement exactly as you would with free text. A real
  formulary integration would mean either a paid IMF/BNF Ireland data licence, or building against
  HSE PCRS's professional portal (pcrs.ie) if/when suitable access and export terms are arranged.
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

- **Database**: MySQL, either your own local server (for testing) or the MySQL database included
  with Hostinger Business hosting (for the real site) — fine for one GP; a multi-doctor version with
  real volume would eventually want a more powerful managed database, but MySQL scales a long way
  before that's needed.
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
- **Photo attachments** are stored directly in the database (not on the app server's own disk,
  which some hosts wipe on every redeploy) and aren't scanned for malware or size-limited beyond
  8MB/5 photos per booking — fine for a small trial, but a real launch with a lot of photo volume
  should add malware scanning and consider moving large files to dedicated object storage instead.
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

## 8. SEO — getting found on Google

**Nobody can guarantee a top search ranking** — it depends on things no code change controls: how
long a site's been live, who links to it, and how competitive the search terms are. "GP" + "Ireland"
is a competitive space. What's done here is the technical foundation, so the site isn't starting
from zero once it's actually live.

**Already in place:**
- Unique title and meta description on the homepage, booking page, and blog, written around real
  search terms people use ("online GP Ireland", "book GP appointment online", etc.)
- Open Graph / Twitter card tags, so links shared on social media or WhatsApp show a proper preview
- `schema.org` structured data (`MedicalBusiness`) on the homepage, which can help Google show richer
  results and matters for local/medical search
- `robots.txt` and `sitemap.xml`, so search engines know what to crawl
- Every private/functional page (dashboard, patient portal, booking confirmation, video call,
  printable prescriptions/documents) is marked `noindex` — these should never show up in search
  results or get cached by Google, which matters for privacy as much as SEO, since some of these
  pages are only "protected" by a link containing a token
- A favicon, so the site looks finished in browser tabs and bookmarks

**Still needed once the site is actually hosted on gp4u.ie (none of this works from localhost):**
- Verify the site in [Google Search Console](https://search.google.com/search-console) and submit
  `sitemap.xml` — this is what actually tells Google the site exists
- Set up a **Google Business Profile** for the practice — for a local medical service, this matters
  more for being found than almost anything else here
- Update `PRACTICE_ADDRESS`/`PRACTICE_PHONE` in `.env` with your real details — search engines and
  patients both use these for trust and local relevance
- Get listed on Irish health/business directories (these create the "backlinks" that build trust
  with Google over time)
- Keep adding real posts to the Health Info blog via the content editor — regularly updated,
  genuinely useful content is one of the few SEO factors actually within your control
- Once on a real domain, confirm HTTPS is working (Section 6) — Google treats non-HTTPS sites worse
- Double check the `https://www.gp4u.ie/` URLs baked into the meta tags and `sitemap.xml` match
  your actual final domain before going live

## 9. Deploying to Hostinger (going live on gp4u.ie)

This assumes you have **Hostinger Business Web Hosting** (or a Cloud plan) and already own the
`gp4u.ie` domain. The exact wording of each screen may differ slightly from what's below since
Hostinger updates hPanel from time to time — if a step doesn't match what you see, their live chat
support can tell you exactly where to click.

### Step 1 — Create the MySQL database

1. In hPanel, go to **Databases → MySQL Databases**.
2. Create a new database (e.g. `gp4u`) and a new database user with a strong password. Note down
   the **database name, username, password, and host** it shows you — you'll need all four next.

### Step 2 — Deploy the app

1. In hPanel, go to **Websites → Add Website → Deploy Web App**.
2. Choose **Import Git Repository**, authorize Hostinger to access your GitHub account if asked,
   and select your `GP4U` repository (the one at github.com/gp4uie/GP4U from Section "GitHub" —
   ask if you need a reminder of how that was set up).
3. When asked for framework/entry file details, set the **entry file** to `server/index.js`.
4. Don't deploy yet — first add the environment variables (next step), since Hostinger needs a
   redeploy afterwards anyway to pick them up.

### Step 3 — Add environment variables

In the app's settings in hPanel, find **Environment Variables** and add every value from your
local `.env` file, with two important changes for the live site:

- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` — use the values from Step 1, not your local ones
- `BASE_URL` — set to `https://www.gp4u.ie` (your real domain, once Step 5 is done)
- Everything else (`DOCTOR_PASSWORD`, `SESSION_SECRET`, `PRACTICE_*`, `SMTP_*`, `STRIPE_*` if
  you're using it) — same values as your local `.env`, or your real live values if different

### Step 4 — Deploy and restart

Click **Deploy**. Once it finishes, use the **Restart** option for the app so the new environment
variables actually take effect (Hostinger doesn't pick these up automatically until a restart).
Check the app's logs in hPanel if anything looks wrong — the same "could not connect to the
database" message you'd see locally will show up there too if `DB_*` values are wrong.

### Step 5 — Point your domain at it

In the same website's settings, look for **Domains** and either select `gp4u.ie` if it's already
in your Hostinger account, or follow the prompts to add it. If `gp4u.ie` is registered somewhere
else (e.g. Blacknight, IE Domain Registry) rather than through Hostinger itself, you'll instead need
to update that domain's DNS records (or nameservers) to point at Hostinger — hPanel will show you
exactly what to change.

### Step 6 — SSL / HTTPS

Hostinger issues free SSL certificates (via Let's Encrypt) automatically for domains pointed at
their hosting — this should turn on by itself once the domain is connected, usually within a few
minutes to an hour. Confirm the site loads at `https://www.gp4u.ie` (not just `http://`) before
telling anyone the site is live.

### After it's live

- Update `BASE_URL` to the real HTTPS domain if you hadn't already, redeploy
- Re-read **Section 5** — going live technically is not the same as being ready for real patients
- Submit `https://www.gp4u.ie/sitemap.xml` to Google Search Console (Section 8)
- Every time you push new code changes to GitHub, redeploy from hPanel to update the live site
