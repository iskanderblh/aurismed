import "server-only";
import path from "node:path";

/**
 * Dossier des données locales (base SQLite, fichiers chiffrés, clé).
 * Par défaut ./data à côté de l'application ; AURISMED_DATA_DIR permet de le
 * placer ailleurs (autre disque, dossier sauvegardé).
 */
export function dataDir(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.AURISMED_DATA_DIR || path.join(process.cwd(), "data"));
}

export const dbPath = () => path.join(dataDir(), "aurismed.db");
export const filesDir = () => path.join(dataDir(), "fichiers");
export const keyPath = () => path.join(dataDir(), "cle", "aurismed.key");
