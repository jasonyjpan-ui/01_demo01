import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema.ts";

let db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!db) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL is required for PostgreSQL store. Set DATABASE_URL or switch STORE_DRIVER=postgres.",
      );
    }
    const pool = new Pool({ connectionString: databaseUrl });
    db = drizzle({ client: pool, schema });
  }
  return db;
}

