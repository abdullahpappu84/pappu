/* Run with: npx tsx --env-file=.env src/db/seed-cli.ts */
import { pool } from "./index";
import { ensureGatewayMethods, seedDatabase } from "./seed";

seedDatabase()
  .then(() => ensureGatewayMethods())
  .then(() => console.log("✓ Database seeded (idempotent)."))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
