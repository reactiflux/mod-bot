/**
 * Dumps the entire SQLite database to a JSON file.
 * Usage: npx tsx scripts/dump-db-to-json.ts [output-file] [--sample]
 *
 * Options:
 *   --sample    Sample large tables (message_stats limited to 1000 rows)
 *   --exclude=table1,table2   Exclude specific tables
 *
 * Default output: ./db-dump.json
 */

import { writeFileSync } from "fs";
import SQLite from "better-sqlite3";

const DATABASE_URL = process.env.DATABASE_URL ?? "./mod-bot.sqlite3";

// Parse args
const args = process.argv.slice(2);
const sampleMode = args.includes("--sample");
const excludeArg = args.find((a) => a.startsWith("--exclude="));
const excludeTables = excludeArg
  ? excludeArg.replace("--exclude=", "").split(",")
  : [];
const outputFile = args.find((a) => !a.startsWith("--")) ?? "./db-dump.json";

// Tables with row limits in sample mode
const SAMPLE_LIMITS: Record<string, number> = {
  message_stats: 1000,
  sessions: 100,
  users: 100,
  guilds: 100,
  guild_subscriptions: 100,
};

interface TableDump {
  name: string;
  count: number;
  totalCount?: number; // Only present if sampled
  rows: Record<string, unknown>[];
}

interface DatabaseDump {
  exportedAt: string;
  databasePath: string;
  sampled: boolean;
  excludedTables: string[];
  tables: TableDump[];
}

function dumpDatabase(): DatabaseDump {
  const db = new SQLite(DATABASE_URL, { readonly: true });

  // Get all table names (excluding sqlite internals and kysely migration tables)
  const tables = db
    .prepare(
      `
      SELECT name FROM sqlite_master
      WHERE type='table'
      AND name NOT LIKE 'sqlite_%'
      AND name NOT LIKE 'kysely_%'
      ORDER BY name
    `,
    )
    .all() as { name: string }[];

  const tableDumps: TableDump[] = [];

  for (const { name } of tables) {
    if (excludeTables.includes(name)) {
      console.log(`  Skipping ${name} (excluded)`);
      continue;
    }

    // Get total count
    const countResult = db
      .prepare(`SELECT COUNT(*) as count FROM "${name}"`)
      .get() as { count: number };
    const totalCount = countResult.count;

    // Determine limit
    const limit = sampleMode ? SAMPLE_LIMITS[name] : undefined;
    const query = limit
      ? `SELECT * FROM "${name}" ORDER BY ROWID DESC LIMIT ${limit}`
      : `SELECT * FROM "${name}"`;

    const rows = db.prepare(query).all() as Record<string, unknown>[];

    // Parse JSON columns where applicable
    const parsedRows = rows.map((row) => {
      const parsed: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === "string") {
          // Try to parse as JSON if it looks like JSON
          if (
            (value.startsWith("{") && value.endsWith("}")) ||
            (value.startsWith("[") && value.endsWith("]"))
          ) {
            try {
              parsed[key] = JSON.parse(value);
            } catch {
              parsed[key] = value;
            }
          } else {
            parsed[key] = value;
          }
        } else {
          parsed[key] = value;
        }
      }
      return parsed;
    });

    const tableDump: TableDump = {
      name,
      count: parsedRows.length,
      rows: parsedRows,
    };

    // Add totalCount if we sampled
    if (limit && totalCount > limit) {
      tableDump.totalCount = totalCount;
    }

    tableDumps.push(tableDump);
  }

  db.close();

  return {
    exportedAt: new Date().toISOString(),
    databasePath: DATABASE_URL,
    sampled: sampleMode,
    excludedTables: excludeTables,
    tables: tableDumps,
  };
}

function main() {
  console.log(`Dumping database: ${DATABASE_URL}`);
  if (sampleMode) console.log("Sample mode: ON (limiting large tables)");
  if (excludeTables.length)
    console.log(`Excluding: ${excludeTables.join(", ")}`);

  const dump = dumpDatabase();

  // Summary
  console.log("\nTable summary:");
  for (const table of dump.tables) {
    const sampledNote = table.totalCount
      ? ` (sampled from ${table.totalCount})`
      : "";
    console.log(`  ${table.name}: ${table.count} rows${sampledNote}`);
  }

  // Write to file
  writeFileSync(outputFile, JSON.stringify(dump, null, 2));
  console.log(`\nWritten to: ${outputFile}`);
}

main();
