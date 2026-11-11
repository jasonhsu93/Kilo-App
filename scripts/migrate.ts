import { Client } from "pg";
import { databaseURL, migrate } from "./database";
async function main() {
  const client = new Client(databaseURL());
  await client.connect();
  try {
    await migrate(client);
    console.log("Migrations applied.");
  } finally {
    await client.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
