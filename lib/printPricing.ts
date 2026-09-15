// Fixed prices, not derived from anything else — these are business
// decisions (₦15,000 softback, ₦22,000 hardback), stored in kobo to
// match how every other price in this app is stored (see
// AIUsageRecord's own comment on why money is never a float here).
export const PRINT_PRICES_KOBO: Record<string, number> = {
  softback: 1_500_000,
  hardback: 2_200_000,
};

export const PRINT_DELIVERY_ESTIMATE = "4–7 days";
