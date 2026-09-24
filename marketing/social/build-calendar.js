#!/usr/bin/env node
/*
 * Builds the social planning files from content-data.js:
 *   marketing/social/first-30-posts.md
 *   marketing/social/calendar-90-days.csv       (91 days from START)
 *   marketing/video/short-form-concepts.md
 * Usage: node marketing/social/build-calendar.js [YYYY-MM-DD start, a Monday]
 */
const fs = require('fs');
const path = require('path');
const { POSTS, VIDEOS, TAGS } = require('./content-data');

const START = process.argv[2] || '2026-10-05';
const OUT = __dirname;

// Posts after the first 30 (weeks 7–13): rotate pillars, seasonal where it fits
const LATER = [
  ['GP education', 'Tummy bugs — keeping fluids up', 'Vomiting and diarrhoea bug going round?', 'Fluids little and often; stay off work/school 48h after last episode; warning signs of dehydration; when to get help.', 'Save this'],
  ['Online GP explained', 'Video or phone — which to choose?', 'Video or phone consultation?', 'Video helps when your GP needs to see something (e.g. a rash); phone suits many conversations. Price for each on gp4u.ie/fees.', 'See prices'],
  ['Myth vs fact', 'You need to be really sick to see a GP', 'Myth: "It\'s not bad enough to bother a GP."', 'If something is worrying you, not getting better, or affecting daily life, it\'s worth a chat.', 'Book online'],
  ['Behind GP4U', 'How we keep consultations private', 'Where does your consultation happen?', 'Secure video, encrypted records, private link — explained simply.', 'Read our privacy notice'],
  ['Patient convenience', 'Lunch-break consultation', 'Could you see a GP on your lunch break?', 'Pick a time that suits; video or phone; somewhere private.', 'Book online'],
  ['GP education', 'Flu vs cold', 'Cold or flu — how to tell?', 'Flu comes on suddenly with fever and aches; colds are milder; who should get help (older people, pregnancy, long-term conditions).', 'Share with family'],
  ['Future clinic', 'Team preparing for Newbridge', 'Getting ready for something new in Newbridge.', 'Team prep photo — no location details. PHASE 2.', 'Get opening news'],
  ['GP education', 'Eczema flare-ups in winter', 'Winter making your eczema worse?', 'Moisturise often, avoid overheating, when to see a GP.', 'Save this'],
  ['Brand content', 'One tap. Real care. — winter', 'Real care doesn\'t take a day off.', 'Brand card: online GP 7 days.', 'Book online'],
  ['Online GP explained', 'Referral letters', 'Can an online GP refer me?', 'Where your GP considers it appropriate, they can write a referral letter after assessing you.', 'Learn more'],
  ['GP education', 'Looking after your mental health in winter', 'Darker evenings getting to you?', 'General wellbeing tips; when to talk to a GP; Samaritans 116 123; emergency 112/999.', 'Save this'],
  ['Myth vs fact', 'Online consultations are only for young people', 'Myth: "Online GP is only for tech-savvy people."', 'Phone consultations work well too; family can help book.', 'See how it works'],
  ['Future clinic', 'Behind the scenes: furniture day', 'Chairs arrived. 🪑', 'Detail shot only. PHASE 2.', 'Get opening news'],
  ['GP education', 'Christmas: medicines and pharmacy hours', 'Travelling or busy over Christmas?', 'Order repeat medicines early; check pharmacy holiday hours; emergencies 112/999.', 'Plan ahead'],
  ['Brand content', 'Happy Christmas from GP4U', 'Happy Christmas from all at GP4U.', 'Warm brand card; online GP: check available times when you book.', '—'],
  ['Brand content', 'New Year — looking after yourself', 'A gentle New Year reminder.', 'No "new year new you" pressure; small health habits; see a GP if something\'s bothering you.', 'Book online'],
  ['GP education', 'Chest infections — when to worry', 'Chesty cough after a cold?', 'When to see a GP; breathlessness and chest pain need urgent help.', 'Save this'],
  ['Meet GP4U', 'Meet another member of the team', 'Meet ___.', 'Real team member, consent. ', 'Follow'],
];

