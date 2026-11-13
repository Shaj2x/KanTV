-- Every design request, recorded before the model is called, successful or not. The per-account daily cap and
-- the minimum interval count these, so requests sent at once cannot all slip past the checks, and requests the
-- model refuses still count.
create table design_attempts (
  id bigserial primary key,
  account uuid not null references accounts(id) on delete cascade,
  at timestamptz not null default now()
);
create index design_attempts_account_at on design_attempts(account, at desc);
