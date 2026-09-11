-- StoryNest — Supabase schema
-- Run this in Supabase Dashboard → SQL Editor → New query, then "Run".
--
-- Genuinely safe to re-run in full, start to finish, any time this file
-- changes: every `create table`, `alter table ... add column`, and
-- `insert into storage.buckets` is written to skip anything that already
-- exists. Every `create policy` is preceded by a matching
-- `drop policy if exists` for the same reason — Postgres has no native
-- "create policy if not exists," and without the matching drop, re-running
-- this file throws "policy ... already exists" on every policy that was
-- already created by an earlier run. If you ever add a new policy to this
-- file, always pair it with a `drop policy if exists` line first.

create extension if not exists "uuid-ossp";

-- Parents / accounts (Supabase Auth handles the actual login; this table
-- holds app-specific profile data keyed to auth.users.id)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  -- Subscription state, kept in sync by /api/verify-subscription (initial
  -- signup) and /api/paystack-webhook (renewals, cancellations, failures).
  subscription_status text default 'none', -- none | active | past_due | cancelled
  subscription_plan text, -- legacy: used to mean 'monthly' | 'yearly' billing frequency, before subscriptions became per-page-tier (see subscription_page_tier). Kept for old rows; new subscriptions don't set this.
  subscription_page_tier text, -- 'short' | 'standard' | 'long' — see lib/pricing.js SUBSCRIPTION_PRICING_NAIRA. Which page-length plan this parent is on; redemption only covers books at this exact page tier.
  subscription_books_used_this_period int not null default 0, -- resets to 0 on each successful renewal charge (see paystack-webhook.js) or on new signup (verify-subscription.js). Checked against SUBSCRIPTION_MAX_BOOKS_PER_MONTH before allowing a free redemption.
  subscription_renews_at timestamptz,
  paystack_customer_code text,
  created_at timestamptz default now()
);

-- If you ran this schema before subscriptions existed, these add the new
-- columns to an existing table safely (no-op if already present).
alter table public.profiles add column if not exists subscription_status text default 'none';
alter table public.profiles add column if not exists subscription_plan text;
alter table public.profiles add column if not exists subscription_page_tier text;
alter table public.profiles add column if not exists subscription_books_used_this_period int not null default 0;
alter table public.profiles add column if not exists subscription_renews_at timestamptz;
alter table public.profiles add column if not exists paystack_customer_code text;

-- A profile row needs to exist before anything else can reference it. This
-- trigger creates one automatically the moment someone signs up via
-- Supabase Auth (magic link), so the app never has to remember to do it.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Saved stories (subscription users can build a library; also used to log
-- every generated draft even before payment)
create table if not exists public.stories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete set null,
  title text not null,
  tier text default 'basic', -- basic | premium
  character_id text, -- Basic tier only; Premium uses custom_character_id instead
  custom_character_id text, -- Premium tier only, ties back to the pose set generated at upload
  template_id int,
  theme_id text,
  setting text,
  problem text,
  helper text,
  challenge text,
  lesson text,
  ending text,
  moral_phrase text,
  story_text text, -- Basic tier: flat story text
  pages jsonb, -- Premium tier: [{ text }, ...] — text only, images live in Storage via pdf_path
  pdf_path text, -- path within the private `story-pdfs` Storage bucket
  created_at timestamptz default now()
);

alter table public.stories add column if not exists tier text default 'basic';
alter table public.stories add column if not exists custom_character_id text;
alter table public.stories add column if not exists pages jsonb;
alter table public.stories add column if not exists pdf_path text;
alter table public.stories alter column character_id drop not null;
alter table public.stories alter column template_id drop not null;

-- Paid orders. `reference` is the Paystack transaction reference — the
-- unique key both /api/verify-payment and /api/paystack-webhook write to.
create table if not exists public.orders (
  id uuid primary key default uuid_generate_v4(),
  reference text unique not null,
  email text not null,
  story_id uuid references public.stories(id) on delete set null,
  title text,
  tier text default 'basic', -- basic | premium
  page_tier text default 'standard', -- short (5 pages) | standard (10) | long (15) — see lib/pricing.js
  page_count int,
  character_id text,
  template_id int,
  theme_id text,
  story text,           -- Basic tier: full flat story text
  pages jsonb,           -- Premium tier: [{ text }, ...] — one entry per illustrated page
  amount_kobo int,
  status text default 'pending', -- pending | paid | failed
  created_at timestamptz default now()
);

-- If you ran this schema before page-tier pricing existed, `create table
-- if not exists` above won't retroactively add the new columns to an
-- existing `orders` table — these do that safely, no-op if already present.
alter table public.orders add column if not exists page_tier text default 'standard';
alter table public.orders add column if not exists page_count int;
alter table public.orders add column if not exists user_id uuid references public.profiles(id) on delete set null;

-- Character library reference table (optional — the app currently reads
-- characters from data/characters.js, but mirroring here lets you manage
-- them from the DB later without a code deploy).
create table if not exists public.characters (
  id text primary key,
  name text not null,
  age int not null,
  gender text not null,
  ethnicity text not null,
  trait text,
  description text,
  image_url text
);

