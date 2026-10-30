/**
 * One shell command on the TV. `ok: false` means the transport failed (the TV did not answer); a command
 * that ran and failed on the TV is `ok: true` with the TV's own answer in `out`, as adb shell reports it.
 */
export type ShellResult = { ok: true; out: string } | { ok: false; out: string };

export interface TvShell {
  run(command: string): Promise<ShellResult>;
}

/** The last line of an answer, the way `tail -n 1` reads it, with any CR removed. */
export function lastLine(text: string): string {
  const lines = text.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return (lines[lines.length - 1] ?? "").replace(/\r/g, "");
}

export function linesOf(text: string): string[] {
  return text.replace(/\r/g, "").split("\n");
}

/** `package:name` lines, as pm list packages prints them. */
export function packageNames(text: string): Set<string> {
  const names = new Set<string>();
  for (const line of linesOf(text)) {
    if (line.startsWith("package:")) {
      const name = line.slice("package:".length).trim().split(/\s+/)[0];
      if (name) names.add(name);
    }
  }
  return names;
}
