import { Pool, type PoolConfig } from "pg";
import { env } from "../env.js";

const config: PoolConfig = { connectionString: env.DATABASE_URL };

// Railway's public Postgres proxy requires SSL; the internal `*.railway.internal`
// host does not. Auto-enable when the URL points at a Railway proxy host so it
// works without setting PGSSL; PGSSL=require still forces SSL for any other host.
const isRailwayProxy = /\.proxy\.rlwy\.net/.test(env.DATABASE_URL);
if (env.PGSSL === "require" || isRailwayProxy) {
  config.ssl = { rejectUnauthorized: false };
}

export const pool = new Pool(config);
