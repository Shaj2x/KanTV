// Applies a checked plan: one `pm disable-user` per shell call (chained commands can stop silently after the
// first), then the TV is read back instead of trusting the answers (#1376). The recovery record must be
// stored before this runs; see session.ts.
import { packageNames, type TvShell } from "./shell.ts";

export interface ApplyResult {
  /** Packages the TV now reports disabled, of the ones sent. */
  disabled: string[];
  /** Sent, but still enabled when read back: refused, or the change did not hold. */
  stillOn: string[];
  /** The TV stopped answering partway; these were not sent. */
  notSent: string[];
  /** The read-back failed, so nothing above is certain. */
  unverified: boolean;
}

export async function applyDisable(
  shell: TvShell,
  packages: string[],
  onProgress?: (name: string, index: number, total: number) => void,
): Promise<ApplyResult> {
  const sent: string[] = [];
  let notSent: string[] = [];
  for (const [i, name] of packages.entries()) {
    onProgress?.(name, i, packages.length);
    const r = await shell.run(`pm disable-user --user 0 ${name}`);
    if (!r.ok) {
      // This one may or may not have reached the TV; the read-back settles it.
      sent.push(name);
      notSent = packages.slice(i + 1);
      break;
    }
    sent.push(name);
  }
  const back = await shell.run("pm list packages -e --user 0");
  const enabled = back.ok ? packageNames(back.out) : new Set<string>();
  if (!enabled.size) return { disabled: [], stillOn: [], notSent, unverified: true };
  const stillOn = sent.filter((n) => enabled.has(n));
  return { disabled: sent.filter((n) => !enabled.has(n)), stillOn, notSent, unverified: false };
}