const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""').replace(/\n/g, ' ')}"`;
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ------------------------------------------------------------------ calendar
const rows = [];
let p = 0; let later = 0; let v = 0;
for (let i = 0; i < 91; i++) {
  const date = addDays(START, i);
  const dow = new Date(date + 'T12:00:00Z').getUTCDay();
  const week = Math.floor(i / 7) + 1;
  const push = (r) => rows.push({ date, day: DOW[dow], week, ...r });
  if (date === '2026-12-25' || date === '2026-12-26') {
    if (date === '2026-12-25') push({ platform: 'IG + FB', format: 'Single image', pillar: 'Brand content', topic: 'Happy Christmas', hook: 'Happy Christmas from GP4U.', caption: 'Warm brand card. Emergencies: 112/999.', cta: '—', visual: 'Template "announcement"', production: 'Template, 20 min', ref: '', flags: 'Scheduled in advance' });
    continue;
  }
  // IG + FB posts Mon / Wed / Fri (+ Sat Stories)
  if ([1, 3, 5].includes(dow)) {
    if (p < POSTS.length) {
      const x = POSTS[p++];
      push({ platform: x.platform, format: x.format, pillar: x.pillar, topic: x.topic, hook: x.hook, caption: x.caption, cta: x.cta, visual: x.visual, production: x.format.includes('Video') ? 'Film + edit, 1–2h' : 'Template, 30–60 min', ref: `Post #${x.n} (first-30-posts.md)`, flags: [x.phase2 ? 'PHASE 2 — owner go-ahead' : '', x.review ? 'GP review' : '', x.needs ? 'Needs: ' + x.needs : ''].filter(Boolean).join('; ') });
    } else {
      const [pillar, topic, hook, caption, cta] = LATER[later++ % LATER.length];
      push({ platform: 'IG + FB', format: pillar === 'GP education' || pillar === 'Myth vs fact' ? 'Carousel' : 'Single image', pillar, topic, hook, caption, cta, visual: 'Brand template matching the format', production: 'Template, 30–60 min', ref: 'Later series', flags: [pillar === 'Future clinic' ? 'PHASE 2 — owner go-ahead' : '', /education|Myth/.test(pillar) ? 'GP review' : ''].filter(Boolean).join('; ') });
    }
  }
  // Short video Tue / Thu (TikTok + Reels + Shorts), plus Sat every other week
  if ([2, 4].includes(dow) || (dow === 6 && week % 2 === 0)) {
    let x = VIDEOS[v++ % VIDEOS.length];
    if (x[0] === 'V34') x = VIDEOS[v++ % VIDEOS.length]; // never schedule the Phase 3 "first look" automatically
    push({ platform: 'TikTok + IG Reels + YT Shorts', format: `Vertical video ~${x[3]}s`, pillar: x[2], topic: x[1], hook: x[4], caption: x[5], cta: x[2] === 'Future clinic' ? 'Get opening news' : 'Book online / follow', visual: 'Real GP to camera or b-roll; captions on; brand end card', production: 'Batch-filmed; edit 45 min', ref: `${x[0]} (video/short-form-concepts.md)`, flags: [x[2] === 'Future clinic' ? 'PHASE 2 — owner go-ahead' : '', /education|Myth/.test(x[2]) ? 'GP review' : ''].filter(Boolean).join('; ') });
  }
  // LinkedIn Wed (+ Fri on odd weeks)
  if (dow === 3 || (dow === 5 && week % 2 === 1)) {
    push({ platform: 'LinkedIn', format: 'Text + image', pillar: dow === 3 ? 'Behind GP4U' : 'Meet GP4U', topic: dow === 3 ? 'Building GP4U — weekly update / lesson' : 'Team, hiring or professional update', hook: 'Founder voice, first line = the lesson', caption: 'Honest, specific, no hype; no patient data', cta: 'Follow GP4U', visual: 'Founder/team photo or product screenshot (demo data)', production: 'Founder 30 min', ref: 'linkedin/profile.md', flags: '' });
  }
  // YouTube every other Thursday
  if (dow === 4 && week % 2 === 0) {
    const x = VIDEOS[(week / 2 - 1) % VIDEOS.length];
    push({ platform: 'YouTube', format: 'Explainer 3–8 min', pillar: x[2], topic: `${x[1]} (long version)`, hook: x[4], caption: 'Description with reviewer, date, chapters, booking link', cta: 'Book online (description link)', visual: 'GP to camera, b-roll', production: 'Film 1h + edit 2h', ref: `${x[0]} long form`, flags: 'GP review' });
  }
}
const cols = ['date', 'day', 'week', 'platform', 'format', 'pillar', 'topic', 'hook', 'caption', 'cta', 'visual', 'production', 'ref', 'flags'];
const header = ['Date', 'Day', 'Week', 'Platform', 'Format', 'Pillar', 'Topic', 'Hook', 'Caption concept', 'CTA', 'Visual concept', 'Production', 'Reference', 'Flags'];
fs.writeFileSync(path.join(OUT, 'calendar-90-days.csv'), '﻿' + [header.map(q).join(',')].concat(rows.map((r) => cols.map((c) => q(r[c])).join(','))).join('\r\n') + '\r\n');

