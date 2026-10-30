// Which tested lists fit the TV in front of us. Upstream identifies a set in prose (tv.json and the list's
// header: "device sabrina", "codename longshan", "model K80A", build IDs), so the feed builder extracts the
// identifiers and this scores them against the TV's getprop answers. The app always asks the user to confirm
// the pick, and offers the runners-up when several lists share a board.

export interface ModelMatch {
  /** Lower-case codenames, model numbers, product and board names. */
  ids: string[];
  /** Build IDs such as uttc.250917.004, matched against the fingerprint. */
  builds: string[];
  /** Lower-case brand from tv.json. */
  brand: string;
}

/** The getprop answers the app reads over ADB during setup. */
export interface TvProps {
  model?: string; // ro.product.model
  device?: string; // ro.product.device
  name?: string; // ro.product.name
  product?: string; // ro.build.product
  board?: string; // ro.product.board
  brand?: string; // ro.product.brand
  manufacturer?: string; // ro.product.manufacturer
  fingerprint?: string; // ro.build.fingerprint
}

export const PROP_KEYS: Record<keyof TvProps, string> = {
  model: "ro.product.model",
  device: "ro.product.device",
  name: "ro.product.name",
  product: "ro.build.product",
  board: "ro.product.board",
  brand: "ro.product.brand",
  manufacturer: "ro.product.manufacturer",
  fingerprint: "ro.build.fingerprint",
};

const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();
const squash = (s: string) => s.replace(/[\s_-]+/g, "");

export interface MatchResult<T> {
  item: T;
  score: number;
  why: string[];
}

/** Lists whose identifiers fit these props, best first. A score of 5 or more is a real candidate. */
export function matchModels<T extends { match: ModelMatch }>(props: TvProps, models: T[], min = 5): MatchResult<T>[] {
  const p = {
    model: norm(props.model),
    device: norm(props.device),
    name: norm(props.name),
    product: norm(props.product),
    board: norm(props.board),
    brand: norm(props.brand),
    manufacturer: norm(props.manufacturer),
    fingerprint: norm(props.fingerprint),
  };
  const segments = new Set(p.fingerprint.split(/[/:]/).filter(Boolean));
  const results: MatchResult<T>[] = [];
  for (const item of models) {
    let score = 0;
    const why: string[] = [];
    for (const id of item.match.ids) {
      if (id === p.device) (score += 5), why.push(`device ${id}`);
      if (p.model && squash(id) === squash(p.model)) (score += 5), why.push(`model ${id}`);
      if (id === p.name || id === p.product || id === p.board) (score += 3), why.push(`product ${id}`);
      else if (segments.has(id) && id !== p.device) (score += 2), why.push(`fingerprint ${id}`);
    }
    for (const b of item.match.builds) if (p.fingerprint.includes(b)) (score += 2), why.push(`build ${b}`);
    const brand = item.match.brand;
    if (brand && (p.brand.includes(brand) || p.manufacturer.includes(brand) || brand.includes(p.brand || "\u0000")))
      (score += 1), why.push(`brand ${brand}`);
    if (score >= min) results.push({ item, score, why });
  }
  return results.sort((a, b) => b.score - a.score);
}

const STOP = new Set([
  "android", "google", "mediatek", "realtek", "amlogic", "smart", "tv", "api", "sdk", "uhd", "fhd", "hd", "ram",
  "europe", "uk", "us", "india", "firmware", "build", "the", "and", "with", "same", "model", "device", "codename",
  "product", "board", "fire", "os", "projector", "gb", "mb", "user", "release", "keys", "userdebug", "type",
]);

/** Identifiers from tv.json's name and the list header, for the feed builder. */
export function extractMatch(tvName: string, brand: string, header: string[], folder: string): ModelMatch {
  const text = [tvName, ...header.slice(0, 6)].join("\n");
  const ids = new Set<string>();
  const add = (raw: string) => {
    const t = raw.toLowerCase().replace(/^["'(]+|["'),.;:]+$/g, "");
    if (t.length < 3 || STOP.has(t)) return;
    if (/^\d+(\.\d+)?$/.test(t) || /^\d+(gb|mb|kb|k|p|hz|")$/.test(t) || /^\d{4}-\d{2}-\d{2}$/.test(t)) return;
    if (/^(api|sdk)\d+$/.test(t) || /^android\d*$/.test(t)) return;
    ids.add(t);
  };
  // After a keyword: device sabrina, codename "holan", model K80A, product sabrina_prod_stable, board R4.
  for (const m of text.matchAll(/\b(?:device|codename|model|product|board)\s*[=:]?\s*"?([A-Za-z0-9_.-]+)"?/gi)) add(m[1]!);
  // Words with both letters and digits: 55C845X2, G08_4K_GB, TP.MT5510S.PB782, RTK2851P, AFTKM is caught above.
  for (const m of text.matchAll(/\b[A-Za-z0-9_.-]*[A-Za-z][A-Za-z0-9_.-]*\b/g)) {
    const w = m[0]!;
    if (/\d/.test(w) && /[A-Za-z]/.test(w) && !/^[A-Z0-9]{4}\.\d{6}\.\d{3}$/i.test(w)) add(w);
  }
  // Parenthesised single words: (sabrina), (karat), (longshan).
  for (const m of text.matchAll(/\(([a-z][a-z0-9_]{2,})[,)]/g)) add(m[1]!);
  const builds = new Set([...text.matchAll(/\b([A-Z0-9]{4}\.\d{6}\.\d{3})\b/g)].map((m) => m[1]!.toLowerCase()));
  for (const part of folder.split("-")) if (/\d/.test(part) && /[a-z]/.test(part)) add(part);
  return { ids: [...ids].sort(), builds: [...builds].sort(), brand: brand.toLowerCase() };
}
