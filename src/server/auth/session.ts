import "server-only";
import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

/**
 * Sessions locales : un jeton aléatoire dans un cookie httpOnly ; seule son
 * empreinte SHA-256 est stockée en base. Durée glissante (12 h par défaut,
 * AURISMED_SESSION_HOURS), prolongée à chaque activité.
 */

export const SESSION_COOKIE = "aurismed_session";

export function sessionHours(): number {
  const h = Number(process.env.AURISMED_SESSION_HOURS);
  return Number.isFinite(h) && h > 0 ? h : 12;
}

const digest = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export function createSession(db: DatabaseSync, userId: string): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionHours() * 3600_000);
  db.prepare("delete from sessions where expires_at < ?").run(now.toISOString());
  db.prepare("insert into sessions (id, user_id, created_at, expires_at, last_seen_at) values (?, ?, ?, ?, ?)").run(
    digest(token),
    userId,
    now.toISOString(),
    expiresAt.toISOString(),
    now.toISOString(),
  );
  return { token, expiresAt };
}

/** Utilisateur de la session, ou null si le jeton est inconnu, expiré ou le compte désactivé. */
export function readSession(db: DatabaseSync, token: string | undefined): { id: string; email: string } | null {
  if (!token) return null;
  const id = digest(token);
  const row = db
    .prepare(
      `select s.expires_at, s.last_seen_at, u.id as user_id, u.email, u.disabled_at
       from sessions s join users u on u.id = s.user_id where s.id = ?`,
    )
    .get(id) as
    | { expires_at: string; last_seen_at: string; user_id: string; email: string; disabled_at: string | null }
    | undefined;
  const now = Date.now();
  if (!row || row.disabled_at || Date.parse(row.expires_at) <= now) return null;
  // Prolongation au plus une fois par minute, pour limiter les écritures.
  if (now - Date.parse(row.last_seen_at) > 60_000) {
    db.prepare("update sessions set last_seen_at = ?, expires_at = ? where id = ?").run(
      new Date(now).toISOString(),
      new Date(now + sessionHours() * 3600_000).toISOString(),
      id,
    );
  }
  return { id: row.user_id, email: row.email };
}

export function deleteSession(db: DatabaseSync, token: string | undefined) {
  if (token) db.prepare("delete from sessions where id = ?").run(digest(token));
}