alter table public.profiles enable row level security;
alter table public.stories enable row level security;
alter table public.orders enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can view their own stories" on public.stories;
create policy "Users can view their own stories" on public.stories
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own stories" on public.stories;
create policy "Users can insert their own stories" on public.stories
  for insert with check (auth.uid() = user_id or user_id is null);

-- Story settings/locations: within one premium story, a recurring location
-- (e.g. "the market", "her bedroom") gets ONE background generated the
-- first time it appears, keyed to that story's custom character, and every
-- later page set at the same location reuses it as a reference — the same
-- consistency principle as character poses, applied to environments.
-- Scoped per custom_character_id (i.e. per book) rather than shared
-- globally, since settings are story-specific, unlike the 30 library
-- characters.
create table if not exists public.story_locations (
  custom_character_id text not null,
  location_id text not null,   -- a slug Claude assigns within one story, e.g. "market"
  image_url text,
  updated_at timestamptz default now(),
  primary key (custom_character_id, location_id)
);

alter table public.story_locations enable row level security;

drop policy if exists "Anyone can view story locations" on public.story_locations;
create policy "Anyone can view story locations"
  on public.story_locations for select
  using (true);

insert into storage.buckets (id, name, public)
values ('story-settings', 'story-settings', true)
on conflict (id) do nothing;

drop policy if exists "Public can view story settings" on storage.objects;
create policy "Public can view story settings"
  on storage.objects for select
  using (bucket_id = 'story-settings');

drop policy if exists "Service role can upload story settings" on storage.objects;
create policy "Service role can upload story settings"
  on storage.objects for insert
  with check (bucket_id = 'story-settings');

-- Premium tier: storage bucket for generated custom characters.
-- CHANGED from public to private: custom characters are now explicitly
-- scoped to "creator's account only" (see custom_characters/
-- custom_character_poses above) — leaving the underlying image files in a
-- public bucket would be a real inconsistency with that, since anyone
-- holding a URL could view them regardless of account. Access is now via
-- signed URLs issued by /api/generate-custom-character.js and
-- /api/my-custom-characters.js, the same pattern already used for
-- story-pdfs and story-pages.
--
-- If you ran this schema when the bucket was still public, this line
-- flips it — safe to run even if it's already private.
insert into storage.buckets (id, name, public)
values ('custom-characters', 'custom-characters', false)
on conflict (id) do update set public = false;

-- No public or authenticated-user storage.objects policy on purpose,
-- same reasoning as story-pdfs — the service-role key (server-side only)
-- bypasses RLS, which is the only way in. The old "Public can view custom
-- characters" / "Service role can upload custom characters" policies are
-- dropped, not replaced, since a private bucket needs neither.
drop policy if exists "Public can view custom characters" on storage.objects;
drop policy if exists "Service role can upload custom characters" on storage.objects;

-- Library characters: each of the 30 built-in characters gets a small,
-- FIXED set of pose variants (see lib/characterPoses.js — neutral, happy,
-- worried, determined, helping, thinking) generated ONCE per pose and
-- reused forever after that. Building a story never generates a new pose
-- for a library character; it only selects the cached one that best fits
-- each page's scene. This is what keeps a character consistent across
-- every Basic-tier book and every page of a Premium book that pairs it
-- with a custom character — and keeps cost bounded to (30 characters × a
-- handful of poses), generated lazily on first use, not per story.
create table if not exists public.library_character_poses (
  character_id text not null,  -- matches the character id in data/characters.js
  pose_id text not null,       -- matches a POSES id in lib/characterPoses.js
  style_id text not null default 'painterly', -- matches a STYLES id in lib/imageStyle.js
  image_url text,
  updated_at timestamptz default now(),
  primary key (character_id, pose_id, style_id)
);

-- If you ran this schema before the style-choice feature existed, these
-- add the new column and widen the primary key to include it — safe to
-- run on a table that already has data. Existing rows default to
-- 'painterly' because every image generated before this feature existed
-- was, in fact, painterly (the only style that existed at the time).
alter table public.library_character_poses add column if not exists style_id text not null default 'painterly';
alter table public.library_character_poses drop constraint if exists library_character_poses_pkey;
alter table public.library_character_poses add primary key (character_id, pose_id, style_id);

alter table public.library_character_poses enable row level security;

drop policy if exists "Anyone can view library character poses" on public.library_character_poses;
create policy "Anyone can view library character poses"
  on public.library_character_poses for select
  using (true);

insert into storage.buckets (id, name, public)
values ('library-characters', 'library-characters', true)
on conflict (id) do nothing;

drop policy if exists "Public can view library characters" on storage.objects;
create policy "Public can view library characters"
  on storage.objects for select
  using (bucket_id = 'library-characters');

drop policy if exists "Service role can upload library characters" on storage.objects;
create policy "Service role can upload library characters"
  on storage.objects for insert
  with check (bucket_id = 'library-characters');

drop policy if exists "Service role can update library characters" on storage.objects;
create policy "Service role can update library characters"
  on storage.objects for update
  using (bucket_id = 'library-characters');

