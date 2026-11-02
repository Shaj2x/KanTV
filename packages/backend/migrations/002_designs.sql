-- AI-generated designs, kept per account (the history the designer varies from), and what the model cost.

create table designs (
  id uuid primary key default gen_random_uuid(),
  account uuid not null references accounts(id),
  request text not null,
  exact boolean not null default false,
  spec jsonb not null,
  print jsonb not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_microusd bigint not null default 0,
  created_at timestamptz not null default now()
);
create index designs_account_created on designs(account, created_at desc);

-- The global daily spend, checked before every model call so a bug or abuse cannot run up the bill.
create table ai_spend_daily (
  day date primary key,
  cost_microusd bigint not null default 0,
  requests integer not null default 0
);
