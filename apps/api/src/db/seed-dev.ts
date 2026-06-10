// Dev seeding: a user + membership on the default workspace so the web app
// can sign in locally, plus the global skill library. Idempotent.
//   pnpm --filter api seed
import "../env.js";
import bcrypt from "bcryptjs";
import { pool } from "./client.js";
import { DEFAULT_WORKSPACE_ID } from "../lib/workspace.js";
import { seedGlobalSkills } from "../services/skills/store.js";

const EMAIL = "dev@example.com";
const PASSWORD = "devpassword";

async function run() {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, name, password_hash, workspace_id, role, email_verified)
     VALUES ($1, 'Dev User', $2, $3, 'admin', NOW())
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [EMAIL, hash, DEFAULT_WORKSPACE_ID]
  );
  await pool.query(
    `INSERT INTO memberships (user_id, workspace_id, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (user_id, workspace_id) DO NOTHING`,
    [rows[0].id, DEFAULT_WORKSPACE_ID]
  );
  const skills = await seedGlobalSkills();
  console.log(`seeded: user ${EMAIL} / ${PASSWORD}, ${skills} global skills`);
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
