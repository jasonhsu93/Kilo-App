import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
const command = process.argv[2] || "start";
if (!["start", "stop", "status"].includes(command))
  throw new Error("Allowed commands: start, stop, status");
const flags = process.argv.slice(3);
if (
  command === "start" &&
  !flags.includes("--exclude") &&
  !flags.includes("-x")
)
  flags.push("--exclude", "realtime,storage,functions,studio,analytics,pooler");
const child = spawn(
  resolve("node_modules/.bin/supabase"),
  [command, ...flags],
  {
    env: { ...process.env, SUPABASE_HOME: resolve(".local/supabase") },
    stdio: ["inherit", "pipe", "pipe"],
  },
);
for (const stream of [child.stdout, child.stderr])
  createInterface({ input: stream }).on("line", (line) => {
    // Supabase status output includes local service-role credentials. Keep them out
    // of logs; db:env reads the structured status directly into an ignored file.
    if (
      line.trim().startsWith("{") ||
      /KEY|SECRET|TOKEN|postgresql:\/\//i.test(line)
    )
      return;
    console.log(line);
  });
child.on("exit", (code) => {
  if (code === 0 && command === "start")
    console.log("Local Supabase ready. Run npm run db:env, then npm run seed.");
  process.exitCode = code ?? 1;
});
