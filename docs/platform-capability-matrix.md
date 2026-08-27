# Platform capability matrix

Source of truth for what each platform's *official* API actually supports — the adapter code and
the dashboard's per-platform UI are both written against this document, not the other way around
(ADR-0004). Never implement a metric or endpoint that isn't verified here first.

Legend: ✅ supported · ⚠️ conditional/limited · ❌ not available via official API · ❓ unverified

## Instagram

**Status: ⚠️ needs a final re-verification pass before first real use** — the research agent for
this platform was lost to a session interruption before completing. The adapter code
(`supabase/functions/_shared/platforms.ts`, `android/.../PlatformOAuthConfig.kt`) uses the
"Instagram API with Instagram Login" pattern below based on general knowledge of Meta's current
direction, each marked `verified: false` in code — re-run the research before depending on this in
production.

| | |
|---|---|
| Account type required | Instagram **Professional** (Business/Creator) account. This system targets the Instagram-Login route specifically because our accounts have no linked Facebook Page — needs confirmation this route still exists as described. |
| API product | "Instagram API with Instagram Login" (Meta's newer non-Facebook-Page route) — ❓ confirm current name/URL |
| OAuth | Authorize: `instagram.com/oauth/authorize` · Token: `api.instagram.com/oauth/access_token` (short-lived) → exchange for long-lived via `graph.instagram.com/access_token?grant_type=ig_exchange_token` · No PKCE (Meta family) |
| Scopes | `instagram_business_basic`, `instagram_business_manage_insights` — ❓ confirm exact current names |
| List content | ❓ |
| Content metrics | ❓ likely `views`/`reach`/`likes`/`comments`/`shares`/`saved`/`total_interactions` per media insights — varies by media type (photo/reel/carousel) |
| Account metrics | ❓ profile views, reach, follower count |
| Audience metrics | ❓ |
| New-content detection | Polling (no confirmed webhook for this use case) |
| Token lifetime | Short-lived (~1h) → long-lived (~60d) → self-refresh via `refresh_access_token` |
| Rate limits | ❓ |
| Review requirements | Meta App Review + Business Verification likely required for `instagram_business_manage_insights` in production |
| Known limitations | Metric availability varies significantly by media type and account size — never assume parity with Facebook Page insights |
| Docs | developers.facebook.com (exact current URL not re-verified) |
| Last verified | **Not verified this session** — flagged, not confirmed |

## TikTok

| | |
|---|---|
| Account type required | Standard TikTok account (no Business/Pro tier required) |
| API product | Login Kit (OAuth) + Display API v2 |
| OAuth | Authorize: `www.tiktok.com/v2/auth/authorize/` · Token: `open.tiktokapis.com/v2/oauth/token/` · **PKCE required** (S256) for Android |
| Scopes | `user.info.basic`, `user.info.profile`, `user.info.stats` (migrated from `user.info.basic` Feb 2024), `video.list` |
| List content | ✅ `POST /v2/video/list/` — cursor-paginated, ≤20/page |
| Content metrics | ✅ `POST /v2/video/query/` — `like_count`, `comment_count`, `share_count`, `view_count` via the *same* `video.list` scope. `favorite_count`/collects **not** in the field list — unavailable. |
| Account metrics | ✅ `GET/POST /v2/user/info/` — `follower_count`, `following_count`, `likes_count`, `video_count` |
| Audience metrics | ❌ No public API field for age/gender/country — Creator/Business Center UI only |
| New-content detection | Polling only — no webhook in Display API |
| Token lifetime | Access 24h · Refresh 365d, **rotates on each refresh** — must persist the newest value |
| Rate limits | 600 req/min per endpoint (sliding 1-min window) |
| Review requirements | Sandbox mode: no review needed, ≤10 test accounts/app. Production: formal app review, no published SLA |
| Known limitations | No audience demographics, no webhooks, no confirmed collects/favorites count |
| Docs | developers.tiktok.com/doc/tiktok-api-v2-video-query, /doc/tiktok-api-v2-get-user-info, /doc/oauth-user-access-token-management, /doc/tiktok-api-v2-rate-limit |
| Last verified | 2026-08-25 (live-fetched from official docs) |

## YouTube

**Status: ⚠️ implemented against well-established, stable Google API conventions, but not
re-verified via a fresh research pass this session** — treat quota numbers and scope names as
needing a spot-check against current docs before heavy production use.

| | |
|---|---|
| Account type required | Any Google account with a YouTube channel |
| API product | YouTube Data API v3 (implemented) + YouTube Analytics API (not implemented yet — watch time/retention/demographics) |
| OAuth | Authorize: `accounts.google.com/o/oauth2/v2/auth` · Token: `oauth2.googleapis.com/token` · PKCE supported; Android/installed-app client type is typically public (no client_secret) |
| Scopes | `youtube.readonly`, `yt-analytics.readonly` (latter unused until Analytics API is implemented) |
| List content | ✅ `playlistItems.list` on the channel's uploads playlist (1 quota unit — far cheaper than `search.list`'s 100 units) |
| Content metrics | ✅ `videos.list?part=statistics` — `viewCount`, `likeCount` (omitted entirely if creator disabled public likes — must render as unavailable, not 0), `commentCount`. `shareCount` is **not exposed** by the Data API. |
| Account metrics | Partial — `channels.list?part=snippet` implemented for identity only; subscriber counts not yet wired up |
| Audience metrics | ❌ not implemented — requires YouTube Analytics API (`reports.query` with `dimensions=ageGroup,gender` / country) |
| Watch time / retention | ❌ not implemented — requires YouTube Analytics API |
| New-content detection | Polling via `playlistItems.list` every worker run |
| Token lifetime | ~1h access token; refresh_token does not rotate (original keeps working) |
| Rate limits | Daily quota units, cost varies per call type — `playlistItems.list`/`videos.list` are cheap (1 unit), `search.list` is expensive (100 units) and deliberately avoided |
| Review requirements | Google OAuth verification (CASA security assessment) required to move `yt-analytics.readonly` out of testing mode for production use with external users |
| Known limitations | Shorts vs. regular video is not distinguished (Data API doesn't cleanly flag it — would need a `contentDetails.duration` heuristic, not implemented) |
| Docs | developers.google.com/youtube/v3, developers.google.com/youtube/analytics |
| Last verified | Not re-verified this session — implemented from stable, long-standing API conventions |

## Threads

| | |
|---|---|
| Account type required | Unclear from official docs whether a linked Instagram Business account is required — self-managed accounts (added as testers/admins on the app) don't need App Review regardless |
| API product | Threads API (separate from Instagram Graph API) |
| OAuth | Authorize: `threads.net/oauth/authorize` · Token: `graph.threads.net/oauth/access_token` · **No PKCE** (unconfirmed support, treated as unsupported) |
| Scopes | `threads_basic` (required for everything), `threads_content_publish`, `threads_manage_replies`, `threads_read_replies`, `threads_manage_insights` |
| List content | ✅ `GET /v1.0/{user-id}/threads` |
| Content metrics | ✅ `GET /v1.0/{media-id}/insights` — `views`, `likes`, `replies`, `reposts`, `quotes`, `shares` |
| Account metrics | ✅ `GET /v1.0/{user-id}/threads_insights` — time-series `views`; totals `likes`, `replies`, `reposts`, `quotes`, `followers_count`; link `clicks`. Data only available from 2024-04-13 onward. |
| Audience metrics | ✅ `follower_demographics` on the same endpoint, `breakdown=country\|city\|age\|gender` — **requires ≥100 followers** |
| New-content detection | Polling — no confirmed webhook for new posts |
| Token lifetime | Short-lived 1h → long-lived 60d via `graph.threads.net/refresh_access_token` (refreshable once ≥24h old, not after expiry) |
| Rate limits | API calls: 4800× impressions/24h (min floor 10); Posts: 250/24h; Replies: 1,000/24h |
| Review requirements | Not required for self-managed accounts (testers/admins on the app); required for Tech Provider apps serving other businesses |
| Known limitations | No demographic breakdown below 100 followers; no per-post demographic breakdown (account-level only) |
| Docs | developers.facebook.com/documentation/threads/{overview,get-started,insights,reference} |
| Last verified | 2026-08-25 (live-fetched from official docs) |

## Facebook

**🔴 Critical finding: professional-mode personal Profiles have NO official Insights API.**
Confirmed by direct research, not assumed: the Graph API's `/insights` edge is documented as
"insights for Facebook Pages and Page posts" only — there is no equivalent for a personal Profile
in professional/creator mode, even though the Facebook app shows those profiles an in-app
"professional dashboard". The only adjacent API (Facebook Creator Discovery API) is for *brand
apps discovering opted-in creators*, not self-service analytics for your own account.

**Action required before building this adapter further:** confirm whether your Facebook accounts
are actual Pages or professional-mode Profiles. If Profiles, mark Facebook `unsupported` in the
dashboard rather than building against it.

| | |
|---|---|
| Account type required | A real Facebook **Page** (not a professional-mode profile — see above) |
| API product | Graph API v23–26.x, Page Insights |
| OAuth | Facebook Login → exchange short-lived user token for 60-day long-lived token → `/{user-id}/accounts` for Page IDs + Page tokens |
| Scopes | `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `read_insights` |
| List content | ✅ `GET /{page-id}/posts`, `/{page-id}/videos` |
| Content metrics | ✅ `/{post-id}/insights` — reaction/engagement/video-view metrics; exact valid metric names change periodically (legacy `impressions`/`page fans` deprecated Nov 2025, more deprecations through mid-2026 — always check current names before shipping) |
| Account metrics | ✅ `/{page-id}/insights` — `page_impressions`, `page_post_engagements`, `page_fans`, `page_video_views`, `page_views_total` (current as of Aug 2026) |
| Audience metrics | ✅ demographic breakdowns, but suppressed below ~100 fans/data points |
| New-content detection | Polling (Page Webhooks exist separately for feed changes, not evaluated for this use case) |
| Token lifetime | Page tokens derived from long-lived user tokens; Meta explicitly warns lifetimes may change without notice — no fixed guarantee |
| Rate limits | Business Use Case limits: 4800 calls/24h × engaged-users-in-window; monitor via `X-Business-Use-Case-Usage` header |
| Review requirements | App Review for `read_insights`/`pages_read_engagement`/`pages_read_user_content`, gated behind Business Verification (start this early — it runs on its own timeline) |
| Known limitations | **No path at all for professional-mode Profiles** — this is the platform's real constraint, not a gap in this implementation |
| Docs | developers.facebook.com/docs/platforminsights/page/, /docs/graph-api/reference/insights/, /docs/permissions/reference/read_insights |
| Last verified | 2026-08-25 (live-fetched from official docs) |

## X (Twitter)

**🔴 Critical finding: no free tier as of Feb 2026.** Reading even your own posts' metrics now
requires a funded pay-per-use billing account (starts with a $500 free credit grant, then billed
per resource). There is also no audience-demographics endpoint at any tier — X's native Audience
Insights was discontinued in 2020 and never replaced in the API.

| | |
|---|---|
| Account type required | X Developer account + funded billing (pay-per-use, no subscription minimum) |
| API product | X API v2, pay-per-usage pricing |
| OAuth | Authorize: `x.com/i/oauth2/authorize` · Token: `api.x.com/2/oauth2/token` · **PKCE required**, confidential clients use HTTP Basic auth |
| Scopes | `tweet.read`, `users.read`, `offline.access` (for a refresh token) |
| List content | ✅ `GET /2/users/:id/tweets` — max 3,200 most recent posts, each call billed |
| Content metrics | ✅ `public_metrics` (likes, reposts, replies, quotes, bookmarks, impressions) — free at any tier. `non_public_metrics`/`organic_metrics` (impressions, video views, profile clicks) require the post author's own OAuth token and only work for posts ≤30 days old |
| Account metrics | Partial — only via `users/me` `public_metrics` (followers/following/tweet/listed counts); no dedicated account-analytics endpoint |
| Audience metrics | ❌ Not available at any tier — no API replacement since Audience Insights was discontinued |
| New-content detection | Polling only — each poll is a billed "post read", no confirmed free streaming tier for personal use |
| Token lifetime | Access ~2h; refresh_token ~6 months, **rotates on every use** — must persist the newest value each time |
| Rate limits | Tweet lookup 3,500/15min (app) or 5,000/15min (user); rate limits and billing are tracked **separately** — staying within rate limits does not mean it's free |
| Review requirements | Developer account + app approval (often instant) + a funded billing setup — this is the real gate, not App Review |
| Known limitations | No audience demographics ever; non-public metrics time-boxed to 30 days; cost applies per resource even for "owned reads" |
| Docs | docs.x.com/fundamentals/authentication/oauth-2-0/user-access-token, /x-api/getting-started/pricing, /x-api/posts/post-lookup-by-post-id, /x-api/fundamentals/rate-limits |
| Last verified | 2026-08-25 (live-fetched from official docs) |

## Cross-platform notes

- **Metrics that genuinely don't exist for a platform** (e.g. TikTok collects, YouTube shares, X
  audience demographics) must render as "Unavailable via API" in the dashboard — never as `0`.
  This is enforced structurally: every numeric column in `metric_snapshots` is nullable, and
  adapters must pass `null`, never `0`, for anything the platform's response doesn't include.
- **"Everything" (§56 of the product spec) means**: every metric the current official API and our
  granted permissions legitimately expose — not TikTok Studio/YouTube Studio's private UI numbers.
  Where a genuinely useful metric has no official API path (TikTok/X audience demographics,
  Facebook professional-profile analytics), the only legitimate long-term option is **manual entry**
  — an admin periodically types in what they see in the platform's own creator-studio UI, stored
  with `metric_source = 'manual'` in the same tables. Not yet built into the dashboard UI.
