// One free trial per TV and per account. A TV is recognised by any identifier it has ever shown (serial hash,
// Android ID hash), so a factory reset (new Android ID, same serial) and a new account on the same TV both
// find the household that already had its trial. Identifiers are keyed with a server secret before storage.
import { createHmac } from "node:crypto";
import type { Db } from "./db.ts";

export const TRIAL_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

export interface TvRegistration {
  /** SHA-256 hex from the phone (core/identity.ts householdIds). */
  serial?: string;
  androidId?: string;
  model: string;
}

export type TrialStatus =
  | "started" // this registration started it
  | "active" // running, started earlier
  | "expired"
  | "used-on-this-tv" // another account had this TV's trial
  | "used-by-account"; // this account had its trial on another TV, now over

export interface Entitlement {
  accountId: string;
  /** Full access: an active subscription, or a running trial. */
  entitled: boolean;
  plan: "subscription" | "trial" | "none";
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
}

export function identifierHmac(pepper: string, kind: "serial" | "android_id", hash: string): string {
  return createHmac("sha256", pepper).update(`${kind}:${hash.toLowerCase()}`).digest("hex");
}

const HEX64 = /^[0-9a-f]{64}$/i;

export async function accountFor(db: Db, authSub: string): Promise<{ id: string; trial_started_at: Date | null }> {
  const rows = await db.query<{ id: string; trial_started_at: Date | null }>(
    `insert into accounts (auth_sub) values ($1)
     on conflict (auth_sub) do update set auth_sub = excluded.auth_sub
     returning id, trial_started_at`,
    [authSub],
  );
  return rows[0]!;
}

/**
 * Links a TV to the account and decides its trial, in one transaction. Locks are taken on the account and on
 * every identifier (in a fixed order) so two phones registering the same TV at once cannot both start one.
 */
export async function registerTv(
  db: Db,
  pepper: string,
  authSub: string,
  reg: TvRegistration,
  now = new Date(),
): Promise<{ household: string; trial: TrialStatus; entitlement: Entitlement }> {
  const ids = (
    [
      ["serial", reg.serial],
      ["android_id", reg.androidId],
    ] as const
  )
    .filter((x): x is ["serial" | "android_id", string] => !!x[1] && HEX64.test(x[1]))
    .map(([kind, hash]) => ({ kind, hmac: identifierHmac(pepper, kind, hash) }));

  return db.transaction(async (tx) => {
    for (const key of [`account:${authSub}`, ...ids.map((i) => `tv:${i.hmac}`).sort()])
      await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
    const account = await accountFor(tx, authSub);

    // Every household any identifier points at; more than one means this TV showed different identifiers
    // before (e.g. a factory reset), so they are merged into the oldest trial.
    const found = ids.length
      ? await tx.query<{ id: string; trial_started_at: Date | null; trial_account: string | null; created_at: Date }>(
          `select distinct h.id, h.trial_started_at, h.trial_account, h.created_at from households h
           join tv_identifiers i on i.household = h.id where i.hmac = any($1::text[])
           order by h.trial_started_at nulls last, h.created_at`,
          [ids.map((i) => i.hmac)],
        )
      : [];
    let household = found[0];
    if (!household) {
      household = (
        await tx.query<{ id: string; trial_started_at: Date | null; trial_account: string | null; created_at: Date }>(
          "insert into households default values returning id, trial_started_at, trial_account, created_at",
        )
      )[0]!;
    }
    for (const other of found.slice(1)) {
      await tx.query("update tv_identifiers set household = $1 where household = $2", [household.id, other.id]);
      await tx.query(
        `insert into account_tvs (account, household, model, added_at)
         select account, $1, model, added_at from account_tvs where household = $2 on conflict do nothing`,
        [household.id, other.id],
      );
      await tx.query("delete from account_tvs where household = $1", [other.id]);
    }
    for (const i of ids)
      await tx.query("insert into tv_identifiers (hmac, kind, household) values ($1, $2, $3) on conflict (hmac) do nothing", [
        i.hmac,
        i.kind,
        household.id,
      ]);
    await tx.query(
      "insert into account_tvs (account, household, model) values ($1, $2, $3) on conflict (account, household) do update set model = excluded.model",
      [account.id, household.id, reg.model.slice(0, 200)],
    );

    let trial: TrialStatus;
    let trialStart = account.trial_started_at;
    if (!account.trial_started_at && !household.trial_started_at) {
      trialStart = now;
      await tx.query("update accounts set trial_started_at = $1 where id = $2", [now, account.id]);
      await tx.query("update households set trial_started_at = $1, trial_account = $2 where id = $3", [now, account.id, household.id]);
      trial = "started";
    } else if (household.trial_started_at && household.trial_account !== account.id && !account.trial_started_at) {
      trial = "used-on-this-tv";
    } else {
      const running = trialStart && trialStart.getTime() + TRIAL_DAYS * DAY > now.getTime();
      trial = running ? "active" : household.trial_account === account.id ? "expired" : "used-by-account";
    }
    return { household: household.id, trial, entitlement: await entitlementOf(tx, account.id, now) };
  });
}

export async function entitlementOf(db: Db, accountId: string, now = new Date()): Promise<Entitlement> {
  const [row] = await db.query<{ trial_started_at: Date | null; status: string | null; period_end: Date | null }>(
    `select a.trial_started_at, s.status, s.period_end from accounts a
     left join subscriptions s on s.account = a.id where a.id = $1`,
    [accountId],
  );
  const trialEnds = row?.trial_started_at ? new Date(row.trial_started_at.getTime() + TRIAL_DAYS * DAY) : null;
  const subscribed =
    !!row?.status && ["active", "grace"].includes(row.status) && (!row.period_end || row.period_end.getTime() > now.getTime());
  const inTrial = !!trialEnds && trialEnds.getTime() > now.getTime();
  return {
    accountId,
    entitled: subscribed || inTrial,
    plan: subscribed ? "subscription" : inTrial ? "trial" : "none",
    trialEndsAt: trialEnds?.toISOString() ?? null,
    subscriptionEndsAt: row?.period_end?.toISOString() ?? null,
  };
}
