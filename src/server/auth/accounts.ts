import "server-only";
import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { hashPassword, verifyPassword } from "./password";

/** Comptes locaux : stockés dans la base SQLite, mot de passe haché avec scrypt. */

export type LocalUser = { id: string; email: string };

export function countUsers(db: DatabaseSync): number {
  return Number((db.prepare("select count(*) as n from users").get() as { n: number }).n);
}

export async function createUser(
  db: DatabaseSync,
  input: { email: string; password: string; fullName?: string | null },
): Promise<LocalUser> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const email = input.email.trim().toLowerCase();
  const hash = await hashPassword(input.password);
  db.exec("begin immediate");
  try {
    db.prepare("insert into users (id, email, password_hash, created_at, updated_at) values (?, ?, ?, ?, ?)").run(
      id,
      email,
      hash,
      now,
      now,
    );
    db.prepare("insert into profiles (id, email, full_name, created_at, updated_at) values (?, ?, ?, ?, ?)").run(
      id,
      email,
      input.fullName?.trim() || null,
      now,
      now,
    );
    db.prepare("insert into user_settings (user_id, created_at, updated_at) values (?, ?, ?)").run(id, now, now);
    db.exec("commit");
  } catch (e) {
    db.exec("rollback");
    throw e;
  }
  return { id, email };
}

/** Vérifie e-mail et mot de passe ; renvoie null si l'un des deux est faux ou si le compte est désactivé. */
export async function authenticate(db: DatabaseSync, email: string, password: string): Promise<LocalUser | null> {
  const row = db
    .prepare("select id, email, password_hash, disabled_at from users where email = ?")
    .get(email.trim().toLowerCase()) as { id: string; email: string; password_hash: string; disabled_at: string | null } | undefined;
  if (!row) {
    // Même durée de calcul qu'un compte existant, pour ne pas révéler les adresses enregistrées.
    await verifyPassword(password, DUMMY_HASH);
    return null;
  }
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok || row.disabled_at) return null;
  return { id: row.id, email: row.email };
}

export async function setPassword(db: DatabaseSync, userId: string, password: string) {
  const hash = await hashPassword(password);
  db.prepare("update users set password_hash = ?, updated_at = ? where id = ?").run(hash, new Date().toISOString(), userId);
  // Toutes les sessions ouvertes sont fermées après un changement de mot de passe.
  db.prepare("delete from sessions where user_id = ?").run(userId);
}

export async function checkPassword(db: DatabaseSync, userId: string, password: string): Promise<boolean> {
  const row = db.prepare("select password_hash from users where id = ?").get(userId) as { password_hash: string } | undefined;
  return row ? verifyPassword(password, row.password_hash) : false;
}

const DUMMY_HASH =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/** Limitation des essais de connexion : 5 échecs -> 5 minutes de blocage pour cette adresse. */
const attempts = new Map<string, { failures: number; until: number }>();
const MAX_FAILURES = 5;
const LOCK_MS = 5 * 60 * 1000;

export function loginLockedUntil(email: string): number | null {
  const a = attempts.get(email.trim().toLowerCase());
  return a && a.until > Date.now() ? a.until : null;
}

export function recordLoginResult(email: string, success: boolean) {
  const key = email.trim().toLowerCase();
  if (success) {
    attempts.delete(key);
    return;
  }
  const a = attempts.get(key) ?? { failures: 0, until: 0 };
  a.failures += 1;
  if (a.failures >= MAX_FAILURES) {
    a.until = Date.now() + LOCK_MS;
    a.failures = 0;
  }
  attempts.set(key, a);
}
