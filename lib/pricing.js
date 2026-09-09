// Shared across Basic and Premium: page count now affects price, in fixed
// ranges rather than metering every single page. Ranges keep checkout
// predictable and margin easy to reason about; true per-page billing was
// considered and rejected for v1 — it would mean recalculating price live
// as Claude's actual page count comes back (which varies ±a page or two
// from what was requested), which is a worse checkout experience for a
// marginal accuracy gain. Revisit if parents start asking for finer-grained
// pricing.

export const PAGE_TIERS = [
  { id: "short", pages: 5, label: "5 pages" },
  { id: "standard", pages: 10, label: "10 pages" },
  { id: "long", pages: 15, label: "15 pages" },
];

// Naira. Basic range from the brief: ₦3,000–₦7,000. Premium range: ₦12,000–₦25,000.
//
// COST CHECK (done Sep 2026 — re-run this before launch, both API pricing
// and the USD/NGN rate move):
//   Claude (claude-sonnet-5, $2/$10 per M tokens): a few hundred to ~2,000
//   tokens per book depending on page tier — comes out to roughly ₦8–₦30
//   per book at ~₦1,320/$1. Negligible next to these prices at any tier.
//
//   OpenAI image generation (gpt-image-1.5, "medium" quality — see
//   lib/imageConfig.js) is what actually costs money for Premium: 6 fixed
//   character-pose images at upload (same cost regardless of book length)
//   + 2-4 location backgrounds + one illustration per page. Rough per-book
//   totals: short ≈ $0.70 (₦925), standard ≈ $1.08 (₦1,425), long ≈ $1.45
//   (₦1,915) — leaving roughly 90%+ gross margin against the Premium prices
//   below even before accounting for Paystack fees. Switching IMAGE_QUALITY
//   to "high" roughly triples that cost (short ≈ ₦2,750, standard ≈ ₦4,090,
//   long ≈ ₦5,430) and still leaves ~77% margin — so there's real room to
//   raise image quality without threatening the current prices.
//
//   The per-reference-image INPUT token cost in that estimate is
//   approximate (OpenAI doesn't publish a fixed input-token count per
//   reference image the way it does for outputs) — verify against a real
//   API call before trusting the exact numbers, though the output-token
//   component (the majority of the cost) is solid, straight from OpenAI's
//   published per-image pricing table.
//
//   Basic tier's only variable cost is the negligible Claude cost above, so
//   its ₦3,000/₦5,000/₦7,000 spread is effectively pure margin regardless
//   of page tier.
export const PRICING_NAIRA = {
  basic: { short: 3000, standard: 5000, long: 7000 },
  premium: { short: 12000, standard: 18000, long: 25000 },
};

export function getPageTier(id) {
  return PAGE_TIERS.find((t) => t.id === id) || PAGE_TIERS[1];
}

export function getPrice(tier, pageTierId) {
  const table = PRICING_NAIRA[tier] || PRICING_NAIRA.basic;
  return table[pageTierId] ?? table.standard;
}

// Subscriptions are per PAGE TIER now, not one flat "unlimited" plan — a
// real, quantified risk with the old flat ₦8,000/month unlimited plan:
// once Basic tier started generating real illustrations (see README
// "Basic tier is now illustrated too"), a subscriber doing 15-page books
// nightly would break even on that specific subscription in about 9
// books — well within a single month of regular use. Capping each plan
// at a fixed number of books, split by page tier, bounds the exposure
// per subscriber instead of leaving it open-ended.
//
// PRICING METHODOLOGY (Sep 2026 — re-run before launch): each plan is
// priced at roughly 3x that tier's a la carte price, for
// SUBSCRIPTION_MAX_BOOKS_PER_MONTH (5) books/month — i.e. "pay for 3,
// get up to 5." At current per-book cost estimates, this holds ~78-79%
// margin even if a subscriber uses every single book in the period
// (short: ₦9,000 vs. ~₦1,895 max cost; standard: ₦15,000 vs. ~₦3,355;
// long: ₦21,000 vs. ~₦4,475) — and works out to a consistent ~40%
// savings versus buying 5 books individually at the Basic a la carte
// rate, which is the actual incentive to subscribe if you know you'll
// want more than a couple of books a month. Basic tier only, same as
// before — Premium's per-story cost is high enough that even a capped
// flat-fee plan doesn't have the same margin cushion, so it stays a la
// carte only for now.
export const SUBSCRIPTION_MAX_BOOKS_PER_MONTH = 5;

export const SUBSCRIPTION_PRICING_NAIRA = {
  short: 9000,
  standard: 15000,
  long: 21000,
};

export function getSubscriptionPrice(pageTierId) {
  return SUBSCRIPTION_PRICING_NAIRA[pageTierId] ?? SUBSCRIPTION_PRICING_NAIRA.standard;
}
