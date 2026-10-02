import path from "path";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./index";

/**
 * Creates / updates the database schema automatically at startup, so a fresh or wiped database never
 * causes "relation does not exist" errors. Uses the SQL files in /drizzle (generated with `npx drizzle-kit generate`).
 *
 *  - empty database                → applies all migrations
 *  - database managed by migrations → applies only new migrations
 *  - database created earlier with `drizzle-kit push` (no journal) → records existing migrations as applied (baseline)
 */
const MIGRATIONS = path.join(process.cwd(), "drizzle");
const g = globalThis as typeof globalThis & { __arSchemaReady?: boolean; __arSchemaPromise?: Promise<void> };

async function run() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(424243)`);
    const r = await tx.execute<{ users: string | null; journal: string | null }>(
      sql`select to_regclass('public.users')::text as users, to_regclass('drizzle.__drizzle_migrations')::text as journal`,
    );
    const { users, journal } = r.rows[0] ?? { users: null, journal: null };
    if (users && !journal) {
      // Schema was created by `drizzle-kit push` → baseline the journal instead of re-creating tables.
      const files = readMigrationFiles({ migrationsFolder: MIGRATIONS });
      await tx.execute(sql`create schema if not exists drizzle`);
      await tx.execute(sql`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`);
      const identityColumn = await tx.execute<{ present: boolean }>(sql`select exists (
        select 1 from information_schema.columns where table_schema = 'public' and table_name = 'games' and column_name = 'api_source'
      ) as present`);
      const baseline = identityColumn.rows[0]?.present ? files : files.slice(0, -1);
      for (const f of baseline) await tx.execute(sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${f.hash}, ${f.folderMillis})`);
      console.info(`[db] existing schema detected — baselined ${baseline.length} prior migration(s)`);
    }
  });
  await migrate(db, { migrationsFolder: MIGRATIONS });
}

export async function ensureSchema() {
  if (g.__arSchemaReady) return;
  g.__arSchemaPromise ??= run()
    .then(() => {
      g.__arSchemaReady = true;
    })
    .finally(() => {
      g.__arSchemaPromise = undefined;
    });
  await g.__arSchemaPromise;
}
