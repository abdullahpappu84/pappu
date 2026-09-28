/* Run with: npx tsx --env-file=.env src/db/seed-cli.ts  (creates tables if needed + seeds defaults) */
import { pool } from "./index";
import { ensureSchema } from "./migrate";
import { ensureGatewayMethods, seedDatabase } from "./seed";

ensureSchema()
  .then(() => seedDatabase())
  .then(() => ensureGatewayMethods())
  .then(() => console.log("✓ Database schema ready and seeded (idempotent)."))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
