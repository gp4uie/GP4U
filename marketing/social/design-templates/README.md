# Social design templates

One file, [template.html](template.html), with 11 layouts in the website's palette and fonts. Examples of every one are in
[exports/](exports/).

| Layout (`t=`) | Use | Size |
|---|---|---|
| `announcement` | Launches, brand cards, booking CTAs | IG 1080×1350 · FB 1080×1080 |
| `education` | GP education with bullet points + safety line | 1080×1350 |
| `carousel` | Carousel slides (`n=01` shows a big step number) | 1080×1350 |
| `faq` | One question + answer | 1080×1350 |
| `myth-fact` | Myth vs fact | 1080×1350 |
| `quote` | Real, approved GP quotes only | 1080×1350 |
| `clinic-teaser` | Phase 2 "Something new is coming to Newbridge" (strip says "GP care when you need it.") | 1080×1350 |
| `reel-cover` | Reel / TikTok / Shorts cover | 1080×1920 |
| `photo` | LinkedIn / Facebook link-style image with a website photo | 1200×627 |
| `cover` | Facebook cover, LinkedIn banner, YouTube banner (`sc=1` for wide banners) | see profile files |
| `profile` | Profile picture / highlight covers | 1080×1080 |

**Make a new post:** add a line to `JOBS` in [render.js](render.js), then
`node marketing/social/design-templates/render.js <name>`. Or open `template.html?t=education&h=…&b=line|line` in a browser to preview.

Rules: the "One tap. Real care." strip stays on every static post except profile images; the safety line stays on
anything about symptoms (`safety=0` only for non-medical posts); no AI images; photos only from the licensed website set
or the GP4U shoot.
