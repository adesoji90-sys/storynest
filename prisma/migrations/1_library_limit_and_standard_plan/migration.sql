-- Three plans: free (1 library book a month), Standard (whole library), Family (everything).
-- Safe to run more than once. Run in the Supabase SQL editor if you do not use Prisma migrate.

ALTER TABLE "public"."plans" ADD COLUMN IF NOT EXISTS "library_books_per_month" INTEGER;
ALTER TABLE "public"."entitlements" ADD COLUMN IF NOT EXISTS "library_books_per_month" INTEGER;

-- Free plan: one library book a month, no charge.
UPDATE "public"."plans"
SET name = 'Free', description = 'Free trial: read 1 library book each month for one child.',
    library_books_per_month = 1, price_minor_units = 0, updated_at = now()
WHERE code = 'reader';

-- Standard plan: 3,000 naira a month, the whole library.
INSERT INTO "public"."plans" (id, code, name, description, max_children, library_access, library_books_per_month,
  custom_books_allowed, custom_book_credits, narration_allowed, premium_images_allowed, print_orders_allowed,
  price_minor_units, currency, billing_interval, active, updated_at)
SELECT gen_random_uuid(), 'standard', 'Standard',
  'The whole library for one child, with new books added regularly.',
  1, true, NULL, false, NULL, false, false, true, 300000, 'NGN', 'MONTHLY', true, now()
WHERE NOT EXISTS (SELECT 1 FROM "public"."plans" WHERE code = 'standard');

UPDATE "public"."plans"
SET price_minor_units = 300000, name = 'Standard', library_books_per_month = NULL, print_orders_allowed = true, updated_at = now()
WHERE code = 'standard';

-- Family plan: 10,000 naira a month, everything in Standard plus custom books and up to 5 children.
UPDATE "public"."plans"
SET price_minor_units = 1000000, library_books_per_month = NULL, print_orders_allowed = true,
    description = 'Everything in Standard, plus custom books, characters and up to 5 children.',
    updated_at = now()
WHERE code = 'family';

-- Families already on the free plan get the 1-book limit. Paid families are left alone.
UPDATE "public"."entitlements"
SET library_books_per_month = 1
WHERE subscription_id IS NULL AND custom_books_allowed = false;
