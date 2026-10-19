# Evoke on Android: Standard and Family plans with Google Play Billing

How it works, in one paragraph: the Android app is a native shell around
https://evoke.booostglobal.com. On the Upgrade page, inside the app only, a parent
subscribes through Google Play. The app sends the purchase token to
`/api/billing/google/verify`; the server asks Google whether it is real, switches the
family's plan on (Subscription and Entitlement rows) and acknowledges the purchase.
Renewals, cancellations, refunds and failed payments arrive at
`/api/billing/google/notifications` from Google, so the plan always follows Google.
Because it is stored on the family, the plan also works on the website.

The three plans:
| Plan | Price | What it gives |
|---|---|---|
| Free | 0 | Read 1 library book per calendar month (Nigeria time), 1 child |
| Standard | 3,000 naira / month | The whole library, 1 child, print orders |
| Family | 10,000 naira / month (7,500 for the first 2 months) | Everything in Standard, custom books and characters, up to 5 children, print orders |

The free limit is enforced on the server in `/api/read/[bookId]`. Opening the same book again
in the same month is always allowed. Books a family made itself are never counted.

IDs used everywhere (change them in `lib/nativeBilling.js` AND the Vercel env vars together):
- Package name: `com.booostglobal.evoke`
- Standard subscription ID: `evoke_standard`, base plan ID `monthly`
- Family subscription ID: `evoke_family`, base plan ID `monthly`

Before anything else, run `prisma/migrations/1_library_limit_and_standard_plan/migration.sql`
once in the Supabase SQL editor (safe to repeat). It adds the library limit, creates the
Standard plan and sets the prices.

## 1. Play Console: payments profile
Monetize with Play needs a payments profile (merchant account) with your business and bank
details. Check that Nigeria is supported for your payouts and subscription pricing in NGN.

## 2. Build and upload a first version (Android Studio, on your computer)
1. Install Android Studio. In the repo folder run: `npm install`, then `npx cap sync android`,
   then `npx cap open android`.
2. In Android Studio: Build, Generate Signed App Bundle, Android App Bundle.
   Create an **upload keystore** and back it up in two places (never commit it to GitHub).
3. Before every upload, raise `versionCode` in `android/app/build.gradle`.
4. Play Console, Test and release, Testing, Internal testing: create a release, upload the
   `.aab`, accept Play App Signing, save and roll out.
Subscriptions can only be created after a build with billing has been uploaded.

## 3. Create the two subscriptions
Play Console, Monetize with Play, Products, Subscriptions, Create subscription. Do this twice.

**Standard**
- Product ID: `evoke_standard`  (cannot be changed later); name: Evoke Standard plan
- Base plan: ID `monthly`, auto-renewing, billing period 1 month, price 3,000 naira.

**Family**
- Product ID: `evoke_family`  (cannot be changed later); name: Evoke Family plan
- Base plan: ID `monthly`, auto-renewing, billing period 1 month, price 10,000 naira.
- Add an introductory offer to this base plan: base plan > Add offer > Eligibility: New customer
  acquisition > add phase: Introductory price, 2 recurring periods, 7,500 naira. After the two
  months, 10,000 naira renews automatically.

For both: check the other countries' prices before activating, keep the default grace period and
account hold settings, then activate the base plan.

Moving from Standard to Family: the family buys Family in the app. The server switches the plan
to Family and asks Google to stop the Standard subscription renewing, so they are not billed for
both (the rest of the Standard month they already paid for is not refunded). Moving from Family
down to Standard is done by cancelling Family in Google Play and, when it ends, subscribing to
Standard.

## 4. Let your server read purchases (service account)
1. Google Cloud Console: create or pick a project, enable **Google Play Android Developer API**.
2. IAM and Admin, Service accounts, create one (for example `evoke-billing`), then Keys,
   Add key, JSON. Keep the file private.
3. Play Console, Users and permissions, Invite new users: paste the service account's email,
   give it **View financial data** and **Manage orders and subscriptions** for the Evoke app.
   It can take a while for access to start working.
4. In Vercel, Project, Settings, Environment Variables, add
   `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` with the whole JSON on one line, and
   `GOOGLE_PLAY_RTDN_SECRET` with a long random string you make up. Redeploy.

## 5. Real-time notifications (renewals, cancels, refunds)
1. Google Cloud Console, Pub/Sub, create a topic, for example `play-rtdn`.
2. On the topic, add the principal `google-play-developer-notifications@system.gserviceaccount.com`
   with the role **Pub/Sub Publisher**.
3. Create a **Push** subscription on that topic with this endpoint
   (use your own secret): `https://evoke.booostglobal.com/api/billing/google/notifications?secret=YOUR_SECRET`
4. Play Console, Monetize with Play, Monetization setup, Real-time developer notifications:
   enter the full topic name (`projects/YOUR_PROJECT/topics/play-rtdn`), save, and send a
   test notification. A 200 response in the Pub/Sub delivery logs means it works.

## 6. Test before real customers
1. Play Console, Settings, License testing: add your Gmail address(es) as license testers.
2. Install the app from the internal testing link on a real phone signed in with that Gmail.
3. Sign in to Evoke with a new account. Check the free limit first: open one library book as a
   child (it works), then try a second one (it should say this month's free book has been read).
   Then open Upgrade and subscribe to Standard, and check the second book now opens.
   Then upgrade to Family and check in Google Play that Standard no longer renews. Test purchases cost nothing, and monthly
   subscriptions renew every few minutes for a handful of cycles so you can watch renewals.
4. Check Supabase: `subscriptions` should show provider `google_play`, status `ACTIVE`;
   `entitlements` should show the plan's limits (Standard: library_books_per_month empty, 1 child;
   Family: 5 children and custom books allowed).
5. Cancel in Google Play: status becomes `CANCELLED` and access stays until the period ends.
   Let it lapse: the family goes back to the free limits (1 library book a month) and keeps all its books.
6. Open the same account on the website: the plan shows as active there too.
7. Reinstall the app and press Restore my purchase: it should reconnect.

## Things to know
- Nothing here has been run against Google yet (no account access from the build environment).
  The subscription rules are tested; the Google and database steps need the real test above.
- Never commit the JSON key, the keystore, or any secret. The GitHub repo is public.
- Google requires Play Billing for subscriptions bought inside an Android app, so the app
  must not offer another way to pay for these plans. The website does not sell them.
- Children must not be able to reach the purchase button: it sits on the parent-only Upgrade
  page. Checked in code: Reading Mode only allows /reading-mode, /read/* and /login, so a child in
  Reading Mode is sent away from /upgrade.
- Print orders are allowed on Standard and Family (set in the migration); the free plan cannot order prints.
- Apps that only wrap a website can be rejected for minimum functionality. Native Play
  Billing helps, but add other native touches where you can (for example the Reading Mode lock).
- iOS is not covered. It needs Apple's own in-app purchase and a separate account.
