import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/server/db/sqlite";

/**
 * Configuration du moteur IA local. Tout tourne sur ce poste : les adresses
 * doivent rester locales (127.0.0.1 / localhost), aucune n'est jamais
 * remplacée par un service en ligne.
 */

export const DEFAULT_WHISPER_URL = "http://127.0.0.1:8178";
export const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Refuse toute adresse qui ne désigne pas ce poste : pas de repli vers un service externe. */
export function assertLocalUrl(raw: string, name: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} invalide : ${raw}`);
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`${name} doit désigner ce poste (127.0.0.1 ou localhost), pas ${url.hostname}.`);
  }
  return raw.replace(/\/$/, "");
}

export function whisperUrl() {
  return assertLocalUrl(process.env.WHISPER_URL || DEFAULT_WHISPER_URL, "WHISPER_URL");
}

export function ollamaUrl() {
  return assertLocalUrl(process.env.OLLAMA_URL || DEFAULT_OLLAMA_URL, "OLLAMA_URL");
}

/** Dossier des moteurs installés par windows/Installer-AurisMED.ps1. */
export function enginesDir() {
  return path.resolve(/*turbopackIgnore: true*/ process.env.AURISMED_ENGINES_DIR || path.join(process.cwd(), "moteurs"));
}

export function whisperModelsDir() {
  return path.join(enginesDir(), "modeles-whisper");
}

/** Exécutable whisper-server : variable WHISPER_SERVER_BIN, sinon moteurs/whisper/. */
export function whisperServerBin(): string | null {
  if (process.env.WHISPER_SERVER_BIN) return process.env.WHISPER_SERVER_BIN;
  const dir = path.join(enginesDir(), "whisper");
  for (const name of ["whisper-server.exe", "whisper-server", path.join("Release", "whisper-server.exe")]) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/** Exécutable ollama : variable OLLAMA_BIN, sinon emplacement d'installation Windows, sinon le PATH. */
export function ollamaBin(): string {
  if (process.env.OLLAMA_BIN) return process.env.OLLAMA_BIN;
  const local = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "Ollama", "ollama.exe");
  if (local && fs.existsSync(/*turbopackIgnore: true*/ local)) return local;
  return "ollama";
}

// -----------------------------------------------------------------------------
// Modèles choisis (table app_settings), avec valeurs par défaut de l'environnement.
// -----------------------------------------------------------------------------

type SettingKey = "whisper_model" | "ollama_model";

export function getSetting(key: SettingKey): string | null {
  const row = getDb().prepare("select value from app_settings where key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: SettingKey, value: string) {
  getDb()
    .prepare(
      "insert into app_settings (key, value, updated_at) values (?, ?, ?) on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at",
    )
    .run(key, value, new Date().toISOString());
}

/** Fichiers de modèles whisper.cpp (ggml-*.bin) présents dans moteurs/modeles-whisper. */
export function listWhisperModels(): { name: string; sizeBytes: number }[] {
  try {
    return fs
      .readdirSync(whisperModelsDir())
      .filter((f) => f.endsWith(".bin") && !f.startsWith("for-tests-"))
      .map((name) => ({ name, sizeBytes: fs.statSync(path.join(whisperModelsDir(), name)).size }))
      .sort((a, b) => a.sizeBytes - b.sizeBytes);
  } catch {
    return [];
  }
}

/** Modèle whisper choisi : réglage, sinon WHISPER_MODEL, sinon le plus petit présent (jamais de téléchargement). */
export function selectedWhisperModel(): string | null {
  return getSetting("whisper_model") || process.env.WHISPER_MODEL || listWhisperModels()[0]?.name || null;
}

export function selectedOllamaModel(): string | null {
  return getSetting("ollama_model") || process.env.OLLAMA_MODEL || null;
}

export function whisperThreads(): number {
  const n = Number(process.env.WHISPER_THREADS);
  return Number.isInteger(n) && n > 0 ? n : 4;
}
