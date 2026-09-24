# UTM framework & naming conventions

Lowercase, underscores, no spaces, no personal or health information ever in a UTM.
Build links with [utm-builder.html](utm-builder.html) (open the file in a browser).

## utm_source × utm_medium
| Channel | utm_source | utm_medium |
|---|---|---|
| Google Ads | `google` | `cpc` |
| Google Business Profile | `google` | `organic` (campaign `gbp`) |
| Meta paid | `facebook` or `instagram` | `paid_social` |
| Instagram organic | `instagram` | `social` |
| Facebook organic | `facebook` | `social` |
| TikTok organic / paid | `tiktok` | `social` / `paid_social` |
| LinkedIn | `linkedin` | `social` |
| YouTube | `youtube` | `social` (or `video` for paid) |
| Email | `email` | `email` |
| Partnerships | `partner_<shortname>` e.g. `partner_newbridge_gaa` (only real partners) | `referral` |
| PR | `<outlet_shortname>` e.g. `kildare_nationalist` | `pr` |
| Print / QR (posters, leaflets) | `qr_<placement>` e.g. `qr_poster_pharmacy` | `offline` |

## utm_campaign
`<objective>_<theme>[_<yyyymm>]`
- `online_gp_launch` (Phase 1 default) · `online_gp_always_on` · `brand` · `clinic_teaser` (Phase 2) · `clinic_launch`
  (Phase 3) · `winter_health_202611` · `welcome_series` · `profile` (bio links)

## utm_content
`<asset>_<variant>` → e.g. `reel_01`, `v05_cough`, `carousel_how_it_works`, `a1_video_gp_intro`, `bio_link`, `e2_cta`, `sitelink_prices`

## utm_term
Paid search keyword via `{keyword}`; otherwise omit.

## Campaign naming in ad platforms
`<CHANNEL>_<Objective>_<Theme>` — e.g. `IE_Search_OnlineGP`, `META_Awareness_OnlineGP`, `TT_Spark_Awareness`.
Ad sets: `<audience>_<geo>` (e.g. `broad_ie`, `retarg_30d_ie`, `local_newbridge15km`). Ads: `<creative id>` matching `utm_content`.

## Examples
- Instagram bio: `https://www.gp4u.ie/online-gp/?utm_source=instagram&utm_medium=social&utm_campaign=profile&utm_content=bio_link`
- Reel 5 link sticker: `…/online-gp/?utm_source=instagram&utm_medium=social&utm_campaign=online_gp_launch&utm_content=v05_cough`
- Welcome email 2 button: `…/book.html?utm_source=email&utm_medium=email&utm_campaign=welcome_series&utm_content=e2_cta`
- Pharmacy poster QR (Phase 3): `…/walk-in-gp-newbridge/?utm_source=qr_poster_pharmacy&utm_medium=offline&utm_campaign=clinic_launch`
