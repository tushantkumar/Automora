import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not configured. API endpoints requiring database access will fail.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
