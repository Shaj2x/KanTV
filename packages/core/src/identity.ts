// What the TV says about itself during setup: the props that pick its debloat list, and the identifiers the
// one-trial-per-TV rule uses. Only SHA-256 hashes of the identifiers leave the phone; the backend keys them
// again with its own secret (HMAC) before storing them.
import { PROP_KEYS, type TvProps } from "./match.ts";
import { linesOf, type TvShell } from "./shell.ts";

export interface TvIdentity {
  props: TvProps;
  serial: string;
  androidId: string;
  sdk: number;
  /** "0" or "" means port 5555 accepts anyone on the network without the Allow prompt. */
  adbSecure: string;
}

const EXTRA = { serial: "ro.serialno", serialBoot: "ro.boot.serialno", sdk: "ro.build.version.sdk", adbSecure: "ro.adb.secure" };

/** One round trip: every prop as key=value, then the Android ID. */
export async function readIdentity(shell: TvShell): Promise<TvIdentity> {
  const keys = [...Object.values(PROP_KEYS), ...Object.values(EXTRA)];
  const r = await shell.run(
    `for p in ${keys.join(" ")}; do echo "$p=$(getprop $p)"; done; echo "android_id=$(settings get secure android_id)"`,
  );
  if (!r.ok) throw new Error("the TV stopped answering while it was being identified");
  const values = new Map<string, string>();
  for (const line of linesOf(r.out)) {
    const i = line.indexOf("=");
    if (i > 0) values.set(line.slice(0, i), line.slice(i + 1).trim());
  }
  const props: TvProps = {};
  for (const [k, prop] of Object.entries(PROP_KEYS)) {
    const v = values.get(prop);
    if (v) props[k as keyof TvProps] = v;
  }
  return {
    props,
    serial: values.get(EXTRA.serial) || values.get(EXTRA.serialBoot) || "",
    androidId: values.get("android_id") ?? "",
    sdk: Number(values.get(EXTRA.sdk) ?? 0),
    adbSecure: values.get(EXTRA.adbSecure) ?? "",
  };
}

/** Serials cheap boards ship with, shared by thousands of sets: no use for telling households apart. */
const JUNK_SERIALS = new Set([
  "", "unknown", "null", "0", "0123456789abcdef", "0123456789", "123456789", "1234567890", "1234567890abcdef",
  "0000000000000000", "00000000", "abcdef0123456789", "ffffffffffffffff", "serialno",
]);
/** "null" when unset; 9774d56d682e549c is the Android ID of a famous batch of emulators and early devices. */
const JUNK_ANDROID_IDS = new Set(["", "null", "0", "9774d56d682e549c", "0000000000000000"]);

export const usableSerial = (s: string) => !JUNK_SERIALS.has(s.trim().toLowerCase()) && s.trim().length >= 6;
export const usableAndroidId = (s: string) => !JUNK_ANDROID_IDS.has(s.trim().toLowerCase()) && /^[0-9a-f]{8,}$/i.test(s.trim());

export interface HouseholdIds {
  /** Survives a factory reset; absent when the serial is junk. */
  serial?: string;
  /** Changes on a factory reset; absent when unset. */
  androidId?: string;
  /** How much the trial rule can lean on these. */
  strength: "strong" | "partial" | "none";
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The hashes the backend's trial registry receives. Each is scoped to the model, so two brands that ship the
 * same junk-looking-but-valid serial pattern do not collide, and a trial counts as used if either matches.
 */
export async function householdIds(id: TvIdentity): Promise<HouseholdIds> {
  const model = `${id.props.manufacturer ?? ""}|${id.props.model ?? ""}`.toLowerCase();
  const out: HouseholdIds = { strength: "none" };
  if (usableSerial(id.serial)) out.serial = await sha256Hex(`kantv-serial-v1|${model}|${id.serial.trim().toLowerCase()}`);
  if (usableAndroidId(id.androidId)) out.androidId = await sha256Hex(`kantv-aid-v1|${model}|${id.androidId.trim().toLowerCase()}`);
  out.strength = out.serial && out.androidId ? "strong" : out.serial || out.androidId ? "partial" : "none";
  return out;
}
