// One debloat run, in the order the safety rules need: check the list, ask the TV what may be disabled,
// store the recovery record, and only then change anything. A record that cannot be stored stops the run
// with the TV untouched (#239).
import { applyDisable, type ApplyResult } from "./apply.ts";
import { planDisable, type DisablePlan, type GuardOptions } from "./guards.ts";
import { validateList, type ListRefusal } from "./list.ts";
import { extendRecord, queryPackages, takeRecord, type RecoveryRecord } from "./recovery.ts";
import type { TvShell } from "./shell.ts";

/** Where records live. KanTV keeps one on the phone and a copy in the account. */
export interface RecordStore {
  get(tvId: string, listId: string): Promise<RecoveryRecord | null>;
  /** Must not resolve until the record is durably stored. */
  put(tvId: string, listId: string, record: RecoveryRecord): Promise<void>;
}

export interface DebloatRequest {
  tvId: string;
  listId: string;
  /** Validated list packages (validateList), KanTV's must-keep entries already removed. */
  packages: string[];
  options?: GuardOptions;
  /** Remove KanTV's must-keep entries (the phone remote's service). Off only to compare with upstream's scripts. */
  applyMustKeep?: boolean;
  onProgress?: (name: string, index: number, total: number) => void;
}

export type DebloatResult =
  | { ok: false; refusal: ListRefusal }
  | { ok: true; plan: DisablePlan; record: RecoveryRecord; applied: ApplyResult };

/**
 * Checks the names again right before anything reaches the TV, whatever the caller says it did: only package
 * names (nothing a shell could run), no core system package, and KanTV's must-keep entries removed. The feed is
 * signed, but a build bug or a leaked key must still never get a core package or a command onto a TV.
 */
function checkedPackages(packages: string[], applyMustKeep = true): { ok: true; packages: string[] } | { ok: false; refusal: ListRefusal } {
  const v = validateList({ entries: packages.map((name, i) => ({ name, comment: "", line: i + 1 })), header: [] }, { applyMustKeep });
  return v.ok ? { ok: true, packages: v.packages } : v;
}

/** Plans without changing anything: what the app shows before the user confirms. */
export async function previewDebloat(shell: TvShell, packages: string[], options?: GuardOptions): Promise<DisablePlan> {
  const checked = checkedPackages(packages);
  if (!checked.ok) throw new Error(`list refused: ${checked.refusal.kind}`);
  return planDisable(shell, checked.packages, options);
}

export async function runDebloat(shell: TvShell, store: RecordStore, req: DebloatRequest): Promise<DebloatResult> {
  const checked = checkedPackages(req.packages, req.applyMustKeep ?? true);
  if (!checked.ok) return { ok: false, refusal: checked.refusal };
  req = { ...req, packages: checked.packages };
  const plan = await planDisable(shell, req.packages, req.options);

  // First record wins: a retry after a half-applied run must not record the broken state as the original.
  const existing = await store.get(req.tvId, req.listId);
  let record: RecoveryRecord;
  if (existing) {
    const { installed, disabled } = await queryPackages(shell);
    const ext = extendRecord(existing, req.packages, installed, disabled);
    record = ext.record;
    if (ext.added.length || ext.arrived.length) await store.put(req.tvId, req.listId, record);
  } else {
    record = await takeRecord(shell, req.packages, { host: req.tvId, list: req.listId });
    await store.put(req.tvId, req.listId, record);
  }

  const applied = await applyDisable(shell, plan.disable, req.onProgress);
  return { ok: true, plan, record, applied };
}
