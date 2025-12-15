/**
 * Fixture runner for non-production environments.
 *
 * Runs:
 * 1. Data integrity checks
 * 2. Known fixture seeding
 * 3. Historical data generation
 *
 * Usage: npx tsx scripts/fixtures/run.ts
 *
 * This script is designed to run _after_ migrations. In staging:
 *   npm run start:migrate && npm run seed:fixtures
 */

import "dotenv/config";

import { generateHistoricalData } from "./generate-historical";
import { runIntegrityChecks } from "./integrity-checks";
import { seedFixtures } from "./seed-fixtures";

async function run() {
  console.log("Running fixture setup...\n");

  console.log("1. Running integrity checks...");
  await runIntegrityChecks();

  console.log("\n2. Seeding fixture data...");
  await seedFixtures();

  console.log("\n3. Generating historical data...");
  await generateHistoricalData();

  console.log("\nFixture setup complete");
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fixture setup failed:", error);
    process.exit(1);
  });
