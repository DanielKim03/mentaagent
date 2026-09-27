import { Pool, type PoolConfig } from "pg";
import { env } from "../env.js";

const config: PoolConfig = { connectionString: env.DATABASE_URL };
// A remote Postgres that requires SSL: set PGSSL=require.
if (env.PGSSL === "require") {
  config.ssl = { rejectUnauthorized: false };
}

export const pool = new Pool(config);
