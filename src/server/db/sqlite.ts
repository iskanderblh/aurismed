import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dbPath } from "./config";
import { MIGRATIONS } from "./schema";

type Holder = { db?: DatabaseSync; path?: string };
// Conservé entre les rechargements à chaud du serveur de développement.
const holder = ((globalThis as { __aurismedDb?: Holder }).__aurismedDb ??= {});

/** Applique les migrations manquantes, chacune dans une transaction. */
export function migrate(db: DatabaseSync) {
  db.exec("create table if not exists schema_migrations (id text primary key, applied_at text not null)");
  const applied = new Set(
    (db.prepare("select id from schema_migrations").all() as { id: string }[]).map((r) => r.id),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    db.exec("begin immediate");
    try {
      db.exec(m.sql);
      db.prepare("insert into schema_migrations (id, applied_at) values (?, ?)").run(m.id, new Date().toISOString());
      db.exec("commit");
    } catch (e) {
      db.exec("rollback");
      throw e;
    }
  }
}

export function openDatabase(file: string): DatabaseSync {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("pragma journal_mode = wal");
  db.exec("pragma foreign_keys = on");
  db.exec("pragma busy_timeout = 5000");
  // Les pages libérées sont écrasées par des zéros : une ligne supprimée ne reste pas lisible dans le fichier.
  db.exec("pragma secure_delete = on");
  migrate(db);
  return db;
}

/** Connexion unique à la base locale, ouverte et migrée au premier appel. */
export function getDb(): DatabaseSync {
  const file = dbPath();
  if (!holder.db || holder.path !== file) {
    holder.db?.close();
    holder.db = openDatabase(file);
    holder.path = file;
  }
  return holder.db;
}

/** Exécute fn dans une transaction (synchrone : node:sqlite est synchrone). */
export function transaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec("begin immediate");
  try {
    const result = fn(db);
    db.exec("commit");
    return result;
  } catch (e) {
    db.exec("rollback");
    throw e;
  }
}
