-- Identities whose account was deleted. A sign-in token issued before the deletion stays valid until it expires;
-- it must not quietly create a fresh, empty account (or a webhook recreate one).
create table deleted_identities (
  auth_sub text primary key,
  deleted_at timestamptz not null default now()
);

-- When the newest subscription event applied happened, so a late, older event (RevenueCat retries out of order)
-- never overwrites a newer state: an old EXPIRATION arriving after a RENEWAL must not end a paid period.
alter table subscriptions add column event_at timestamptz;
