-- Accounts, TVs, the one-trial-per-household registry, and subscriptions.

create table accounts (
  id uuid primary key default gen_random_uuid(),
  -- The "sub" of the identity provider's token (Supabase, Clerk, Firebase...).
  auth_sub text unique not null,
  created_at timestamptz not null default now(),
  trial_started_at timestamptz
);

-- A household is one TV, recognised by any of its identifiers.
create table households (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  trial_started_at timestamptz,
  trial_account uuid references accounts(id)
);

-- HMAC(pepper, kind || ':' || sha256 sent by the phone). The phone never sends the raw serial or Android ID.
create table tv_identifiers (
  hmac text primary key,
  kind text not null check (kind in ('serial', 'android_id')),
  household uuid not null references households(id),
  first_seen timestamptz not null default now()
);
create index tv_identifiers_household on tv_identifiers(household);

create table account_tvs (
  account uuid not null references accounts(id),
  household uuid not null references households(id),
  model text not null default '',
  added_at timestamptz not null default now(),
  primary key (account, household)
);

-- Written by the billing webhooks (RevenueCat covers App Store, Google Play and Stripe on the web).
create table subscriptions (
  account uuid primary key references accounts(id),
  source text not null,
  product text not null,
  status text not null check (status in ('active', 'grace', 'expired', 'refunded')),
  period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table webhook_events (
  id text primary key,
  received_at timestamptz not null default now()
);
