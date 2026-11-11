import { config } from "dotenv";
import { Client } from "pg";
import { readdir, readFile } from "node:fs/promises";
config({ path: [".env.local", ".env"], quiet: true });
export function databaseURL() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required. See .env.example.");
  const host = new URL(url).hostname;
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(host) &&
    process.env.ALLOW_REMOTE_DATABASE !== "true"
  )
    throw new Error(
      "Remote database refused; explicitly set ALLOW_REMOTE_DATABASE=true for the intended environment.",
    );
  return url;
}
export async function migrate(client: Client) {
  await client.query(
    "create schema if not exists private; create table if not exists private.schema_migrations(name text primary key, applied_at timestamptz not null default now())",
  );
  for (const name of (await readdir("supabase/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    if (
      (
        await client.query(
          "select 1 from private.schema_migrations where name=$1",
          [name],
        )
      ).rowCount
    )
      continue;
    const cliTable = (
      await client.query(
        "select to_regclass('supabase_migrations.schema_migrations') t",
      )
    ).rows[0].t;
    if (
      cliTable &&
      (
        await client.query(
          "select 1 from supabase_migrations.schema_migrations where version=$1",
          [name.split("_")[0]],
        )
      ).rowCount
    )
      continue;
    await client.query("begin");
    try {
      const sql = await readFile(`supabase/migrations/${name}`, "utf8");
      await client.query(sql);
      if (cliTable)
        await client.query(
          "insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)",
          [name.split("_")[0], name.slice(name.indexOf("_") + 1, -4), [sql]],
        );
      await client.query(
        "insert into private.schema_migrations(name) values($1)",
        [name],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
}
