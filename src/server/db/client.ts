import "server-only";
import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE } from "@/server/auth/session";
import { Query, type TableName } from "./query";
import { getDb } from "./sqlite";
import { BucketApi, type Bucket } from "./storage";

export type LocalSessionUser = { id: string; email: string };

/**
 * Accès aux données de l'utilisateur connecté : base SQLite et fichiers
 * chiffrés, limités à ses propres lignes et fichiers (voir query.ts).
 */
export function clientForUser(user: LocalSessionUser | null) {
  const db = getDb();
  return {
    from<T extends TableName>(table: T) {
      return new Query(db, table, user?.id ?? null);
    },
    storage: {
      from(bucket: Bucket) {
        return new BucketApi(db, bucket, user?.id ?? null);
      },
    },
    auth: {
      async getUser() {
        return user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { message: "Session absente ou expirée." } };
      },
    },
  };
}

export type DbClient = ReturnType<typeof clientForUser>;

/** Utilisateur de la session courante (cookie), ou null. */
export async function sessionUser(): Promise<LocalSessionUser | null> {
  const store = await cookies();
  return readSession(getDb(), store.get(SESSION_COOKIE)?.value);
}

/** Client lié à la session courante (remplace l'ancien client Supabase). */
export async function createClient(): Promise<DbClient> {
  return clientForUser(await sessionUser());
}
