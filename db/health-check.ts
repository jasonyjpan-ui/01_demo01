import { Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";

async function checkConnection(label: string, connectionString: string) {
  const pool = new Pool({ connectionString });
  const client = drizzle({ client: pool });

  try {
    const result = await client.execute(sql`
    select
      now() as server_time,
      current_database() as database_name,
      current_user as database_user
  `);

    const row = Array.isArray(result)
      ? result[0]
      : "rows" in result && Array.isArray(result.rows)
        ? result.rows[0]
        : undefined;

    console.log(`${label}: OK`);
    if (row) {
      console.log(row);
    }
  } finally {
    await pool.end();
  }
}

async function main() {
  const storeDriver = process.env.STORE_DRIVER;
  const databaseUrl = process.env.DATABASE_URL;
  const migrationUrl = process.env.DATABASE_URL_MIGRATION;

  if (storeDriver !== "postgres") {
    throw new Error(
      `STORE_DRIVER must be "postgres" for this check. Received: ${storeDriver ?? "(missing)"}`,
    );
  }

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing.");
  }

  if (!migrationUrl) {
    throw new Error("DATABASE_URL_MIGRATION is missing.");
  }

  console.log("Neon connection check:");
  console.log(`STORE_DRIVER: ${storeDriver}`);
  console.log(`DATABASE_URL: set`);
  console.log(`DATABASE_URL_MIGRATION: set`);

  await checkConnection("Runtime connection (DATABASE_URL)", databaseUrl);
  await checkConnection(
    "Migration connection (DATABASE_URL_MIGRATION)",
    migrationUrl,
  );
}

main().catch((error) => {
  console.error("Neon connection check: FAILED");
  console.error(error);
  process.exit(1);
});