// ------------------------------------------------------------------ first 30 posts
const md = [`# The first 30 GP4U posts

Generated from [content-data.js](content-data.js) — edit there and run \`node marketing/social/build-calendar.js\`.
Dates are in [calendar-90-days.csv](calendar-90-days.csv). **Posts marked "GP review" must be signed off by a GP before
publishing. Posts marked "PHASE 2" need the owner's go-ahead** (and must not show the clinic's location).
Default hashtags: \`${TAGS}\` (use 3–6 on Instagram; 0–2 on Facebook and LinkedIn).
`];
for (const x of POSTS) {
  md.push(`## ${x.n}. ${x.topic}${x.phase2 ? ' — PHASE 2' : ''}

- **Platform / format:** ${x.platform} · ${x.format}
- **Pillar:** ${x.pillar}${x.review ? ' · **GP review required**' : ''}${x.needs ? ` · **Needs:** ${x.needs}` : ''}
- **Hook:** ${x.hook}
- **Caption:**

${x.caption.split('\n').map((l) => `  > ${l}`).join('\n')}

- **CTA:** ${x.cta}
- **Visual:** ${x.visual}
- **Hashtags:** ${x.tags}
`);
}
fs.writeFileSync(path.join(OUT, 'first-30-posts.md'), md.join('\n'));

// ------------------------------------------------------------------ video concepts
const vmd = [`# Short-form video concepts (${VIDEOS.length})

TikTok, Instagram Reels and YouTube Shorts. Generated from [../social/content-data.js](../social/content-data.js).
Scripts and the reusable 15/30/45/60-second structures: [scripts.md](scripts.md).

**Rules for every video:** a real GP4U person on camera (or hands/b-roll — never actors presented as GP4U doctors);
captions burned in; symptom videos carry *"General information, not personal medical advice. Emergencies: 112/999"*;
GP review before posting; brand end card (3 s): badge + "One tap. Real care." + gp4u.ie. No dance trends, no fear hooks.

| # | Title | Pillar | Length | Hook | What it covers |
|---|---|---|---|---|---|
`];
for (const [id, title, pillar, len, hook, body] of VIDEOS) vmd.push(`| ${id} | ${title} | ${pillar} | ~${len}s | ${hook} | ${body} |`);
vmd.push('\n**Batch filming:** film 6–8 videos in one 2-hour session per fortnight (same outfit/room is fine — it looks consistent). Keep a running list of real (anonymised) questions patients ask — they are the best hooks.');
fs.mkdirSync(path.join(OUT, '..', 'video'), { recursive: true });
fs.writeFileSync(path.join(OUT, '..', 'video', 'short-form-concepts.md'), vmd.join('\n') + '\n');

console.log(`calendar: ${rows.length} items over 91 days from ${START}; ${POSTS.length} posts; ${VIDEOS.length} video concepts`);
