import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "./database";
import { integrationTests } from "../tests/integration/ledger";
async function main() {
  const dir = await mkdtemp(join(tmpdir(), "kilo-postgres-"));
  const port = Number(process.env.TEST_DATABASE_PORT || 55439);
  const db = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "test-only",
    port,
    persistent: true,
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: () => {},
  });
  let client: Client | undefined;
  try {
    await db.initialise();
    await db.start();
    const url = `postgresql://postgres:test-only@127.0.0.1:${port}/postgres`;
    client = new Client(url);
    await client.connect();
    // Only Auth's documented identity interface is shimmed; all application SQL,
    // grants, RLS, transactions, and locking execute in a real PostgreSQL server.
    await client.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon;`);
    await migrate(client);
    await integrationTests(client, url);
  } finally {
    await client?.end();
    await db.stop().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
