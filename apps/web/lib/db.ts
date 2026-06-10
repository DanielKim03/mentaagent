import { Pool, type PoolConfig } from "pg";

// Lazy pool: created on first use, not at module load. Keeps `next build`
// from crashing when DATABASE_URL isn't present in the build environment.
const globalForPool = globalThis as unknown as { __mentaPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set (web)");
  }
  const config: PoolConfig = { connectionString };
  if (process.env.PGSSL === "require") {
    config.ssl = { rejectUnauthorized: false };
  }
  return new Pool(config);
}

export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    if (!globalForPool.__mentaPool) {
      globalForPool.__mentaPool = createPool();
    }
    const real = globalForPool.__mentaPool as unknown as Record<
      string | symbol,
      unknown
    >;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});
