// Debloat list parsing and validation, with the rules of cleanyourtv tools/disable.sh: a list is refused
// whole when one entry is not a bare package name (#165) or names a core package (#884, #1578).
import { KANTV_MUST_KEEP, PACKAGE_RE, isCore } from "./packages.ts";

export interface ListEntry {
  name: string;
  /** The comment after the name on the same line, if any. */
  comment: string;
  line: number;
}

export interface ParsedList {
  entries: ListEntry[];
  /** The leading comment block, without the "# ". */
  header: string[];
}

/**
 * Reads a list the way disable.sh does: BOM and CRLF removed, blank and comment lines dropped, a trailing
 * "  # comment" removed, the first word kept. Names are not checked here; see validateList.
 */
export function parseList(text: string): ParsedList {
  const lines = text.replace(/^﻿/, "").split("\n").map((l) => l.replace(/\r$/, ""));
  const header: string[] = [];
  let inHeader = true;
  const entries: ListEntry[] = [];
  lines.forEach((raw, i) => {
    if (/^\s*(#|$)/.test(raw)) {
      if (inHeader && /^\s*#/.test(raw)) header.push(raw.replace(/^\s*#\s?/, ""));
      return;
    }
    inHeader = false;
    const commentAt = raw.search(/\s+#/);
    const body = commentAt === -1 ? raw : raw.slice(0, commentAt);
    const comment = commentAt === -1 ? "" : raw.slice(commentAt).replace(/^\s+#\s*/, "");
    const name = body.trim().split(/\s+/)[0] ?? "";
    entries.push({ name, comment, line: i + 1 });
  });
  return { entries, header };
}

export type ListRefusal =
  | { kind: "not-a-package"; names: string[] }
  | { kind: "empty" }
  | { kind: "core"; names: string[] };

export interface ValidatedList {
  ok: true;
  /** In list order, each once. */
  packages: string[];
  /** Entries KanTV keeps enabled whatever the list says, with the reason. */
  kept: { name: string; reason: string }[];
}

export function validateList(
  parsed: ParsedList,
  { applyMustKeep = true }: { applyMustKeep?: boolean } = {},
): ValidatedList | { ok: false; refusal: ListRefusal } {
  const names = parsed.entries.map((e) => e.name);
  const bad = names.filter((n) => !PACKAGE_RE.test(n));
  if (bad.length) return { ok: false, refusal: { kind: "not-a-package", names: bad } };
  if (!names.length) return { ok: false, refusal: { kind: "empty" } };
  const core = names.filter(isCore);
  if (core.length) return { ok: false, refusal: { kind: "core", names: core } };
  const unique = [...new Set(names)];
  const kept = applyMustKeep
    ? unique.filter((n) => KANTV_MUST_KEEP.has(n)).map((name) => ({ name, reason: KANTV_MUST_KEEP.get(name)! }))
    : [];
  return { ok: true, packages: unique.filter((n) => !kept.some((k) => k.name === n)), kept };
}
