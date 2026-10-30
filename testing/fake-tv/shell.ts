// A TvShell over the fake Android userland in this folder: each command runs in a real `sh` with the fake
// pm, cmd, dumpsys and friends first on PATH, against the TV described by a JSON state file. The same fake
// answers upstream cleanyourtv's scripts (through tv.py here), so both sides see the same TV.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ShellResult, TvShell } from "../../packages/core/src/shell.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const FAKE_TV_BIN = join(HERE, "bin");
export const FAKE_TV_DIR = HERE;

export type FakeTvState = Record<string, unknown> & { installed: string[] };

export class FakeTvShell implements TvShell {
  /** Every command sent, in order. */
  readonly sent: string[] = [];
  constructor(readonly statePath: string) {}

  static create(statePath: string, state: FakeTvState): FakeTvShell {
    writeFileSync(statePath, JSON.stringify(state, null, 1));
    return new FakeTvShell(statePath);
  }

  state(): FakeTvState & { log?: string[]; disabled?: string[] } {
    return JSON.parse(readFileSync(this.statePath, "utf8"));
  }

  run(command: string): Promise<ShellResult> {
    this.sent.push(command);
    const fail = (this.state().transport_fail as string[] | undefined) ?? [];
    if (fail.some((s) => command.includes(s))) return Promise.resolve({ ok: false, out: "" });
    return new Promise((resolve, reject) => {
      const child = spawn("sh", ["-c", command], {
        env: { ...process.env, FAKE_TV_STATE: this.statePath, PATH: `${FAKE_TV_BIN}:${process.env.PATH}` },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("error", reject);
      // adb shell merges the command's stderr into its answer.
      child.on("close", () => resolve({ ok: true, out: out + err }));
    });
  }
}
