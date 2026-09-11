# StoryNest

Personalized bedtime storybooks starring African and Western characters, built by Nigerian parents from guided templates. Next.js + Supabase + Paystack + Claude API.

## What's in this scaffold

```
storynest/
├── pages/
│   ├── index.js            Landing page
│   ├── login.js            Magic-link sign-in
│   ├── account.js          My Library — saved stories, subscription status
│   ├── subscribe.js        Subscription plan picker (Paystack recurring)
│   ├── characters.js       Character browser (filter, search, modal)
│   ├── story-builder.js    Template + character + fields + live preview
│   ├── preview.js          Watermarked story preview before purchase
│   ├── checkout.js         Order summary + Paystack inline payment (or subscription redemption)
│   ├── success.js          PDF download (client-side) + sharing
│   ├── premium-builder.js  Photo upload → custom character → multi-character story
│   └── api/
│       ├── generate-story.js               Basic tier: Claude writes a structured, illustration-ready story
│       ├── generate-story-premium.js       Premium tier: Claude writes structured pages
│       ├── generate-character-image.js     Batch-generates a custom character's pose set at upload
│       ├── get-or-generate-character.js    Cached library-character pose lookup/generation
│       ├── generate-location-background.js Cached per-story setting backgrounds
│       ├── generate-illustrations.js       Composites pre-selected references into each page
│       ├── library-characters.js           Bulk "neutral" pose lookup for browsing UI
│       ├── verify-payment.js               Paystack verify + PDF build + Storage + email + library save
│       ├── verify-subscription.js          Activates a subscription after its first charge
│       ├── redeem-subscription-story.js    Basic-tier story redemption for active subscribers
│       ├── story-pdf-url.js                Ownership-checked signed URL for a saved PDF
│       └── paystack-webhook.js             Authoritative webhook — orders AND subscription lifecycle
├── data/
│   ├── characters.js        30-character library
│   ├── templates.js         10 story templates
│   └── colorThemes.js       8 color presets
├── lib/
│   ├── supabaseBrowserClient.js   Browser-side client, auth only
│   ├── generateStoryPdf.js        Shared PDF builder (used client-side AND server-side)
│   ├── email.js                   Resend wrapper
│   ├── pricing.js, imageConfig.js, claudeConfig.js, imageStyle.js, characterPoses.js
├── supabase/schema.sql      Run this in the Supabase SQL editor
├── styles/globals.css
└── .env.example
```

The story flow is: **characters → story-builder → preview → checkout → success**. Draft data is passed between story-builder/preview/checkout via `sessionStorage` (clears when the tab closes). Login is a separate, optional flow — `/login → /account` or `/login → /subscribe` — that only matters for persistent library access and subscriptions; it doesn't sit in the main purchase path.

---

## 0. Basic tier is now a fully illustrated book too

This is a deliberate scope change from how the project started. Originally, Basic tier was text-only by design — the whole point was zero image-generation cost, since the brief's margin math assumed only a Claude API cost per Basic story. **That's no longer true.** Both tiers now produce a fully illustrated book, using the exact same pipeline: structured story generation (title + per-page pose/location/shot from Claude), cached location backgrounds, and per-page illustrations composited from selected — never freshly generated — character references.

**Premium's only remaining differentiator is the custom photo character.** Basic tier picks one of the 30 library characters (illustrated using their cached pose set — see "Character art" below); Premium lets a parent upload their own child's photo to generate a custom character instead. Everything downstream — structured story generation, location caching, pose selection, illustration compositing, the PDF layout — is now identical code shared by both tiers (`generate-story.js` and `generate-story-premium.js` remain separate routes for clarity, but produce the same shape and drive the same `generate-illustrations.js`).

**Why this is more affordable than it sounds for Basic tier specifically:** a library character's art is cached and shared across *every* Basic customer who picks that character, not generated per purchase. The first parent who picks "Kemi, happy, at a market" pays for that generation; every later parent who gets a similar scene reuses it for free. Premium's custom photo character has no equivalent — it's unique per family by definition, so every pose is a fresh generation cost every time. This is why Basic tier absorbing real illustration cost doesn't erase its cost advantage over Premium; it narrows it, but the caching model is fundamentally different between the two.

**Pricing has NOT been re-derived for this change.** The `lib/pricing.js` cost comments (₦925–₦1,915 per Premium book) predate this pivot and don't yet account for Basic tier's own image-generation cost, even though it's shared/cached. Basic's ₦3,000/₦5,000/₦7,000 prices are almost certainly still fine — the caching model means steady-state marginal cost per Basic book should stay low once a character's common poses/locations are warmed up — but "almost certainly fine" isn't the same as "verified," and this should be re-checked against real usage data once the library has real traffic, the same way Premium's costs were worked through explicitly.

## 1. Local setup

```bash
npm install
cp .env.example .env.local   # then fill in real keys, see steps below
npm run dev
```

Visit `http://localhost:3000`.

## 2. Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. Go to **SQL Editor → New query**, paste the contents of `supabase/schema.sql`, and run it. This creates `profiles`, `stories`, `orders`, and `characters` tables with row-level security enabled.
3. Go to **Project Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret — it's only used server-side in the API routes)
4. (Optional, for accounts/subscriptions) Enable **Authentication → Providers → Email** for parent sign-up/login.

## 2.5 Pricing strategy — book length, not a flat rate

Both tiers now price against **book length**, not a single flat number. `lib/pricing.js` defines three shared page-count tiers — `short` (5 pages), `standard` (10), `long` (15) — each with its own Basic and Premium price, spread across the brief's original ranges (Basic ₦3,000–₦7,000, Premium ₦12,000–₦25,000).

**Why tiers instead of literal per-page billing:** true per-page metering was considered and rejected for v1. Claude's actual page count drifts a page or two from what was requested, which would mean recalculating the price live at checkout against a number the parent didn't choose — a worse experience for a marginal accuracy gain. Fixed ranges keep checkout predictable: the parent picks "10 pages" and pays the 10-page price, full stop, even if the story comes back as 9 or 11.

**Where it's wired in:**
- `story-builder.js` and `premium-builder.js` both show a book-length picker (using the same `PAGE_TIERS`) with the price for that tier shown right on the button.
- `generate-story.js` and `generate-story-premium.js` both take the resulting target page count and steer Claude's word count and page count toward it (a paragraph or two of drift is expected and fine).
- `checkout.js` prices off `draft.pageTier`, and `verify-payment.js` records both `page_tier` and the actual `page_count` Claude returned on the `orders` row — so you can see after the fact how often actual length matched what was sold, and re-tune the tiers or the prompt if it drifts a lot.

**Before launch:** a cost check done September 2026 (see the full breakdown in `lib/pricing.js`) found these placeholder prices actually hold up well — Premium's variable cost per book runs roughly ₦925–₦1,915 across the three tiers at "medium" image quality, against ₦12,000–₦25,000 prices, which is comfortably over 90% gross margin even before Paystack fees. That's not a guarantee it'll still hold by the time you launch — OpenAI's per-image rates, Anthropic's per-token rates, and the USD/NGN exchange rate all move, sometimes quickly for the naira specifically — so re-run the math in `lib/pricing.js`'s comments against current numbers before finalizing, but there's no evidence right now that these six numbers need to change.

## 3. Paystack setup

