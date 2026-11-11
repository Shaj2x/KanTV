// The smallest database surface the backend needs, so production (postgres.js) and tests (PGlite, a real
// Postgres in WebAssembly) run the same SQL.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs f in one transaction; f gets a Db bound to it. */
  transaction<T>(f: (tx: Db) => Promise<T>): Promise<T>;
}

export const MIGRATIONS_DIR = join(import.meta.dirname, "..", "migrations");

/** Applies migrations/*.sql in name order, each once. */
export async function migrate(db: Db): Promise<string[]> {
  await db.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await db.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name));
  const applied: string[] = [];
  for (const name of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(name)) continue;
    await db.transaction(async (tx) => {
      for (const statement of readFileSync(join(MIGRATIONS_DIR, name), "utf8").split(/;\s*$/m)) {
        if (statement.replace(/--.*$/gm, "").trim()) await tx.query(statement);
      }
      await tx.query("insert into schema_migrations (name) values ($1)", [name]);
    });
    applied.push(name);
  }
  return applied;
}

/** postgres.js, for production. */
export async function postgresDb(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 10, onnotice: () => {} });
  const wrap = (q: { unsafe: (s: string, p?: never[]) => Promise<unknown> }): Db => ({
    query: async <T>(s: string, p: unknown[] = []) => (await q.unsafe(s, p as never[])) as T[],
    transaction: (f) => sql.begin((tx) => f(wrap(tx as never))) as never,
  });
  return wrap(sql as never);
}
