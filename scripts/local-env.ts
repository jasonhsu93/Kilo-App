import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { writeFile, access } from "node:fs/promises";
async function main() {
  try {
    await access(".env.local");
    if (!process.argv.includes("--refresh"))
      throw new Error(
        ".env.local already exists. Use --refresh only to replace it with this local stack’s configuration.",
      );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const { stdout } = await promisify(execFile)(
    resolve("node_modules/.bin/supabase"),
    ["status", "--output-format", "json"],
    {
      env: { ...process.env, SUPABASE_HOME: resolve(".local/supabase") },
      maxBuffer: 1000000,
    },
  );
  const parsed = JSON.parse(stdout),
    env = parsed.env || parsed;
  const url = env.API_URL,
    publicKey = env.PUBLISHABLE_KEY || env.ANON_KEY,
    secret = env.SERVICE_ROLE_KEY || env.SECRET_KEY,
    db = env.DB_URL;
  if (!url || !publicKey || !secret || !db)
    throw new Error(
      "Unexpected Supabase status format; no environment file written.",
    );
  const text = [
    `NEXT_PUBLIC_SUPABASE_URL=${url}`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publicKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${secret}`,
    `DATABASE_URL=${db}`,
    "NEXT_PUBLIC_APP_URL=http://localhost:3000",
    "ALLOW_REMOTE_DATABASE=false",
    "DEV_SEED_ALLOWED=true",
    "SUPABASE_PROJECT_PURPOSE=development",
    ...(env.MAILPIT_URL ? [`LOCAL_MAIL_URL=${env.MAILPIT_URL}`] : []),
    "",
  ].join("\n");
  await writeFile(".env.local", text, { mode: 0o600 });
  console.log(
    "Local credentials saved to ignored .env.local (owner-readable). No credentials were printed.",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
