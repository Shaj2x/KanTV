// One debloat run, in the order the safety rules need: check the list, ask the TV what may be disabled,
// store the recovery record, and only then change anything. A record that cannot be stored stops the run
// with the TV untouched (#239).
import { applyDisable, type ApplyResult } from "./apply.ts";
import { planDisable, type DisablePlan, type GuardOptions } from "./guards.ts";
import type { ListRefusal } from "./list.ts";
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
  onProgress?: (name: string, index: number, total: number) => void;
}

export type DebloatResult =
  | { ok: false; refusal: ListRefusal }
  | { ok: true; plan: DisablePlan; record: RecoveryRecord; applied: ApplyResult };

/** Plans without changing anything: what the app shows before the user confirms. */
export async function previewDebloat(shell: TvShell, packages: string[], options?: GuardOptions): Promise<DisablePlan> {
  return planDisable(shell, packages, options);
}

export async function runDebloat(shell: TvShell, store: RecordStore, req: DebloatRequest): Promise<DebloatResult> {
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
