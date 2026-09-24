# Social account setup checklist (owner completes — accounts are not created automatically)

Accounts must be created and verified by GP4U (phone/email/ID verification, business verification, 2FA). Use a shared
company mailbox (e.g. social@gp4u.ie or admin@gp4u.ie), not a personal one.

## Before you start
- [ ] Decide handle — check availability of `gp4u.ie` / `gp4uireland` / `gp4u_ie` on all five platforms at once and use the same one everywhere
- [ ] Export profile image + banners from [design-templates](design-templates/) (`node marketing/social/design-templates/render.js`)
- [ ] Password manager entry per platform; 2FA with an authenticator app (not SMS) on every account
- [ ] Meta Business Suite (business.facebook.com) created with the company's legal details; add a second admin you trust

## Facebook (first — Instagram links to it)
- [ ] Create Page "GP4U" in Meta Business Suite → copy from [facebook/profile.md](facebook/profile.md)
- [ ] **No address** (choose "doesn't have a public address"); service area Ireland
- [ ] CTA button "Book now" with UTM link; Messenger instant reply
- [ ] Pin post 1 of the first 30

## Instagram
- [ ] Create as **Professional → Business**, link to the Facebook Page in Business Suite
- [ ] Copy from [instagram/profile.md](instagram/profile.md); 3 highlights covers; pin 3 posts

## TikTok
- [ ] Create, switch to **Business account**; copy from [tiktok/profile.md](tiktok/profile.md)
- [ ] TikTok Business Center + Ads Manager only when ready to advertise (week 7–8)

## LinkedIn
- [ ] Company page from the founder's personal profile; copy from [linkedin/profile.md](linkedin/profile.md); location "Ireland" only

## YouTube
- [ ] Create a **brand account** channel (not personal); copy from [youtube/profile.md](youtube/profile.md); verify phone for custom thumbnails

## After all five
- [ ] Add social links to the website footer (ask Dev — `scripts/partials/footer.html`) — only once each profile has 3+ posts
- [ ] Add profile URLs to the Organization `sameAs` structured data (Dev — `server/seo.js`)
- [ ] Record every account, owner, and recovery method in the company password manager
- [ ] Turn on comment filters for spam and for words that reveal health details (hide, don't delete, then reply privately)

## First post / first video
- First post: [first-30-posts.md](first-30-posts.md) #1 "Welcome to GP4U"
- First Reel/TikTok: [../video/scripts.md](../video/scripts.md) → "V01 — One tap. Real care. Why we built GP4U"
