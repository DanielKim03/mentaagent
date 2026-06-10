import type { Adapter, AdapterUser, VerificationToken } from "next-auth/adapters";
import { pool } from "./db";

// Auth.js adapter backed by the `users` table (Mentapath pattern).
// Behavior:
//   - Credentials sign-in: existing user must exist with a password_hash.
//     Self-service signup goes through the /signup page, NOT createUser.
//   - OAuth sign-in (Google): a brand-new email auto-creates a user AND a
//     fresh workspace, with that user as admin.
//   - JWT sessions only — no Session table.

type DbUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  email_verified: Date | null;
  workspace_id: string | null;
};

const toAdapterUser = (u: DbUser): AdapterUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  image: u.image,
  emailVerified: u.email_verified,
});

export const adapter: Adapter = {
  async getUser(id) {
    const { rows } = await pool.query<DbUser>(
      "SELECT id, email, name, image, email_verified, workspace_id FROM users WHERE id = $1",
      [id]
    );
    return rows[0] ? toAdapterUser(rows[0]) : null;
  },

  async getUserByEmail(email) {
    const { rows } = await pool.query<DbUser>(
      "SELECT id, email, name, image, email_verified, workspace_id FROM users WHERE lower(email) = lower($1)",
      [email]
    );
    return rows[0] ? toAdapterUser(rows[0]) : null;
  },

  async getUserByAccount({ provider, providerAccountId }) {
    const { rows } = await pool.query<DbUser>(
      `SELECT u.id, u.email, u.name, u.image, u.email_verified, u.workspace_id
         FROM users u
         JOIN accounts a ON a.user_id = u.id
        WHERE a.provider = $1 AND a.provider_account_id = $2`,
      [provider, providerAccountId]
    );
    return rows[0] ? toAdapterUser(rows[0]) : null;
  },

  async createUser(user) {
    if (!user.email) {
      throw new Error("Cannot create user without an email.");
    }
    const email = user.email.trim().toLowerCase();
    // OAuth-driven signup: atomically create a fresh workspace and bind the
    // new user to it as admin.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const workspaceName =
        (user.name?.trim() || email.split("@")[0]) + "'s business";
      const ws = await client.query<{ id: string }>(
        `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
        [workspaceName]
      );
      const workspaceId = ws.rows[0].id;
      const inserted = await client.query<DbUser>(
        `INSERT INTO users (email, name, image, email_verified, workspace_id, role)
         VALUES ($1, $2, $3, $4, $5, 'admin')
         RETURNING id, email, name, image, email_verified, workspace_id`,
        [
          email,
          user.name ?? null,
          user.image ?? null,
          user.emailVerified ?? new Date(),
          workspaceId,
        ]
      );
      await client.query(
        `INSERT INTO memberships (user_id, workspace_id, role)
         VALUES ($1, $2, 'admin')`,
        [inserted.rows[0].id, workspaceId]
      );
      await client.query("COMMIT");
      return toAdapterUser(inserted.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  async updateUser(user) {
    const { rows } = await pool.query<DbUser>(
      `UPDATE users
          SET name = COALESCE($1, name),
              image = COALESCE($2, image),
              email_verified = COALESCE($3, email_verified)
        WHERE id = $4
        RETURNING id, email, name, image, email_verified, workspace_id`,
      [user.name ?? null, user.image ?? null, user.emailVerified ?? null, user.id]
    );
    if (!rows[0]) throw new Error("user not found");
    return toAdapterUser(rows[0]);
  },

  async deleteUser() {
    // Account deletion runs through admin tooling, not Auth.js.
    return;
  },

  async linkAccount(account) {
    await pool.query(
      `INSERT INTO accounts (
         user_id, type, provider, provider_account_id,
         refresh_token, access_token, expires_at,
         token_type, scope, id_token, session_state
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (provider, provider_account_id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         refresh_token = EXCLUDED.refresh_token,
         access_token = EXCLUDED.access_token,
         expires_at = EXCLUDED.expires_at,
         token_type = EXCLUDED.token_type,
         scope = EXCLUDED.scope,
         id_token = EXCLUDED.id_token,
         session_state = EXCLUDED.session_state`,
      [
        account.userId,
        account.type,
        account.provider,
        account.providerAccountId,
        account.refresh_token ?? null,
        account.access_token ?? null,
        account.expires_at ?? null,
        account.token_type ?? null,
        account.scope ?? null,
        typeof account.session_state === "string" ? account.session_state : null,
      ]
    );
  },

  async unlinkAccount({ provider, providerAccountId }) {
    await pool.query(
      "DELETE FROM accounts WHERE provider = $1 AND provider_account_id = $2",
      [provider, providerAccountId]
    );
  },

  async createVerificationToken(token: VerificationToken) {
    await pool.query(
      `INSERT INTO verification_tokens (identifier, token, expires)
       VALUES ($1, $2, $3)`,
      [token.identifier, token.token, token.expires]
    );
    return token;
  },

  async useVerificationToken({ identifier, token }) {
    const { rows } = await pool.query<{
      identifier: string;
      token: string;
      expires: Date;
    }>(
      `DELETE FROM verification_tokens
        WHERE identifier = $1 AND token = $2
        RETURNING identifier, token, expires`,
      [identifier, token]
    );
    return rows[0] ?? null;
  },
};

export async function touchLastSeen(userId: string): Promise<void> {
  await pool.query("UPDATE users SET last_seen_at = NOW() WHERE id = $1", [
    userId,
  ]);
}
