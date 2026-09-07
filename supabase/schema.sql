-- StoryNest — Supabase schema
-- Run this in Supabase Dashboard → SQL Editor → New query, then "Run".

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
  subscription_plan text, -- 'monthly' | 'yearly'
  subscription_renews_at timestamptz,
  paystack_customer_code text,
  created_at timestamptz default now()
);

-- If you ran this schema before subscriptions existed, these add the new
-- columns to an existing table safely (no-op if already present).
alter table public.profiles add column if not exists subscription_status text default 'none';
alter table public.profiles add column if not exists subscription_plan text;
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

create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can view their own stories" on public.stories
  for select using (auth.uid() = user_id);

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

create policy "Anyone can view story locations"
  on public.story_locations for select
  using (true);

insert into storage.buckets (id, name, public)
values ('story-settings', 'story-settings', true)
on conflict (id) do nothing;

create policy "Public can view story settings"
  on storage.objects for select
  using (bucket_id = 'story-settings');

create policy "Service role can upload story settings"
  on storage.objects for insert
  with check (bucket_id = 'story-settings');

-- Premium tier: storage bucket for generated cartoon characters.
-- NOTE: only the generated cartoon is ever stored here — the original
-- uploaded child photo is never written to Supabase (see README, Premium
-- tier privacy notes). Public read is fine since these are stylized
-- illustrations, not photos of the child.
insert into storage.buckets (id, name, public)
values ('custom-characters', 'custom-characters', true)
on conflict (id) do nothing;

create policy "Public can view custom characters"
  on storage.objects for select
  using (bucket_id = 'custom-characters');

create policy "Service role can upload custom characters"
  on storage.objects for insert
  with check (bucket_id = 'custom-characters');

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
  image_url text,
  updated_at timestamptz default now(),
  primary key (character_id, pose_id)
);

alter table public.library_character_poses enable row level security;

create policy "Anyone can view library character poses"
  on public.library_character_poses for select
  using (true);

insert into storage.buckets (id, name, public)
values ('library-characters', 'library-characters', true)
on conflict (id) do nothing;

create policy "Public can view library characters"
  on storage.objects for select
  using (bucket_id = 'library-characters');

create policy "Service role can upload library characters"
  on storage.objects for insert
  with check (bucket_id = 'library-characters');

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