-- Finished PDFs, kept PRIVATE (unlike the character/setting art buckets
-- above, which are fine to be public). These can contain a real child's
-- illustrated likeness and their personal story — access is only ever via
-- a short-lived signed URL issued by /api/story-pdf-url.js after checking
-- the requesting user owns that story. No public or authenticated-user
-- storage.objects policy is added here on purpose: the service-role key
-- (used server-side only) bypasses RLS, which is the only way in.
insert into storage.buckets (id, name, public)
values ('story-pdfs', 'story-pdfs', false)
on conflict (id) do nothing;

-- Individual composited page illustrations, also kept PRIVATE — for the
-- same reason as story-pdfs above, and because a Premium page can depict
-- a real child. generate-illustrations.js uploads each generated page
-- here and issues a signed URL directly rather than a permanent public
-- link, since these are only ever needed transiently between generating a
-- book and completing checkout (or being folded into the final
-- story-pdfs PDF).
insert into storage.buckets (id, name, public)
values ('story-pages', 'story-pages', false)
on conflict (id) do nothing;

-- Premium tier no longer accepts an uploaded photo of a child — see the
-- README section "Premium tier: character generator replaces photo
-- upload" for why (a real, confirmed content-policy restriction on
-- processing photos of minors, found while evaluating alternative image
-- providers — this removes the exposure permanently, regardless of which
-- image provider is used, rather than working around it for one provider
-- at a time). Premium characters are now built from parent-supplied
-- descriptive traits (skin tone, hair, eye color, favorite outfit,
-- personality) via text-to-image, the same technique already used for the
-- 30 library characters — just parent-authored instead of pre-written by
-- us, and private to the creating account instead of shared publicly.
--
-- This requires an account: a "character tied to your account only" has
-- nowhere to live for a guest checkout. Premium tier now requires login,
-- a real change from before ("guest checkout works fully" applied to
-- both tiers previously — it's Basic-tier only now).
create table if not exists public.custom_characters (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  age int,
  gender text,
  ethnicity text,
  description text, -- combined parent-supplied traits: hair, skin tone, eye color, favorite outfit/color, personality
  created_at timestamptz default now()
);

alter table public.custom_characters enable row level security;

drop policy if exists "Users can view their own custom characters" on public.custom_characters;
create policy "Users can view their own custom characters"
  on public.custom_characters for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own custom characters" on public.custom_characters;
create policy "Users can insert their own custom characters"
  on public.custom_characters for insert
  with check (auth.uid() = user_id);

-- Mirrors library_character_poses's structure (see above) but scoped to
-- ONE user's private character instead of the shared 30-character
-- library. No style_id needed in isolation here the way the library
-- table has it as part of a shared cache key — a custom character's
-- style is fixed at creation time and never regenerated in another
-- style, so style_id is stored for reference but isn't part of what
-- makes a row unique.
create table if not exists public.custom_character_poses (
  custom_character_id uuid not null references public.custom_characters(id) on delete cascade,
  pose_id text not null,
  style_id text not null default 'painterly',
  image_url text,
  updated_at timestamptz default now(),
  primary key (custom_character_id, pose_id)
);

alter table public.custom_character_poses enable row level security;

-- No user_id column directly on this table — ownership is checked via a
-- join back to custom_characters, which does have one.
drop policy if exists "Users can view poses of their own custom characters" on public.custom_character_poses;
create policy "Users can view poses of their own custom characters"
  on public.custom_character_poses for select
  using (
    exists (
      select 1 from public.custom_characters cc
      where cc.id = custom_character_poses.custom_character_id
      and cc.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- STEP 11: DEFAULT PLANS (Section 23 — plans are data, not code)
-- ─────────────────────────────────────────────────────────────
-- Two starter plans matching Section 23's tiers ("library-only" and
-- "personalized"). PRICE IS A PLACEHOLDER — Section 23 explicitly says
-- "do not hard-code final prices yet"; the "family" plan's
-- price_minor_units below is a stand-in, not a committed business
-- decision, and should be updated directly in this table (or via a
-- future admin UI) once real pricing is decided — no code change
-- needed either way, which is the whole point of plans being data.
--
-- Every new family gets the "free" plan's limits as their default
-- entitlement automatically (see pages/api/auth/bootstrap.ts) — this
-- is what makes max_children enforcement possible for every family,
-- not just ones that eventually subscribe to something paid.
insert into public.plans (id, code, name, description, max_children, library_access, custom_books_allowed, custom_book_credits, narration_allowed, premium_images_allowed, price_minor_units, currency, billing_interval, active)
values
  (uuid_generate_v4(), 'free', 'Free', 'Library access for one child. No custom books.', 1, true, false, null, false, false, 0, 'NGN', 'MONTHLY', true),
  (uuid_generate_v4(), 'family', 'Family', 'Library access for up to 5 children, plus custom book credits. Price is a placeholder pending final business decision.', 5, true, true, 10, false, false, 500000, 'NGN', 'MONTHLY', true)
on conflict (code) do nothing;
