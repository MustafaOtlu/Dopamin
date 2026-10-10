import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { readFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";

export interface Database {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}
export interface RootDatabase extends Database {
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function createDatabase(location?: string): Promise<RootDatabase> {
  if (!location && process.env.DATABASE_URL) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 10000,
      statement_timeout: 30000,
    });
    return {
      query: async <T>(sql: string, params: unknown[] = []) =>
        (await pool.query(sql, params)).rows as T[],
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query("begin");
          const result = await fn({
            query: async <T>(sql: string, params: unknown[] = []) =>
              (await client.query(sql, params)).rows as T[],
          });
          await client.query("commit");
          return result;
        } catch (err) {
          await client.query("rollback");
          throw err;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_LOCAL_PREVIEW && !location)
    throw new Error(
      "Canlı ortam DATABASE_URL gerektirir. Yerel önizleme için ALLOW_LOCAL_PREVIEW=1.",
    );
  const dir = location || process.env.PGLITE_PATH || path.resolve(".data/postgres");
  if (dir !== "memory://") await mkdir(dir, { recursive: true });
  const pg = new PGlite(dir === "memory://" ? undefined : dir);
  return {
    query: async <T>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows,
    transaction: (fn) =>
      pg.transaction((tx) =>
        fn({
          query: async <T>(sql: string, params: unknown[] = []) =>
            (await tx.query<T>(sql, params)).rows,
        }),
      ),
    close: () => pg.close(),
  };
}

export async function migrate(db: RootDatabase) {
  await db.query(
    "create table if not exists schema_migrations(name text primary key, applied_at timestamptz not null default now())",
  );
  const files = (await readdir(path.resolve("db/migrations")))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if ((await db.query("select name from schema_migrations where name=$1", [file])).length)
      continue;
    const sql = await readFile(path.resolve("db/migrations", file), "utf8");
    await db.transaction(async (tx) => {
      // One statement at a time supports both pg and PGlite, including dollar-quoted functions.
      for (const statement of splitSql(sql)) await tx.query(statement);
      await tx.query("insert into schema_migrations(name) values($1)", [file]);
    });
  }
}

export function splitSql(sql: string): string[] {
  const statements: string[] = [];
  let current = "",
    quote = "",
    dollar = "",
    lineComment = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i],
      next = sql[i + 1];
    if (lineComment) {
      current += c;
      if (c === "\n") lineComment = false;
      continue;
    }
    if (!quote && !dollar && c === "-" && next === "-") {
      lineComment = true;
      current += c;
      continue;
    }
    if (dollar) {
      if (sql.startsWith(dollar, i)) {
        current += dollar;
        i += dollar.length - 1;
        dollar = "";
      } else current += c;
      continue;
    }
    if (quote) {
      current += c;
      if (c === quote) {
        if (next === quote) {
          current += next;
          i++;
        } else quote = "";
      }
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      current += c;
      continue;
    }
    if (c === "$") {
      const match = sql.slice(i).match(/^\$[a-zA-Z_]*\$/);
      if (match) {
        dollar = match[0];
        current += dollar;
        i += dollar.length - 1;
        continue;
      }
    }
    if (c === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
    } else current += c;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

const CURRENT_SCHEMA = 28;
const globalDb = globalThis as typeof globalThis & {
  pusulaDb?: Promise<RootDatabase>;
  pusulaMigration?: Promise<void>;
  pusulaSchema?: number;
};
export async function getDb() {
  globalDb.pusulaDb ||= createDatabase();
  const db = await globalDb.pusulaDb;
  if ((globalDb.pusulaSchema || 0) < CURRENT_SCHEMA) {
    globalDb.pusulaMigration ||= migrate(db)
      .then(() => {
        globalDb.pusulaSchema = CURRENT_SCHEMA;
      })
      .finally(() => {
        globalDb.pusulaMigration = undefined;
      });
    await globalDb.pusulaMigration;
  }
  return db;
}

export async function asUser<T>(
  db: RootDatabase,
  userId: string,
  fn: (tx: Database) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('app.user_id',$1,true)", [userId]);
    await tx.query("set local role pusula_app");
    return fn(tx);
  });
}
