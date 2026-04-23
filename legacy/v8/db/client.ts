import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema.ts";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for V8 PostgreSQL runtime.");
}

const pool = new Pool({ connectionString: databaseUrl });

export const dbV8 = drizzle({ client: pool, schema });
