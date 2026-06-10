import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { adapter, touchLastSeen } from "./lib/auth-adapter";
import { pool } from "./lib/db";
import { logAudit, workspaceForUser } from "./lib/audit";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
    };
    workspaceId: string | null;
  }
}

type AppJWT = {
  userId?: string;
  workspaceId?: string | null;
  role?: string | null;
  // Bound at sign-in to users.session_token_version; a later mismatch (e.g.
  // after a password reset bumps the column) invalidates this token.
  tokenVersion?: number;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const email = String(creds?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;

        const { rows } = await pool.query<{
          id: string;
          email: string;
          password_hash: string | null;
          name: string | null;
          image: string | null;
        }>(
          `SELECT id, email, password_hash, name, image
             FROM users
            WHERE lower(email) = lower($1)`,
          [email]
        );
        const user = rows[0];
        if (!user || !user.password_hash) return null;

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
    Google,
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user?.email) return false;
      return true;
    },
    async jwt({ token, user }) {
      const t = token as AppJWT & typeof token;
      if (user?.id) {
        t.userId = user.id;
        await touchLastSeen(user.id);
      }
      // Read active workspace + role fresh from DB on every JWT pass. LEFT
      // JOIN: a revoked membership leaves workspaceId null and the API
      // rejects the request rather than serving a stale tenant.
      if (t.userId) {
        const { rows } = await pool.query<{
          workspace_id: string | null;
          role: string | null;
          token_version: number | null;
        }>(
          `SELECT m.workspace_id,
                  m.role,
                  u.session_token_version AS token_version
             FROM users u
             LEFT JOIN memberships m
               ON m.user_id = u.id AND m.workspace_id = u.workspace_id
            WHERE u.id = $1`,
          [t.userId]
        );
        const row = rows[0];
        if (!row) return null;
        const dbVersion = row.token_version ?? 0;
        if (user?.id) {
          t.tokenVersion = dbVersion;
        } else if ((t.tokenVersion ?? 0) !== dbVersion) {
          return null;
        }
        t.workspaceId = row.workspace_id ?? null;
        t.role = row.role ?? null;
      }
      return t;
    },
    async session({ session, token }) {
      const t = token as AppJWT;
      if (t.userId) {
        session.user.id = t.userId;
        session.workspaceId = t.workspaceId ?? null;
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account, isNewUser }) {
      if (!user?.id) return;
      const workspaceId = await workspaceForUser(user.id);
      if (!workspaceId) return;
      await logAudit({
        workspaceId,
        actorUserId: user.id,
        action: isNewUser ? "auth.signup" : "auth.login",
        description: user.email ?? undefined,
        details: { provider: account?.provider ?? "credentials" },
      });
    },
  },
});
