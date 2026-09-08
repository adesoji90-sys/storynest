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
2. In Supabase, the storage buckets and tables are created automatically by `supabase/schema.sql`. If you ran the schema before this update, re-run the full file — it's idempotent (`on conflict do nothing` / `create table if not exists` throughout).
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
4. For subscriptions: in the Paystack dashboard, go to **Payments → Plans** and create two plans — "StoryNest Monthly" at ₦8,000/month and "StoryNest Yearly" at ₦50,000/year (matching `lib/pricing.js`'s subscription numbers, which live in the landing page copy, not `PRICING_NAIRA`, since subscriptions aren't page-tiered). Copy each plan's code into `NEXT_PUBLIC_PAYSTACK_PLAN_MONTHLY` / `_YEARLY`.
5. `/subscribe` uses Paystack's inline `plan` parameter, which charges the plan's own price and sets up recurring billing automatically — no manual subscription-management code needed on your end for renewals.

**How subscription state stays in sync:** `/api/verify-subscription` activates the subscription on first payment. After that, Paystack renews the charge automatically and fires webhook events — `pages/api/paystack-webhook.js` listens for `charge.success` (with a `plan` present, meaning it's a renewal, not a one-off order), `subscription.disable` / `subscription.not_renew` (cancellation), and `invoice.payment_failed` (mark `past_due`) — and updates `profiles.subscription_status` accordingly, matched by `paystack_customer_code`.

**Known limitation:** subscription coverage is Basic-tier only (`checkout.js`'s `subscriptionCovers` check enforces this server-side too, in `redeem-subscription-story.js`) — Premium's per-story image-generation cost doesn't fit a flat monthly fee without a fair-use cap, which isn't built. If you want Premium included in a higher subscription tier later, you'd need to add a per-period story-count limit and check it server-side before redeeming, the same way `redeem-subscription-story.js` checks `subscription_status` now.

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
- [ ] PDF visual check: open a real generated Basic-tier PDF and confirm the cover page's character portrait renders as an actual circle (not a broken image or a square) — the circular clip in `drawCircularImage()` is the one piece of `lib/generateStoryPdf.js` that was verified structurally (correct page count, valid PDF bytes) but not visually, since nothing in this environment can rasterize a PDF to check the rendering by eye
- [ ] Character browser: filters (age/gender/ethnicity) and search all narrow results correctly; modal opens/closes; "Use this character" carries the character into the story builder
- [ ] Story builder: switching templates changes the form fields; validation blocks submit when a field is empty or the combined word count is under 50; "Preview story" calls Claude and returns a formatted story
- [ ] Basic tier is actually illustrated: generate a Basic-tier book and confirm every page has an image, not just the cover — this is a behavior change from how the project started, easy to assume is still text-only if you're used to the old version
- [ ] Basic tier character consistency: across a full Basic book, confirm the library character's face/outfit stays the same page to page (same principle as Premium, now applying to Basic too)
- [ ] sessionStorage size: generate a full "15 pages" book on either tier and confirm no quota error — this previously failed reliably at just 5 pages once illustrations were real, so specifically re-test after any future change that adds more data to the draft object
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