1. Create an account at [paystack.com](https://paystack.com) and complete business verification (needed before you can go live — test mode works immediately).
2. Go to **Settings → API Keys & Webhooks** and copy the **test** public/secret keys into `.env.local`:
   - `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`
   - `PAYSTACK_SECRET_KEY`
3. In the same page, set the **Webhook URL** to `https://your-domain.vercel.app/api/paystack-webhook` (you'll only be able to fill this in after your first Vercel deploy — come back to it).
4. Test cards for test mode are listed in Paystack's docs (search "Paystack test cards") — use one of those in the checkout flow before going live.
5. When ready for real payments, swap in the **live** keys and re-point the webhook URL to your production domain.

**Payment integration:** `checkout.js` and `subscribe.js` load Paystack's **Inline JS v2** (`https://js.paystack.co/v2/inline.js`) directly via `next/script` and call `new PaystackPop().newTransaction({...})` — not the `react-paystack` npm package. That package hasn't been updated in ~2 years and only implements Paystack's older v1 popup API (`PaystackPop.setup({callback, onClose}).openIframe()`); at some point Paystack's own v1 script became incompatible with it, surfacing as a browser console error — `Uncaught Error: Attribute callback must be a valid function` — that looks like a config problem but isn't. If you ever see that exact error again, check whether Paystack has moved on to a v3 API before assuming your keys are wrong.

**A related lesson baked into this repo now:** every earlier zip of this project had `package-lock.json` deliberately stripped out before packaging (to keep downloads smaller), which meant Vercel installed whatever the *newest* version matching each `^x.y.z` range happened to be at build time — not necessarily the exact version tested locally. That specific mismatch turned out not to be the cause of the Paystack bug above (the semver range only ever resolved to one version either way), but it's exactly the kind of thing that silently causes "works locally, breaks on Vercel" bugs, so `package-lock.json` is now committed and should stay committed — run `npm ci` instead of `npm install` in any environment where reproducing the exact tested dependency tree matters.

## 4. Anthropic (Claude API) setup

1. Get an API key from [console.anthropic.com](https://console.anthropic.com).
2. Set `ANTHROPIC_API_KEY` in your environment. The story routes call `claude-sonnet-5` (set in `lib/claudeConfig.js`) — check `console.anthropic.com` for current model names and pricing before you deploy, in case they've changed since this was written.
3. Budget: Claude cost per book is negligible regardless of page tier — a few hundred to ~2,000 tokens depending on length, roughly ₦8–₦30 per book at current rates (see the worked estimate in `lib/pricing.js`). It's not the cost driver for either tier; Premium's image generation is (see "Premium tier setup" below).

**A real bug worth knowing about if you're on Claude Sonnet 5 or later:** these models default to **adaptive thinking** — internal reasoning that draws from the same `max_tokens` budget as the actual response, before any response text is written. An earlier version of both story routes budgeted `max_tokens` far too tightly (scaled only by page count, capped at 4000), which — combined with thinking silently eating into that same budget — caused real, observed truncation: a 5-page book's JSON response got cut off mid-sentence with the JSON object never closed. Both routes now explicitly pass `thinking: { type: "disabled" }` (this task doesn't need chain-of-thought reasoning) and use a much more generous budget (`Math.min(8000, 1800 + targetPages * 420)`). Both routes also now check Anthropic's own `stop_reason` field for `"max_tokens"` and return a specific, distinguishable error if a response is ever truncated again — if you see that error in the logs, raise the budget further rather than assuming it's a JSON-formatting bug.

## 5. Character art — pre-generated once, selected per story (never recreated)

**Visual style:** `lib/imageStyle.js` targets semi-realistic, painterly illustration — dimensional shading, detailed hair and fabric texture, warm natural lighting — deliberately short of flat cartoon on one side and literal photorealism on the other. The "never indistinguishable from an actual photograph" constraint is intentional, not just an aesthetic choice: these renders come from real children's photos, and a photorealistic render of a real child is a meaningfully more sensitive thing to generate than a painted likeness — most image-API providers restrict it outright. If you adjust `STYLE_GUIDE`, keep that boundary; push richer rendering (more detail, better lighting, more texture) rather than more photographic accuracy.

Each of the 30 characters in `data/characters.js` gets a small, **fixed set of poses** (see `lib/characterPoses.js`: neutral, happy, worried, determined, helping, thinking) generated once per pose, the first time any story needs it — not as a manual upfront batch job, and never regenerated after that. Building a story never triggers new art for a library character; it only **selects** the cached pose that best matches each page's scene. That selection is made by Claude itself, as part of writing the story — `generate-story-premium.js` asks for a `"pose"` field on every page alongside the text and illustration prompt, since the model already understands each scene's emotional beat far better than matching keywords after the fact. A lightweight keyword matcher (`selectPose()` in `lib/characterPoses.js`) exists purely as a fallback for the rare case where Claude's returned value is missing or invalid.

- **Basic tier:** the character browser (`/characters`), story builder, and landing page show the cached `neutral` pose instead of a placeholder initial, generating it on first view if it isn't cached yet.
- **Premium tier:** when a parent picks a library character as the *supporting* character, `/premium-builder` computes the best-fit pose for every page of the generated story, resolves each **unique** pose needed (usually just 2–4 out of the 6, even across a 12-page book), and feeds the right one into that page's illustration call alongside the custom character. The library character is never regenerated mid-story — only the main custom character (unique to that family) is freshly illustrated on every page.

**How it works:**
1. `lib/characterPoses.js` — the fixed pose list and the keyword-matching selector.
2. `pages/api/get-or-generate-character.js` — checks `library_character_poses` for a cached `(characterId, poseId)` image; if missing, generates one via OpenAI text-to-image (`images/generations`) using the character's description plus that pose's prompt, uploads it to the public `library-characters` Storage bucket, and caches it. Every later request for the same pair returns the identical cached image.
3. `pages/api/library-characters.js` — returns the `neutral` pose for every cached character, for pages that just need one portrait.

**Cost note:** worst case is 30 characters × 6 poses = 180 one-time generations, and in practice far fewer poses get used since most stories only touch 2–4 emotional beats. After that, every future story reusing a character/pose combination costs nothing extra for that character — the only per-story image cost is the unique custom character.

If you'd rather pre-generate everything upfront instead of lazily: loop over `data/characters.js` × `POSES` and `POST` each pair to `/api/get-or-generate-character` from a one-off script before launch.

## 6. Premium tier setup (photo → custom character → illustrated story, with the library)

The Premium flow lives at `/premium-builder` and is linked from the landing page's Premium pricing card.

**What it does:** parent uploads a photo → `pages/api/generate-character-image.js` generates the child's **entire pose set in one batch, right then** (all 6 poses from `lib/characterPoses.js` — neutral, happy, worried, determined, helping, thinking), using the photo only once to make the neutral pose and deriving every other pose from that generated cartoon, never the photo again → parent optionally picks a **supporting character from the same 30-character library** → parent fills in a longer story form → `pages/api/generate-story-premium.js` asks Claude for 8–12 structured pages, each with its own illustration prompt AND a `pose` field chosen from that same fixed set, based on the scene's emotional beat → `/premium-builder` resolves that pose for **both** characters — the custom character's pre-generated pose (already in hand from upload) and the library character's cached pose (via `/api/get-or-generate-character`, generating that one pose only if truly nobody has ever needed it) → `pages/api/generate-illustrations.js` composites the two pre-selected references into one scene per page. **Nothing about either character is generated mid-story — only the combined scene is new.** Everything lands in `/preview`, `/checkout`, and a richer PDF in `/success`.

This is the same non-negotiable-consistency rule for both characters: a character's appearance in each pose is fixed once (at upload for the custom character, on first use for a library character) and only ever selected from after that. And because Claude assigns the same `pose` id to a page for the *story*, not per-character, both characters end up emotionally in sync too — both "worried" on the problem page, both "happy" on the resolution.

**Setup:**
1. Get an `OPENAI_API_KEY` from [platform.openai.com](https://platform.openai.com) and add it to your environment. The image routes call `gpt-image-1.5` (set in `lib/imageConfig.js`, along with the quality tier) via the `images/generations` and `images/edits` endpoints — the older `gpt-image-1` is scheduled for deprecation on October 23, 2026, so check OpenAI's docs before launch in case the model landscape has shifted again since.
2. In Supabase, the storage buckets and tables are created automatically by `supabase/schema.sql`. If you ran the schema before this update, re-run the full file — every statement is written to be safe to re-run, including policies (each is preceded by a matching `drop policy if exists`, since Postgres has no native "create policy if not exists" — an earlier version of this file didn't do this and re-running it threw "policy ... already exists").
3. No changes needed to Paystack — Premium just charges a different amount (`PRICES_NAIRA.premium` in `pages/checkout.js`, currently ₦18,000 as a placeholder inside the brief's ₦12,000–₦25,000 range).

**Privacy — read before launch:** the child's original uploaded photo is used exactly once, in-memory, inside `generate-character-image.js`, to generate the neutral pose — it is never written to disk, never sent to Supabase, and every other pose is derived from the *generated cartoon*, not the photo. Only the generated cartoons (one per pose) are stored, in the public `custom-characters` bucket. Make sure your terms of service tell parents this, and that the account creating the photo is the parent/guardian's own — this product should only ever be used by a parent uploading their own child's photo, not a third party's.

**Known limitations to budget for before a real launch:**
- **Pose selection relies on Claude following the schema.** Every page's `pose` value is validated against the fixed list server-side, with a keyword-match fallback if it's ever missing or invalid — so a bad value can't silently break illustration generation, but it can occasionally fall back to a less accurate "neutral" for one page. Worth spot-checking a handful of generated stories to see how often the fallback actually triggers.
- **Multi-image editing support varies by API version.** `generate-illustrations.js` sends multiple reference images via repeated `image[]` fields to `gpt-image-1.5`'s edit endpoint — check OpenAI's current docs before deploying, since multi-image editing support has changed across versions.
- **Upload-time cost is now upfront, not spread out.** Generating all 6 poses at upload costs roughly 6x what a single-pose approach cost, paid whether or not the parent finishes the story — a meaningful trade-off for guaranteed per-page consistency. If a parent abandons the flow after uploading a photo, that cost is already spent. Consider only generating the poses Claude actually asks for across the story's pages instead of all 6 unconditionally, if this turns out to matter for margin.
- **Image API cost is real and separate from the Claude bill, but currently well within margin.** At the "medium" quality tier set in `lib/imageConfig.js`, a full Premium book runs roughly ₦925 (short/5 pages) to ₦1,915 (long/15 pages) in OpenAI image costs — see the worked estimate in `lib/pricing.js`. That leaves comfortable margin against the current prices even at "high" quality (roughly triples the cost, still ~77% margin). The per-reference-image input-token component of that estimate is approximate; verify against a real API call before treating the exact numbers as final. `IMAGE_QUALITY` in `.env` lets you drop to "low" for development so testing doesn't run up flagship-tier costs.
- **Serverless timeouts, twice over now.** Both `generate-character-image.js` (6 poses at upload) and `generate-illustrations.js` (up to 12 scenes) batch requests concurrently and request the longest duration your plan allows, but neither is guaranteed to fit inside Vercel Hobby's function limit. For a fully reliable production version, move both to background jobs with the browser polling a status endpoint instead of waiting on one long request.
- **Content moderation.** Nothing here moderates the uploaded photo or the generated output. Add a moderation check (most image APIs offer one, or use a separate moderation endpoint) before you accept arbitrary public uploads.

## 6.5 Setting consistency — the same location looks the same every time

Characters aren't the only thing that needs to stay consistent for a child to follow a story — the market on page 3 has to be recognizably the market again on page 9, not a different market that happens to share a name. This works the same way as character pose caching, applied to environments:

1. `generate-story-premium.js` asks Claude to identify the DISTINCT physical settings a story actually visits (usually 2–4 for an 8–12 page book) under a top-level `locations` map — one rich description per location — and tag every page with which `location_id` it's set in. The same location returns the same id; Claude is instructed not to invent a new one for a place it's already visited.
2. `/premium-builder` resolves ONE background image per distinct `location_id`, via `pages/api/generate-location-background.js`, which caches it in the `story_locations` table keyed to that story's `customCharacterId` — generated once, the first time that location is needed, reused for every other page at the same location.
3. `pages/api/generate-illustrations.js` now takes an optional `setting` reference alongside the character references, and instructs the model that the background must match that reference exactly — same architecture, colors, layout, lighting — while the characters' action and the camera framing are free to vary.

A `shot` field (`wide` / `medium` / `close`), also chosen by Claude per page, keeps the framing varied across the book — without a hint like this, image models tend to default to the same centered medium shot every time, which is part of why an unguided illustrated book can feel visually monotonous even when everything else is consistent.

**Scope note:** this caching is per-story (keyed to `customCharacterId`), not shared globally like the 30 library characters — "the market" in one family's book has no reason to look identical to "the market" in a different family's book. That's a deliberate choice, not a limitation: a shared global location cache would only make sense if you wanted every StoryNest book set in "a Lagos market" to literally share one background, which isn't the goal.

**Known limitation:** the background reference constrains style and content strongly, but `gpt-image-1.5`'s edit endpoint is still regenerating the whole image each time — architectural details (an exact building shape, a specific stall's position) can still drift more than a human illustrator reusing literal background art would. This is a meaningfully better starting point than no reference at all, but worth checking against real generated output before promising pixel-level environment consistency to parents.

## 6.7 Accounts & subscriptions setup

Login is optional — one-off Basic and Premium purchases work fully as a guest, no account needed. An account only matters for two things: a persistent "My Library" of past purchases, and the subscription tier (unlimited Basic-tier stories).

**Auth approach:** Supabase Auth with email magic links — no passwords to manage. `lib/supabaseBrowserClient.js` is the browser-side client used only for auth (session checks, sign-in, sign-out); it never touches the database directly, all data access still goes through server-side API routes with the service-role key.

**Setup:**
1. In Supabase, go to **Authentication → Providers** and confirm **Email** is enabled (it is by default).
2. Go to **Authentication → URL Configuration** and set your **Site URL** (e.g. `https://your-domain.vercel.app` or `http://localhost:3000` for local dev) and add it to **Redirect URLs** — magic links won't redirect back correctly otherwise.
3. `supabase/schema.sql` includes a trigger (`handle_new_user`) that automatically creates a `profiles` row the moment someone signs up — no manual profile-creation step needed.
4. For subscriptions: in the Paystack dashboard, go to **Payments → Plans** and create **three** plans, all billed **monthly**, one per Basic-tier page length — matching `lib/pricing.js`'s `SUBSCRIPTION_PRICING_NAIRA`:
   - "StoryNest Short" — ₦9,000/month
   - "StoryNest Standard" — ₦15,000/month
   - "StoryNest Long" — ₦21,000/month

   Copy each plan's code into `NEXT_PUBLIC_PAYSTACK_PLAN_SHORT` / `_STANDARD` / `_LONG`.
5. `/subscribe` uses Paystack's inline `plan` parameter, which charges the plan's own price and sets up recurring billing automatically — no manual subscription-management code needed on your end for renewals.

**Why per-page-tier plans, each capped at 5 books/month, instead of one flat "unlimited" plan:** the original design was a single ₦8,000/month plan with no book limit at all, priced back when Basic tier was text-only and cost nothing per book. Once Basic tier started generating real illustrations (see "Basic tier is now illustrated too" below), that flat unlimited promise became a real, quantified financial risk — a subscriber doing 15-page books nightly would break even on that one subscription in about 9 books, comfortably within a single month of regular use. Each plan is now priced at roughly 3x that page length's a la carte price for up to `SUBSCRIPTION_MAX_BOOKS_PER_MONTH` (5) books — "pay for 3, get up to 5" — which holds ~78-79% margin even if a subscriber uses every book in the period, and works out to a consistent ~40% savings versus buying 5 books individually, which is the actual reason to subscribe.

**A subscription only covers its own page length.** A "short" subscriber redeeming a "long" book gets billed for it individually — `checkout.js`'s `subscriptionCovers` check (and the authoritative server-side check in `redeem-subscription-story.js`) verifies `subscription_page_tier` matches the book being redeemed, not just that a subscription exists at all. This also means an account can only be subscribed to one page tier at a time — the UI doesn't currently offer an upgrade/downgrade flow; subscribing to a different tier while one is active just overwrites it, an accepted simplification rather than a deliberately designed transition path.

**How subscription state stays in sync:** `/api/verify-subscription` activates the subscription on first payment, storing the chosen `subscription_page_tier` and resetting `subscription_books_used_this_period` to 0. After that, Paystack renews the charge automatically and fires webhook events — `pages/api/paystack-webhook.js` listens for `charge.success` (with a `plan` present, meaning it's a renewal, not a one-off order — this now also resets the books-used counter, since a new billing period has been paid for), `subscription.disable` / `subscription.not_renew` (cancellation), and `invoice.payment_failed` (mark `past_due`) — and updates `profiles` accordingly, matched by `paystack_customer_code`.

**Known limitation, unchanged from before:** subscription coverage is Basic-tier only — Premium's per-story image-generation cost is high enough that even a capped flat-fee plan doesn't have the same margin cushion this cost model relies on, so it stays a la carte only for now.

## 6.8 Email delivery setup

Order confirmations are sent via [Resend](https://resend.com), with the actual PDF attached — not just a "your story is ready" notice.

**Setup:**
1. Create a Resend account and get an API key from **API Keys**.
2. Verify a sending domain under **Domains** (Resend rejects sends from unverified domains) and set `RESEND_FROM_EMAIL` to an address on that domain, e.g. `StoryNest <hello@yourdomain.com>`. For local testing before you've verified a domain, Resend's own `onboarding@resend.dev` sender works without verification but is rate-limited and not meant for production.
3. Set `RESEND_API_KEY`. If it's unset, `lib/email.js` logs a warning and skips sending instead of failing the request — so local dev without email keys still works end to end, it just won't actually send.

**Where it's wired in:** both `/api/verify-payment` (one-off purchases) and `/api/redeem-subscription-story` (subscription redemptions) build the PDF server-side via `lib/generateStoryPdf.js` — the same layout `success.js`'s "Download PDF" button produces, refactored into one shared function so the two can't drift apart — and attach it to the confirmation email.

**Layout:** a cover page (character portrait — real cached art if available, a colored initial-circle fallback otherwise — title, "Starring X"), then one page per story page, each with its illustration, a thin accent-colored bar top and bottom, and a page-number footer, matching the site's own visual identity rather than reading as plain black-text-on-white. Both tiers share this exact layout now — see "Basic tier is now illustrated too" below. Title wrapping is measured (`doc.splitTextToSize`), not assumed at a fixed line count — an earlier version placed the "Starring X" subtitle at a hardcoded y-position that overlapped a title long enough to wrap to two lines.

**A cross-environment bug fixed alongside the layout work:** this function returns a `Uint8Array`, not a Node `Buffer` — `Buffer` isn't a standard browser global and isn't polyfilled by this project's webpack config, so an earlier version that returned/expected a `Buffer` would have worked from the server (email attachments) but could have silently broken the client-side "Download PDF" button in a real browser. `uint8ArrayToBase64()` (also exported from this file) replaces `.toString('base64')` everywhere a `Buffer`-only method was previously assumed.

**Known gap:** if `/api/verify-payment` is never called (the parent closes the tab right after paying, before the client-side call completes) and the order only gets confirmed later via `/api/paystack-webhook`, no email goes out — the webhook handler only has the Paystack event data, not the story draft content needed to build a PDF. This is a real gap, not just a hypothetical: it means a parent who closes their browser at exactly the wrong moment gets charged but never receives their book by email (their `orders` row still gets marked `paid` correctly, so nothing is lost from a bookkeeping standpoint — but the delivery step doesn't retry). Fixing this properly needs the draft to be persisted server-side *before* payment (e.g., saved to Supabase keyed by the Paystack reference) so the webhook has something to build a PDF from — that's a real architecture change, not a quick patch, and isn't done here.

## 6.61 Second occurrence of the framing bug — and an honest limit on prompt engineering

After the head-cropping fix (below) and a real regeneration confirmed it worked for Adaeze, a different character (Ikenna) came back from that SAME regeneration batch with his **feet** cropped instead — confirmed by scrolling the raw image file, ruling out a browser-viewport false alarm first. Same underlying tension, different edge: "full body visible" and "leave margin everywhere" compete with each other in the prompt, and an image model doesn't satisfy compound spatial instructions with 100% reliability — it can satisfy "large, recognizable figure" at the expense of "margin on every edge," inconsistently, character to character.

**The prompt in `lib/characterPoses.js` is now more explicit and quantified** — a specific height percentage (character occupies no more than 70% of frame height), explicit mention of feet and shoes by name (not just "any part of the body"), and explicit "must never touch or extend past any edge" language. This is a real improvement, but **it should not be treated as a guarantee** — it's prompt engineering against a probabilistic model, and a specific generation can still occasionally come out wrong even with a well-written prompt. The practical, expected workflow going forward: if a specific character/pose comes out cropped, force-regenerate just that one via `/api/admin/regenerate-characters` (see below) — a fresh generation is a new roll of the dice and will often come out fine — rather than treating every individual bad result as a reason to rewrite the prompt again. Only revisit the prompt itself if the SAME failure mode keeps showing up across many different characters, which would suggest a systemic issue rather than normal generation variance.

## 6.61.6 Illustration style choice: painterly, watercolor, 3D, and a coloring page

Style used to be one fixed constant (`STYLE_GUIDE` in `lib/imageStyle.js`), shared by every image-generation call in the app. It's now a set of four named styles in `lib/imageStyle.js` (`STYLES`), and the parent picks one before generating: **Painterly** (the original look), **Watercolor**, **3D**, and **Coloring page** — genuinely different from the other three, since it's meant to be printed and physically colored in by the child, not a "look," which is why its prompt explicitly forbids any color, shading, or gray tones rather than just describing a different rendering technique.

**Style has to thread through the entire pipeline, not just one call** — a character generated in one style illustrated into a background generated in a different style would look broken. Every route that touches an image now accepts a `styleId` (defaulting to `"painterly"` everywhere, so nothing breaks for existing integrations that don't pass it): `generate-character-image.js`, `get-or-generate-character.js` / `lib/generateLibraryCharacterPose.js`, `generate-location-background.js`, `generate-illustrations.js`, and the admin bulk-regeneration route.

**Library character caching gained a real new dimension.** The same character in the same pose now needs to exist separately per style — a painterly Adaeze and a 3D Adaeze are different cached images, not the same one re-styled. `library_character_poses`'s primary key changed from `(character_id, pose_id)` to `(character_id, pose_id, style_id)`, with a safe migration for existing rows: they default to `'painterly'`, which is factually correct — every image generated before this feature existed was, in fact, painterly, since it was the only style that existed at the time. Storage filenames gained the same suffix (`adaeze_neutral_painterly.png`, not `adaeze_neutral.png`) to avoid collisions.

**A real bug caught before it shipped, not after:** `library-characters.js` — the bulk endpoint every character grid in the app uses — queried `pose_id = "neutral"` with no style filter. Once a character exists in more than one style, that query would match multiple rows per character, and the `.forEach` loop building the result map would silently overwrite the entry with whichever row happened to come back last — meaning the same grid could show a different style on every page load depending on query ordering, with no error and no obvious symptom. Fixed by adding a required style filter (still defaulting to `"painterly"` for every existing caller that doesn't pass one).

**A second bug caught in the same pass:** in `story-builder.js`'s draft construction, `characterImageUrl` originally fell back to `libraryImages[characterId]` (the bulk-fetched, always-painterly thumbnail) *before* the freshly-resolved, correctly-styled pose URL. That ordering meant picking a non-painterly style could still show a painterly cover — fixed by reversing the priority so the correctly-styled resolution always wins.

**Where style gets chosen differs by tier, deliberately:** Basic tier picks style alongside book length, orientation, and color theme, since a library character can be resolved in any style at any time. Premium picks it in Step 1, *before* the "Generate character" button — because a custom character's style is baked in across all 6 poses at generation time, the same way their face and outfit are, and can't be changed afterward without a full regeneration.

**One deliberate non-change:** the coloring-page style doesn't get a special PDF layout. The theme-colored text caption band still appears at the bottom of each page exactly as it does for the other three styles — it's a separate caption layer, not part of the illustration itself, and the actual colorable canvas (the illustration area, pure white background with line art per the style's own generation prompt) is untouched. This wasn't tested against a real coloring-page book, so it's worth a look once one exists — if the colored band feels wrong on a page meant to be printed and colored by a child, that's a legitimate follow-up, not something assumed to be fine.

## 6.61.7 Text size and an honest limit on outfit consistency

Feedback on the first real generated book ("Tech Bro"): story-page text was too small, and the character's outfit wasn't perfectly consistent across pages. Two different kinds of fix:

**Text size — a real, verifiable fix.** Story-page body text was 14pt, small for a children's book meant to be read aloud or potentially printed. Increased to 17pt (and the back-cover blurb from 11pt to 13pt, for consistency), with the line-height values that were previously hardcoded as duplicate magic numbers (once for the band-height calculation, once for the actual per-line draw position) now sharing a single variable so they can't silently drift out of sync again. Verified against the actual paragraph lengths from the real generated book — confirmed both that the PDF still generates correctly (right page count, no band-overflow issue) and, checking the raw PDF content stream directly, that the new 17pt size is genuinely present in the output, not just set in a variable that never got applied.

**Outfit consistency — strengthened, but not "fixed" the way the cropping bug was.** Unlike the framing issue, there is no equivalent structural fix available here (nothing like "switch to a portrait canvas" removes the underlying tension). Feeding a reference image into `gpt-image-1.5`'s edit call is the best available consistency mechanism without a fine-tuned/LoRA model or a dedicated "consistent character" API feature — and it's fundamentally best-effort. The real generated book showed outfit details drift slightly page to page even with an explicit "match exactly" instruction already in the prompt. The wording in `generate-illustrations.js` is now more emphatic and specific (naming outfit colors and design explicitly, saying "not a reinterpretation or a similar-looking substitute"), which may help at the margin — but this should not be presented to users as guaranteed pixel-perfect consistency, because it genuinely isn't, before or after this wording change.

## 6.61.8 A real middle ground: placement, not redesign

Two real architectures were weighed for character consistency, and neither was picked by default without thinking through the tradeoff:

- **True pixel-level compositing** (cut the character out of their cached reference image, paste them onto the setting programmatically) would guarantee identical pixels every single time — but locks every scene into whichever of the 6 fixed static poses covers it, with no way to show a character reaching for something specific, sitting on a particular object, or interacting with another character beyond what the pose library anticipates. That's a real, meaningful loss of narrative flexibility, not a minor one — most of what makes these illustrations feel like a real story (specific, scene-appropriate actions) would go away.
- **Reframing the AI prompt as a placement task, not an illustration task** — this is what got implemented. The previous prompt asked the model to "illustrate a scene featuring this character," which invites the model to redesign them fresh each time, guided loosely by the reference. The new prompt explicitly states the character is already fully designed and the model's only job is to place them, unchanged, into a new scene — a genuinely different instruction, not just more emphatic wording of the same one. Verified the actual generated prompt text is grammatically correct for both single-character and two-character scenes (the phrasing has to pluralize correctly — "is already fully designed" vs. "are already fully designed" — which was tested directly rather than assumed).

This keeps full narrative flexibility while pushing the model toward literal preservation rather than reinterpretation. **It's still best-effort** — there's no way to fully verify from here whether this reframing meaningfully reduces drift without a real generation to compare against the "Tech Bro" book that prompted this whole investigation. If it doesn't help enough once tested, the fixed-pose compositing approach above is the documented next option — but it should be a deliberate choice made after seeing this attempt's real results, not a default fallback.

## 6.61.5 The real fix: portrait canvas, not more prompt wording

Two rounds of prompt-only fixes (margin language, then a quantified height percentage) each solved one specific case and left the underlying problem intact — a character with good head margin still had feet cropped tight against a square frame's bottom edge, confirmed by direct pixel inspection after redeploying and regenerating with the latest prompt. The actual issue was never the wording: asking a model to fit a tall, narrow human figure into a perfectly square frame with margin on every side is an awkward request regardless of how it's phrased, and a model won't satisfy that tension with 100% reliability no matter how precisely you ask.

**The structural fix**: character poses (both library characters and Premium's custom photo-based character) now generate on a **1024×1536 portrait canvas** instead of square 1024×1024 — a shape a standing figure actually fits into comfortably, removing the tension instead of continuing to negotiate around it. This only applies to isolated character portraits; full illustrated *scenes* (`generate-illustrations.js`'s composited story pages) stay square, since a scene's camera framing (already handled by the `shot` field — wide/medium/close) doesn't have this specific problem the way a body portrait does.

**What had to change to support this:** `lib/generateStoryPdf.js`'s full-bleed image renderer (`drawFullBleedImage`) previously hardcoded `1024x1024` for its cover-fit scaling math — now it takes the real source dimensions as parameters, with the cover and back-cover pages (portrait character art) passing `1024, 1536` and story pages (square scene art) using the `1024, 1024` default. Verified with a real test PDF mixing both — a portrait cover, a portrait back cover, and two square story-page images in the same document — confirming the cover-fit math handles both aspect ratios correctly without distortion or a crash from the mismatch.

**One assumption not verified live**: `generate-illustrations.js` feeds character reference images (now portrait) alongside setting/background references (still square, from `generate-location-background.js`'s existing `1536x1024` landscape) into the same edit call that outputs a square scene. There's no code-level issue with mixed input aspect ratios — reference images are just passed through as raw bytes — but whether OpenAI's edit endpoint handles a mix of portrait and square *reference* images gracefully when compositing is something that can only be confirmed against a real API call, not from code alone.

## 6.62 Force-regenerating already-cached characters after a prompt fix

Every prompt improvement in this project (the framing/margin fix in `lib/characterPoses.js`, the style-guide changes, etc.) only affects images generated *after* the fix — that's the entire point of the pose-caching system (generate once, reuse forever), but it also means a character generated before a fix stays wrong forever unless something explicitly tells it to redo itself. This surfaced as a real, confusing back-and-forth: CSS padding/`object-fit` changes were made in response to what looked like a cropping bug, none of which could possibly have fixed it, because the crop was baked into the actual image file, generated under an older, since-fixed prompt. Confirmed by opening the raw image file directly (bypassing all page CSS) and seeing the crop was already there.

**The fix, and a real security gap closed while building it:** `/api/get-or-generate-character.js` already supported a `force: true` flag to bypass the cache and regenerate — but with **no protection at all**. Anyone who found the URL could have called it repeatedly with `force: true` and run up real OpenAI costs on demand. It now requires an `ADMIN_SECRET` header for any forced regeneration; normal (unforced) lookups — the vast majority of calls, from the app itself — still need no auth, since those only ever read cache or generate something that never existed.

**New: `/api/admin/regenerate-characters`** — bulk-regenerates a specific, named list of `(character, pose)` pairs, reusing the exact same generation logic as the single-pose route (extracted into `lib/generateLibraryCharacterPose.js` so the two can't drift apart). Deliberately requires you to name which characters to redo rather than offering a "regenerate everything" button — every regeneration is a real, billed call, and this should only ever be run against characters you've actually seen a problem with. Caps at 40 character×pose combinations per request and rejects an oversized request before making any OpenAI calls, to avoid an accidental massive bill from one malformed request.

**To use it:**
1. Add `ADMIN_SECRET` to your Vercel environment variables (any long random string you make up) and redeploy.
2. Run:
   ```bash
   curl -X POST https://your-domain.vercel.app/api/admin/regenerate-characters \
     -H "Content-Type: application/json" \
     -H "x-admin-secret: YOUR_ADMIN_SECRET" \
     -d '{"characterIds": ["adaeze", "chidi", "tunde", "folake", "ikenna"]}'
   ```
   Add `"poseIds": ["neutral", "happy"]` to the body if you want more than just the default `neutral` pose redone for each character.
3. The response lists `succeeded`/`failedCount` and the full per-character result — check it before assuming everything worked.

## 6.63 A real, observed failure: OpenAI rate limits, and why the fix isn't just retry logic

Confirmed via live Vercel logs (not a guess): illustration generation failed consistently with `Illustration API error: {"error": {"message": "Rate limit reached for gpt-image-1.5..."}}`. Checking the account's actual limit (Settings → Limits on platform.openai.com) confirmed the specific number: **5 images per minute**, shared across every gpt-image model. This is a hard external ceiling, not a bug in this app's code — and the math matters:

```
Basic,   5 pages: ~6 images  -> ~72s minimum, even with perfect pacing
Basic,  15 pages: ~18 images -> ~216s minimum
Premium, 5 pages: ~12 images -> ~144s minimum
Premium,15 pages: ~24 images -> ~288s minimum
```

Even the *smallest* possible book already exceeds a 60-second window at this rate limit. No amount of retry-logic correctness changes that arithmetic — a serverless function that gets killed by its own duration limit before OpenAI's rate-limit window even resets was never going to succeed, no matter how well the retries were written.

**Fix has two independent parts, and you need both:**

**1. Retry logic + reduced concurrency** (already in the code): `lib/openaiFetch.js` wraps every OpenAI call with retry-on-429 behavior that respects OpenAI's own `Retry-After` header, and both batched routes (`generate-character-image.js`, `generate-illustrations.js`) dropped `CONCURRENCY` from 3 to 1. This is necessary but not sufficient on its own — it makes each individual request handled correctly, but doesn't create more time for the requests to complete in.

**2. Vercel's Fluid Compute, to get more time to work with — THIS STEP IS REQUIRED, DO IT BEFORE DEPLOYING:** Vercel's standard function duration ceiling is 60 seconds, even on Hobby. Vercel's **Fluid Compute** feature raises that to up to 300 seconds, still on the free Hobby plan. At 5 images/minute, a ~280-second window has capacity for ~23 images — enough for every book size in this app, including the largest Premium book (24 images), *without waiting on anything from OpenAI at all*.

- Go to your Vercel project → **Settings → Functions**, and enable **Fluid Compute** if it isn't already on.
- `generate-illustrations.js` and `generate-character-image.js` are now set to `maxDuration: 280`; `get-or-generate-character.js` and `generate-location-background.js` to `maxDuration: 90`. **If you deploy without enabling Fluid Compute first, Vercel will reject these values outright** — Hobby's standard ceiling is 60, and anything above that requires Fluid Compute to be turned on.

**The complementary, longer-term fix — also worth doing regardless:** OpenAI's image rate limit scales automatically with cumulative account spend, no support ticket needed:

```
Tier 1 (starting tier):  5 images/minute
Tier 2 ($50 total spent):  20 images/minute
Tier 3 ($100 total spent): 50 images/minute  <- comfortably covers everything
Tier 4 ($250 total spent): 150 images/minute
Tier 5 ($1,000 total spent): 250 images/minute
```

Some tiers also require a minimum number of days since your *first* payment, not just the spend amount — check the exact current numbers on your own Limits page, since OpenAI updates these periodically. Once you naturally cross $100 in cumulative OpenAI spend (which normal usage will do on its own), image generation gets fast enough that the Fluid Compute headroom becomes a safety margin rather than a requirement.

**One thing worth knowing so the cost concern is calibrated correctly:** OpenAI does not charge for rate-limited (429) requests — only images that actually complete are billed. The money spent chasing this specific failure is whichever images succeeded *before* hitting the wall each time, not the rejected ones.

## 6.65 A real bug: validation ran outside the try/catch, so failures were silent

Both `handleWriteStory` functions (Basic and Premium) used to call their validation function (`validate()` / `validateStoryFields()`) BEFORE entering the `try` block, with `setWriting(true)` and error-clearing also happening outside that block. If validation ever threw for any reason it wasn't specifically designed to handle — a malformed `template` lookup, an unexpected `undefined` somewhere — that exception was completely uncaught: no error message, no loading state change, nothing. Clicking the button would appear to do nothing at all, which is exactly as unhelpful as it sounds when real API costs are on the line for every attempt.

**Fix:** validation now runs inside the `try` block in both files, so any exception — expected or not — is caught and surfaces as a real, visible error message via `setWriteError()`, instead of vanishing silently. This doesn't just fix one specific cause; it makes "the button does nothing" structurally impossible going forward for this handler, regardless of what causes a future failure.

## 6.56 Standing rule: character portraits never crop, anywhere

Cropping got fixed reactively three times in a row — the character browser, then the hero banner, then the "Meet a few of the characters" grid — each a different screen, each needing a separate report before it got noticed. Rather than wait for a fourth screenshot, every remaining `object-cover` on a generated character image was audited and switched to `object-contain`, across every file: `index.js`'s two character grids, `characters.js`'s grid and detail modal, `preview.js`'s character avatar, `story-builder.js`'s live-preview avatar, and `premium-builder.js`'s main character preview, pose-thumbnail strip, and supporting-character thumbnail. **This is now a standing rule, not a per-screen fix**: any new place that displays a generated character portrait should use `object-contain`, never `object-cover` — confirmed by grepping the whole `pages/` directory for `object-cover` after the change, which turned up exactly two remaining uses, both deliberately different cases:

- `premium-builder.js`'s upload-photo preview (`photoPreview`) — this is the parent's own raw uploaded photo, arbitrary aspect ratio, shown before any AI processing. Cropping a photo-upload preview to a square is completely normal UX (every social app does this); it isn't a generated character portrait at all.
- `preview.js`'s page-1 illustration preview — this is a full illustrated *scene* (character + background + action, generated by `generate-illustrations.js`), not an isolated character portrait on a plain background. An illustrated picture-book page is intentionally composed to fill its frame, the same reasoning already applied to the PDF's full-bleed pages; slight edge-framing on a scene is normal illustrative composition, not a rendering bug the way a cropped isolated portrait is.

## 6.57 Two fixes: cropped heads, and a scrolling character banner

**Cropped heads (real bug, reported with a screenshot):** every pose prompt in `lib/characterPoses.js` said "full body visible" but never said anything about leaving margin above the head. Asking an image model for a full standing figure inside a square frame, with no headroom instruction, is a well-known trigger for the model cropping tight against the top of the head (and sometimes the feet) to keep the figure large within the frame. All six pose prompts now explicitly ask for "generous empty margin above the head and around all sides, never cropping or cutting off the head, hair, or any part of the body." This is the standard prompt-engineering fix for this failure mode — **it could not be verified visually from this environment** (no way to render an actual image here), so the first real test of this fix is the next character actually generated through the app. If heads are still getting cropped after this, the next thing to try is being even more explicit about vertical framing ratio (e.g., "character occupies no more than 75% of the frame height").

**Hero background — fourth revision, cropping eliminated entirely:** went through three earlier versions (small avatars below the text; 3 large portraits sliding behind it; 2 crossfading with `object-position: top`) before landing here. `object-position: top` reduced the crop but didn't eliminate it — it only controls which side gets sacrificed when a crop happens, not whether one happens at all, and reported cropping was still "too much." The actual fix: switched from `object-fit: cover` to `object-fit: contain`. `cover` scales an image up until it fills the container, cropping whatever doesn't fit; `contain` scales it up only until the whole image fits, and only ever adds empty space — mathematically, it cannot crop anything, regardless of how mismatched the square 1024×1024 source is against whatever aspect ratio the slot ends up being at any screen size. The tradeoff is empty space around the image instead of an edge-to-edge fill, which is the right tradeoff for a 16%-opacity ambient background — it was never meant to look like a precisely-fitted photo. Now: exactly 2 character portraits at a time, crossfading to a new pair every 7 seconds (`useRotatingCharacters()` — a plain interval advancing a start index through the character list, no library needed), with a slower, dedicated `.animate-fade-in-slow` (1.4s ease-in-out) distinct from the existing `.animate-fade-in` (0.4s) used by the generation-progress modal's rotating facts — that one's tuned for quick rotation, this needed to feel calmer. Still uses only already-cached images via `/api/library-characters` (a pure cache read, never triggers generation): anonymous, often bot/crawler landing-page traffic is the wrong place to spend real image-API money warming a cache.

**Two more corrections, same theme:** the "Meet a few of the characters" grid on the landing page and the full `/characters` browser both used `object-cover` on a square container with a square source image — mathematically zero cropping, but the character still filled the frame edge-to-edge with no breathing room, since the source images themselves have little margin around the figure. `object-contain` plus padding fixed the cropping, but the first padding value chosen (`p-3`/`p-2`) was too small to actually read as breathing room once applied — a follow-up report ("still too tucked into the borders," with the exact spot circled) confirmed it. Padding increased to `p-7` (grid cards) and `p-5` (the smaller character-detail modal) — roughly 28px and 20px per side respectively, more than doubling the original margin. This works immediately on already-cached characters too, not just ones generated after the pose-prompt fix above, since it's a container-level fix independent of what the source image itself contains.

**Hero nav row was rendering behind the character art.** The background crossfade previously spanned the entire hero section via `absolute inset-0`, which put it behind the "StoryNest" / "Log in" row too. Restructured so the nav row sits in normal document flow on the section's plain background, entirely outside the `relative overflow-hidden` wrapper that holds the character art — the background now only ever starts below the nav, behind the headline. Verified in the actual rendered HTML that the nav's DOM position comes before the background div, not nested inside it.

## 6.58 A full redesign: full-bleed cover, back cover, and orientation choice

The PDF used to be a solid-color background with a small circular portrait and text below it — functional, but not what "storybook" implies. `lib/generateStoryPdf.js` was rebuilt around a different idea: every page (cover, story pages, and a new back cover) is a full-bleed illustration with a semi-transparent "caption card" holding the text anchored to the bottom, instead of a plain background with a small boxed image.

**What's new:**
- **Front cover**: the character's portrait fills the entire page (scaled and cropped to cover, not letterboxed), with the title, an optional "Written by {parent's name}" byline, and a small "A STORYNEST BOOK" imprint at the very bottom — so the brand shows on every book regardless of theme or character.
- **Back cover** (didn't exist before): the character in their "happy" pose (closest match to "waving/celebrating" from the fixed pose set — see `lib/characterPoses.js`), with a promotional blurb encouraging the parent to make another book. Premium already has this pose in hand from the 6-pose upload batch; Basic tier now also resolves `"happy"` alongside `"neutral"` when illustrating a book, purely for this back cover use.
- **Every story page** is now full-bleed too, with the text card overlaid on the illustration rather than sitted below a smaller boxed image.
- **Orientation choice**: both builders now have a Portrait/Landscape picker next to book length and color theme. Verified this isn't just a cosmetic label — portrait produces a 419×595pt page, landscape genuinely swaps to 595×419pt.
- **Author line**: a new optional input in both builders, shown **verbatim** on the cover — no forced "Written by" wrapper. A parent can type "Written by Mummy," "By the Adeniji Family," or "For Tolu, from Grandma" and the cover shows exactly that, with a live "Cover will show: ..." preview right under the field so there's no guessing.

**How the full-bleed crop works:** every image this app generates is square (1024×1024 — every OpenAI call in the codebase requests this exact size). `drawFullBleedImage()` scales that square up until it covers whichever page dimensions are in play (portrait or landscape), then crops the overflow via a clip path — the same clipping technique already used for the old circular portrait, generalized to a full-page rectangle. If no image is available, it falls back to a solid accent-colored page with a large centered initial rather than leaving a blank or broken page.

**Verified, not just written:** built a local test image server and ran `buildStoryPdfBuffer()` against all four combinations of {portrait, landscape} × {author name present, absent}, plus a deliberately-missing page image to confirm the fallback doesn't break the rest of the PDF — all four produced valid PDFs with the correct page count (cover + N story pages + back cover), and portrait vs. landscape genuinely produced different page geometries in the actual PDF output, not just a passed-through label.

**Honest limitation:** the "playful" part of "playful yet readable" is achieved through layout, scale, and color, not typeface — jsPDF's built-in fonts are Times/Helvetica/Courier only. A genuinely playful, rounded display font (matching the site's own Fraunces/Nunito Sans) would need a real font file bundled and converted via jsPDF's font tool, which isn't done here. Worth doing as a follow-up if the current Times-based design doesn't feel playful enough in practice.

## 6.59 Premium tier: character generator replaces photo upload entirely

Photo upload for Premium is gone — no code path in this app accepts an uploaded image of a child anymore, for any tier. This isn't a UI preference; it closes a real compliance exposure found while evaluating alternative image providers (see the Gemini/Nano Banana research earlier in this project's history): major providers have explicit, confirmed content-policy restrictions on processing photos of minors, triggering even for a parent's own child in a legitimate creative context. Removing the upload path entirely means this risk doesn't exist regardless of which image provider the app uses now or switches to later — it isn't a workaround scoped to one provider.

**What replaces it:** a character generator. The parent describes their child — name, age, gender, ethnicity, hair, skin tone, eye color, a favorite outfit or color, and a personality word or two — and the character is generated via **text-to-image**, the same technique already used for the 30 library characters (`get-or-generate-character.js` / `lib/generateLibraryCharacterPose.js`), just from parent-authored traits instead of pre-written ones. All 6 poses still generate together, upfront, in one style — nothing about the "generate once, never redraw mid-story" consistency principle changed, only the *source* of the character's appearance.

**"Creator's account only" is now real, not just a phrase — Premium requires login.** A character scoped to one account has nowhere to live for a guest checkout, so `premium-builder.js` now checks for a session on load and redirects to `/login?redirect=/premium-builder` if there isn't one, the same pattern `/subscribe` already used. This is a genuine behavior change — guest checkout used to work for both tiers; it's Basic-tier only now.

**New database tables, both RLS-protected by account:**
- `custom_characters` — one row per generated character (name, age, gender, ethnicity, trait description), owned by `user_id`
- `custom_character_poses` — mirrors `library_character_poses`'s structure, but scoped to one private character instead of the shared 30-character library

Both have row-level security restricting `select` to `auth.uid() = user_id` (checked via a join for the poses table, which has no `user_id` column of its own) — verified this is enforced by RLS, not just by the app choosing not to show other people's characters, since the client-side "import a saved character" list queries these tables directly with the anon key (`supabaseBrowser`, the same pattern `account.js` already uses for a parent's saved stories), relying on Postgres itself to only return rows this account actually owns.

**The storage bucket got more private too, not just the database rows.** `custom-characters` was a *public* bucket before (reasoned as acceptable at the time since only a stylized cartoon was stored, never the actual photo) — now that characters are explicitly account-scoped, leaving the underlying image files publicly reachable by anyone holding a URL would be a real inconsistency with that. The bucket is now private, and both `generate-custom-character.js` and the "import" flow issue signed URLs (90-day expiry — long-lived on purpose, since a character is meant to be reused across many future books, unlike the 30-day expiry on per-book story-page images which only need to survive one checkout).

**"Import a character" is a real, separate flow, not just a mention.** Step 1 now offers a toggle — "Create a new character" or "Use a saved character" — the second only appearing once the account actually has at least one saved character. Selecting one loads its cached poses directly from `custom_character_poses` and skips character generation entirely, going straight to Step 2's story fields. This is the actual mechanism that makes a custom character reusable rather than something regenerated (and rebilled in image-generation cost) for every single book.

**What changed under the hood to make this compatible with existing code:** `generate-illustrations.js` already accepted either `base64` or `url` for a character reference (it has a `resolveToBase64` fallback that fetches a URL when base64 isn't provided) — so switching the custom character's pose data from `{base64, url}` to `{url}` only required no changes to the illustration-compositing route itself, only to the two UI spots in `premium-builder.js` that were reading `.base64` directly for on-page previews (now read `.url`, a real signed link, directly).

**What I could not verify from this environment:** the actual generated art quality and consistency of a purely-described character versus one that started from a real photo. The whole point of the old photo-upload flow was giving the model a real starting likeness to work from; a from-scratch text description asks more of the model's interpretation, with no visual anchor at all. Whether "short curly black hair, deep brown skin, dark brown eyes" reliably produces a child that reads as *specifically theirs* rather than a generic library-style character is a real, open question that only a real generation can answer — this is worth treating as a genuine risk to the tier's core value proposition, not a settled implementation detail.

## 6.6 Reading and editing the story before it's illustrated

Story generation used to flow straight from "write the story" into "illustrate every page" in one continuous, uninterrupted call — a parent had no chance to fix a typo, reword a clumsy sentence, or reject a story they didn't like until AFTER paying for illustrations. That's now split into two real stages with a review step in between, in both `story-builder.js` and `premium-builder.js`:

1. **Write** — calls `generate-story.js` / `generate-story-premium.js` only. Cheap (a Claude call), fast.
2. **Review** — the parent sees the title and every page's text in editable fields, and can either edit in place, hit "Rewrite story" to regenerate the whole thing from the same form inputs, or go back and change the form fields entirely.
3. **Illustrate** — only triggered explicitly, by the parent clicking "Illustrate my book." This is where the real image-generation cost happens — pose/location resolution and every page's illustration.

**Why this matters beyond UX:** it directly narrows the pre-payment cost-exposure gap flagged earlier in this README (every expensive generation happening before any payment gate). It doesn't close that gap — illustration generation is still free to trigger repeatedly with no rate limit — but it does mean a parent can catch and fix an unwanted story via a cheap Claude call instead of discovering a problem only after paying for a full set of illustrations.

**A real constraint worth knowing:** editing a page's text does NOT re-derive its assigned pose, location, or shot — those stay exactly as Claude originally set them when it wrote the story. A minor edit (fixing a name, tightening a sentence) won't cause any mismatch. A parent who rewrites a page's entire action (e.g., changing "she found the bracelet" to "she lost her shoe instead") could end up with an illustration that no longer quite matches the new text, since the illustration is generated from the original `illustration_prompt`, not the edited prose. This is disclosed directly in the review screen's copy, not hidden — re-deriving the scene metadata on every text edit would mean another Claude call per edit, which defeats the point of a cheap review step.

## 6.85 A real bug: sessionStorage has a size limit, and illustrated books blow past it

The draft object passed between story-builder/premium-builder → preview → checkout used to embed every generated illustration directly as base64 inside `sessionStorage`. This worked fine when Basic tier was text-only, but the moment Basic tier also started generating real illustrations (see "Basic tier is now illustrated too"), it broke immediately: a single 5-page book's worth of embedded base64 images runs to roughly **7.5MB**, and browsers cap `sessionStorage` at somewhere around 5–10MB per origin. The actual error surfaced as `Failed to execute 'setItem' on 'Storage': ... exceeded the quota` — a real, observed failure the first time this pipeline ran against genuine image generation, not a hypothetical.

**Fix:** `generate-illustrations.js` now uploads every generated page image to a new private Storage bucket (`story-pages`) and returns a signed URL (30-day expiry) instead of base64. The draft only ever holds that URL — a few hundred bytes, not megabytes. The same fix applied to Premium's cover portrait, which had the identical latent problem (`characterImageBase64` → `characterImageUrl`, matching what Basic tier already did). Measured: the same 5-page book's draft went from ~7.5MB to ~3KB.

**On the expiry length — no technical ceiling, but a real tradeoff:** Supabase places no hard limit on signed-URL duration (people use these for years), so it could be set much longer. It isn't, on purpose: unlike `story-pdf-url.js` (which verifies the requesting user owns that story before issuing a link), a `story-pages` URL carries no ownership check — anyone holding the link can open it until it expires. A longer expiry directly widens the exposure window if a URL ever leaks (browser history, a shared screenshot), which matters more here since these can depict a real child. 30 days was chosen as a middle ground: long enough to cover a parent who comes back to buy weeks later, without leaving the door open indefinitely. If a parent's draft outlives even that, they'd need to regenerate rather than resume — a real, accepted limitation, not an oversight.

## 6.9 Persistent story storage & "My Library"

Every paid order now gets a PDF built server-side and stored in a **private** Supabase Storage bucket (`story-pdfs`) — this fixes what used to be a real gap: previously, once the browser tab closed, the story was gone for good (it only ever lived in `sessionStorage` and a client-side jsPDF call). Now:

- Guests still get the PDF via the download button and the confirmation email — no account needed for a one-off purchase.
- Logged-in parents additionally get a `stories` row pointing at that same PDF, visible under `/account`.
- Downloads from `/account` go through `/api/story-pdf-url`, which verifies the requesting user actually owns that story before issuing a short-lived (10-minute) signed URL — the bucket itself has no public or authenticated-read policy, specifically because these can contain a real child's illustrated likeness and personal story details.

## 7. Deploy to Vercel

1. Push this repo to GitHub.
2. In [vercel.com](https://vercel.com), **Add New → Project**, import the GitHub repo.
3. Under **Environment Variables**, add everything from `.env.example` with your real values (Production, and Preview if you want test payments on preview URLs too).
4. Deploy. Vercel builds and gives you a `*.vercel.app` URL.
5. Go back to Paystack and set the webhook URL to `https://<your-vercel-domain>/api/paystack-webhook`.
6. **Custom domain:** Vercel → Project → Settings → Domains → add `storynest.com` (or your chosen domain), then update the A/CNAME records at your registrar as Vercel instructs. SSL is provisioned automatically, usually within 30 minutes.

## 8. Testing checklist before launch

- [ ] Login: magic link email arrives, clicking it redirects back and establishes a session (check Supabase Auth's Redirect URLs are configured — see "Accounts & subscriptions setup")
- [ ] Account: `/account` redirects to `/login` when logged out, and loads the profile + story list when logged in
- [ ] Subscription signup: Paystack plan popup opens with the correct plan price, `/api/verify-subscription` activates it, `/account` reflects `subscription_status: active` immediately after
- [ ] Subscription redemption: a subscribed user sees "Included in your plan" at Basic-tier checkout and skips Paystack entirely; a non-subscribed user still sees the normal Paystack flow; a Premium checkout never shows the subscription bypass regardless of subscription status
- [ ] Subscription webhook: trigger `subscription.disable` from the Paystack dashboard's test tools and confirm `profiles.subscription_status` flips to `cancelled`
- [ ] Email: with a real `RESEND_API_KEY` and verified domain, confirm the confirmation email actually arrives with the PDF attached and openable, for both a guest checkout and a subscription redemption
- [ ] My Library download: confirm `/api/story-pdf-url` returns 403 when called with a valid session but someone else's `storyId` — this is the one check that must never regress
- [ ] PDF parity: confirm the emailed PDF and the "Download PDF" button's PDF are visually identical (they now share `lib/generateStoryPdf.js`, but verify after any future edit to that file)
- [ ] PDF visual check: open a real generated PDF and confirm the cover and every story page show the illustration filling the entire page (not letterboxed or stretched oddly) with the text card readable on top of it — this is the one piece of `lib/generateStoryPdf.js` verified structurally (correct page count, valid PDF bytes, correct page dimensions per orientation) but not visually, since nothing in this environment can rasterize a PDF to check the rendering by eye
- [ ] Back cover: confirm the last page shows the character in a distinctly different (happier/celebratory) pose than a neutral cover portrait, plus the StoryNest promotional text
- [ ] Author byline: fill in "Your name" and confirm "Written by {name}" appears on the cover; leave it blank and confirm the cover layout doesn't leave an awkward gap where the byline would have been
- [ ] Orientation: generate one book in Portrait and one in Landscape and confirm the actual PDF page shape differs, not just that both complete without erroring
- [ ] Character browser: filters (age/gender/ethnicity) and search all narrow results correctly; modal opens/closes; "Use this character" carries the character into the story builder
- [ ] Story builder: switching templates changes the form fields; validation blocks submit when a field is empty or the combined word count is under 50; "Write my story" calls Claude and returns a formatted, editable story
- [ ] Story review step: after writing a story, edit a page's text and confirm the edited version (not the original) appears in the final illustrated book and PDF — on both Basic and Premium
- [ ] Story review step: "Rewrite story" produces a genuinely different story from the same form inputs, and "Edit details" returns to the form with previously-entered values intact
- [ ] Basic tier is actually illustrated: generate a Basic-tier book and confirm every page has an image, not just the cover — this is a behavior change from how the project started, easy to assume is still text-only if you're used to the old version
- [ ] Basic tier character consistency: across a full Basic book, confirm the library character's face/outfit stays the same page to page (same principle as Premium, now applying to Basic too)
- [ ] Character portraits never crop: check every screen that shows a generated character — landing page (both grids), `/characters` (grid and modal), story builder's live preview, premium builder's character preview/pose strip/supporting character, and the `/preview` page's avatar — confirm the full character is visible with no part cut off on each; if any new screen is added later that shows a character portrait, it must use `object-contain`, not `object-cover`, per the standing rule above
- [ ] Subscription page-tier matching: subscribe to "short," then try checking out a "long" book — confirm it's billed individually, not silently covered, and that the checkout page explains why rather than just showing a price with no context
- [ ] Subscription cap: manually set `subscription_books_used_this_period` to 5 for a test account and confirm redemption is correctly blocked with a clear message, not a generic error
- [ ] Subscription renewal reset: confirm a real (or simulated) `charge.success` webhook with a `plan` present resets `subscription_books_used_this_period` back to 0 — this is the one piece of the new subscription logic that can't be tested by just clicking through the UI, since it only fires on Paystack's own renewal schedule
- [ ] Portrait character generation: after deploying the 1024x1536 canvas change, regenerate a character that hasn't been touched by any previous fix and check the raw image directly — confirm both head and feet have real margin, not just an improvement over the old square version
- [ ] Mixed-dimension PDF: generate a real Premium book (portrait cover/back-cover, square story-page scenes) and open the actual PDF — confirm no visible distortion or stretching on either image type, since this was only verified with solid-color test images, not real generated art
- [ ] Text readability: open a real generated PDF and confirm story-page text is comfortably readable at normal viewing/print size, not squinting-small — 17pt was chosen as an improvement over the original 14pt, but "comfortable" is ultimately a judgment call worth confirming by eye
- [ ] Outfit consistency: generate a full book and compare the character's outfit across all pages — some drift is expected and currently unavoidable with this architecture; the real question is whether it's drifted enough to look like a different character, which would be worth flagging as still needing more work
- [ ] Style choice: generate one full book in each of the 4 styles and confirm the character, backgrounds, and page illustrations all visually match each other within a book — no mixed styles in the same book
- [ ] Style caching: generate the same library character in two different styles and confirm both are retrievable afterward (check the character grid still shows the right one per style) rather than one overwriting the other
- [ ] Coloring-page style specifically: confirm the actual generated illustration has no color/shading at all (not just "less colorful") and is genuinely usable as a printable coloring page
- [ ] Premium style lock-in: confirm the style picked in Step 1 is the one actually used throughout — there's no way to change it after generating the character, so this should be very visible/clear in the UI before the parent clicks "Generate character"
- [ ] Placement-vs-redesign prompt: after the reframed prompt, generate the same kind of book again and compare outfit drift against the earlier "Tech Bro" book — this is the one thing in this update that genuinely cannot be verified without a real side-by-side comparison
- [ ] Admin regeneration: confirm `force:true` and `/api/admin/regenerate-characters` both reject with 403 when `ADMIN_SECRET` is unset or wrong, and confirm normal (unforced) character lookups still work with no auth needed
- [ ] After running a real regeneration, open the raw image file directly (not through the page) and confirm the character's full body is visible with no cropping — this is the one check that actually validates the prompt fix, since CSS changes can't fix a crop baked into the source pixels
- [ ] Landing page banner: confirm exactly 2 character portraits crossfade in the hero background every ~7 seconds, that the transition feels gentle rather than abrupt, and that the full character (head to feet) is always visible with no cropping at any browser window width — `object-contain` should guarantee this mathematically, so if cropping is ever seen again, check that this class wasn't accidentally reverted to `object-cover`
- [ ] sessionStorage size: generate a full "15 pages" book on either tier and confirm no quota error — this previously failed reliably at just 5 pages once illustrations were real, so specifically re-test after any future change that adds more data to the draft object
- [ ] Rate limits: generate a full illustrated book and confirm every page actually gets an image (check `illustrationFailedCount` is 0) — if this account's OpenAI rate limit tier is still low, retries help but won't guarantee success on every attempt; check platform.openai.com → Settings → Limits if failures persist
- [ ] Preview: watermark shows, only the first ~2 paragraphs are visible, color theme applied correctly, "Buy this story" proceeds to checkout
- [ ] Checkout, test mode: Paystack popup opens, a Paystack test card completes successfully, `/api/verify-payment` confirms and redirects to success
- [ ] Before testing on a fresh environment, run `npm ci` (not `npm install`) so you get the exact locked dependency versions — this is what `package-lock.json` being committed is for
- [ ] Checkout, failure case: a declined test card shows a clear error and does not advance to success
- [ ] Webhook: trigger a test event from the Paystack dashboard ("Send test webhook") and confirm the `orders` row updates to `status = paid`
- [ ] Success page: PDF downloads with the correct title, character name, and full story text across pages; WhatsApp/Facebook share links open with pre-filled text
- [ ] Mobile: run through the full flow on a real phone on 3G-equivalent throttling, since most Nigerian parents will be on mobile data
- [ ] Supabase: after a real (test-mode) purchase, confirm a row appears in `orders` with the correct reference and amount
- [ ] Premium: upload a clear photo, confirm all 6 poses generate (check the small thumbnail strip under the main preview) and "Regenerate" produces a fresh set
- [ ] Premium: if one pose fails to generate, confirm the app falls back to the neutral pose for that scene rather than breaking the flow, and that the failure count is visible somewhere (currently surfaced in the Step 1 gallery)
- [ ] Premium: story generation returns between 8 and 12 pages, each with text and (when the illustration call succeeds) an image
- [ ] Premium: if an illustration fails, the page still shows text-only and the success page's failure count reflects it, rather than the whole flow breaking
- [ ] Premium PDF: downloaded file has one image per page in the right order, correct title/character name, and the moral phrase in the final page's text
- [ ] Premium checkout: price reflects the Premium rate, not the Basic rate
- [ ] Premium pose selection: a story with an obviously happy ending and an obviously worried problem scene gets different `pose` values from Claude for those pages (log `story.pages.map(p => p.pose)` in `premium-builder.js` temporarily) rather than defaulting to "neutral" throughout
- [ ] Premium cost check: for a story using the same supporting character pose twice, confirm `/api/get-or-generate-character` is only called once per unique pose (the second call should return `cached: true` immediately) rather than regenerating
- [ ] Premium consistency check: across a full generated book, confirm the custom character's face/hair/outfit never changes page to page — since every page now selects from the same 6 pre-generated images, any drift would indicate a bug in the selection logic, not the image API
- [ ] Premium setting consistency: for a story that returns to the same location on multiple pages, confirm those pages share a `location_id` (log `story.pages.map(p => p.location_id)` temporarily) and that `/api/generate-location-background` is only called once per unique location, not once per page
- [ ] Premium shot variety: confirm a full book doesn't use the same `shot` value on every page — some wide, some medium, some close
- [ ] Book length pricing: pick "5 pages" and "15 pages" for the same tier and confirm checkout shows two different prices, and that `orders.page_tier` / `orders.page_count` land correctly after a test purchase
- [ ] Book length drift: generate a few "15 pages" stories and check how far the actual returned page count drifts from 15 — if it's consistently off by more than a page or two, tighten the prompt in `generate-story.js` / `generate-story-premium.js`

## Notes on the brief's original decisions

- Hosting stays Vercel Hobby (free) + Supabase free tier, per the brief.
- Pricing is now tiered by book length (5/10/15 pages), not the flat rate the brief originally sketched — see "Pricing strategy" above for why, and `lib/pricing.js` for the numbers and the cost math behind them.
- Premium tier (photo upload → custom AI character, illustrated pages) is scaffolded end to end — see "Premium tier setup" and "Character art" above for the image-API key, storage buckets, privacy notes, and known limitations (character/setting consistency, serverless timeouts, cost, moderation) to work through before launch.
- The subscription tier is now built (`/subscribe`, `/account`, magic-link login) — see "Accounts & subscriptions setup." It covers Basic-tier stories only; see that section for why Premium isn't included and what adding it would take.
- Email delivery is now real, via Resend, with the PDF attached — see "Email delivery setup" for the one known gap (webhook-only confirmations, e.g. after a closed tab, don't currently trigger an email) and what fixing it properly would require.
- Persistent story storage ("My Library") is now built — PDFs live in a private Supabase Storage bucket, downloadable later via an ownership-checked signed URL. Previously, closing the tab meant the story was gone for good; that's fixed for logged-in parents specifically, not for guest checkouts (which still only get the download button and the email).
- Print-on-demand remains untouched — the brief's plan was to "partner with a local Nigerian printer" rather than integrate a specific API, which isn't a decision this scaffold can make for you. See the project conversation for the options considered.
- **Still not built, and the most important gap in the whole project:** every expensive generation call (all 6 custom-character poses, the full story, every illustration) happens *before* payment, during `/premium-builder` itself, with no rate limiting, no auth requirement, and no cost ceiling. Nothing stops repeated abandoned attempts from running up real OpenAI costs with zero revenue. This should be solved before real traffic, ahead of anything else on this list.
