#!/usr/bin/env node
/*
 * Exports the GP4U social templates to PNG/JPG with headless Chrome (no npm packages needed).
 *   node marketing/social/design-templates/render.js            → renders every item in JOBS into ./exports
 *   node marketing/social/design-templates/render.js education  → only jobs whose name contains "education"
 * Add your own post by adding a line to JOBS (same parameters as template.html).
 * Note (Windows): Chrome refuses very long paths for --user-data-dir, so a short temp folder is used.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HERE = __dirname;
const OUT = path.join(HERE, 'exports');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));

const JOBS = [
  // name, params (w/hh = size)
  ['profile-image', { t: 'profile', w: 1080, hh: 1080 }],
  ['ig-post-announcement', { t: 'announcement', k: 'Hello, Ireland', h: 'One tap.\\nReal care.', b: 'Online GP care from wherever you are in Ireland. Real doctors, by video or phone.', w: 1080, hh: 1350 }],
  ['ig-post-education-cough', { t: 'education', k: 'GP education', h: 'When should a cough be checked?', b: 'It has lasted more than 3 weeks|You\'re short of breath or have chest pain|You\'re coughing up blood|Weight loss or a fever that won\'t settle', w: 1080, hh: 1350, hs: 76 }],
  ['ig-carousel-step-1', { t: 'carousel', n: '01', h: 'Choose a service', b: 'Video, phone, repeat prescription or a sick cert.', w: 1080, hh: 1350 }],
  ['ig-faq', { t: 'faq', h: 'Are GP4U doctors Irish-registered?', b: 'Yes. Every consultation is with a doctor registered with the Medical Council of Ireland.', w: 1080, hh: 1350, hs: 72 }],
  ['ig-myth-fact-antibiotics', { t: 'myth-fact', h: 'Antibiotics will clear up my cold faster.', b: 'Colds are caused by viruses. Antibiotics don\'t work on viruses — and taking them when they\'re not needed can cause side effects and resistance.', w: 1080, hh: 1350 }],
  ['ig-quote', { t: 'quote', h: 'The best consultations feel like a conversation.', b: 'Dr ___, GP4U', w: 1080, hh: 1350, safety: '0' }],
  ['ig-clinic-teaser', { t: 'clinic-teaser', k: 'Coming soon', h: 'Something new is coming to Newbridge.', b: 'Be first to know — sign up at gp4u.ie', w: 1080, hh: 1350 }],
  ['reel-tiktok-cover', { t: 'reel-cover', k: 'GP answers', h: 'Can you see a GP online in Ireland?', w: 1080, hh: 1920, hs: 96 }],
  ['facebook-post-square', { t: 'announcement', k: 'Online GP · 7 days', h: 'No waiting room.\\nA real GP.', b: 'Video or phone, from wherever you are in Ireland.', w: 1080, hh: 1080 }],
  ['linkedin-post', { t: 'photo', h: 'Building a new Irish GP service.', b: 'One tap. Real care.', img: 'clinic/doctor-desk.webp', w: 1200, hh: 627, hs: 64 }],
  ['facebook-cover', { t: 'cover', h: 'One tap. Real care.', b: 'Online GP care across Ireland', img: 'clinic/online-gp-home.jpg', w: 1640, hh: 624, sc: 1, hs: 92, bs: 34 }],
  ['linkedin-banner', { t: 'cover', h: 'One tap. Real care.', b: 'An Irish GP service — online now, Newbridge clinic coming soon', w: 1128, hh: 191, sc: 1, hs: 50, bs: 20 }],
  ['youtube-banner', { t: 'cover', h: 'One tap. Real care.', b: 'Plain-English health information from Irish GPs', w: 2560, hh: 1440, sc: 1, hs: 120, bs: 44 }],
  ['ig-highlight-cover', { t: 'profile', w: 1080, hh: 1920 }],
];

if (!CHROME) { console.error('Chrome or Edge not found — install one, or edit CHROME in this file.'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const prof = fs.mkdtempSync(path.join(os.platform() === 'win32' ? 'C:\\Users\\Public' : os.tmpdir(), 'gp4u-')); // short path for Chrome
const only = process.argv[2];
for (const [name, params] of JOBS.filter(([n]) => !only || n.includes(only))) {
  const url = 'file:///' + path.join(HERE, 'template.html').replace(/\\/g, '/') + '?' + new URLSearchParams(params).toString();
  const file = path.join(OUT, `${name}.png`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', `--user-data-dir=${prof}`, '--hide-scrollbars', '--allow-file-access-from-files',
    `--window-size=${params.w},${params.hh}`, '--virtual-time-budget=6000', `--screenshot=${file}`, url], { stdio: 'ignore' });
  console.log('✓', path.relative(process.cwd(), file));
}
fs.rmSync(prof, { recursive: true, force: true });
