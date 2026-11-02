// Closing network ADB at the end of setup, and proving it is closed. The rule is upstream's
// (tools/adb-closed.py): only the TV refusing the connection shows a port closed. A timeout, no route, or a
// connection that merely dropped proves nothing, and neither do the toggles' looks.
import type { TvShell } from "./shell.ts";

/** What a TCP connect to the TV's port came back with. The phone's native layer answers this. */
export type PortProbe =
  | "refused" // the TV answered with a refusal: closed
  | "open" // something accepted the connection: still open
  | "no-answer" // nothing within the timeout: the TV may be asleep or rebooting
  | "unreachable" // no route, or (iOS) Local Network permission denied
  | "local-permission"; // the phone OS blocked the local network for this app

export interface PortProber {
  probe(host: string, port: number, timeoutMs: number): Promise<PortProbe>;
}

export type ClosedVerdict = "closed" | "open" | "unknown";

export interface PortCheck {
  port: number;
  probe: PortProbe;
}

/** 127.0.0.1, localhost, ::1, 0.0.0.0: never the TV, so a refusal there says nothing about it. */
export function isThisDevice(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  return (
    h === "localhost" || h.endsWith(".localhost") || /^127\./.test(h) || h === "::1" || h === "0.0.0.0" || h === "::" ||
    /^::ffff:127\./.test(h)
  );
}

/**
 * Checks every port network ADB had: 5555, and Wireless debugging's own port if the TV had it on (it takes a
 * new port each time it starts, so it is noted before switching off). Closed only if every one refuses.
 */
export async function verifyAdbClosed(
  prober: PortProber,
  host: string,
  ports: number[],
  timeoutMs = 3000,
): Promise<{ verdict: ClosedVerdict; checks: PortCheck[] }> {
  if (isThisDevice(host)) return { verdict: "unknown", checks: [] };
  const checks: PortCheck[] = [];
  for (const port of [...new Set(ports)]) checks.push({ port, probe: await prober.probe(host, port, timeoutMs) });
  const verdict: ClosedVerdict = checks.some((c) => c.probe === "open")
    ? "open"
    : checks.every((c) => c.probe === "refused")
      ? "closed"
      : "unknown";
  return { verdict, checks };
}

/**
 * Switches Wireless debugging and USB/network debugging off from the shell. adbd stops, so the connection
 * this runs on drops: a failed answer to the second command is expected. What the user still does on the TV:
 * revoke the debugging authorisations (Developer options), which the shell cannot do.
 */
export async function switchDebuggingOff(shell: TvShell): Promise<void> {
  await shell.run("settings put global adb_wifi_enabled 0");
  await shell.run("settings put global adb_enabled 0");
}
