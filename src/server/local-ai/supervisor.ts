import "server-only";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  ollamaBin,
  ollamaUrl,
  selectedWhisperModel,
  whisperModelsDir,
  whisperServerBin,
  whisperThreads,
  whisperUrl,
} from "./config";
import { ollamaHealth } from "./ollama";
import { whisperHealth } from "./whisper";

/**
 * Lanceur des moteurs locaux : démarre, surveille et redémarre whisper-server
 * et Ollama comme processus enfants du serveur AurisMED. Un moteur déjà lancé
 * par ailleurs (application Ollama de Windows) est utilisé tel quel.
 */

export type EngineName = "whisper" | "ollama";
type Managed = { child: ChildProcess | null; startedAt: string | null; lastError: string | null; log: string[] };

const state = ((globalThis as { __aurismedEngines?: Record<EngineName, Managed> }).__aurismedEngines ??= {
  whisper: { child: null, startedAt: null, lastError: null, log: [] },
  ollama: { child: null, startedAt: null, lastError: null, log: [] },
});

let exitHookInstalled = false;
function installExitHook() {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  const stopAll = () => {
    for (const m of Object.values(state)) m.child?.kill();
  };
  process.once("exit", stopAll);
  process.once("SIGINT", () => {
    stopAll();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    stopAll();
    process.exit(143);
  });
}

function remember(m: Managed, chunk: Buffer) {
  for (const line of chunk.toString("utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    m.log.push(line.slice(0, 400));
    if (m.log.length > 60) m.log.shift();
  }
}

function launch(name: EngineName, command: string, args: string[], env: Record<string, string> = {}) {
  const m = state[name];
  installExitHook();
  m.lastError = null;
  m.log = [];
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  m.child = child;
  m.startedAt = new Date().toISOString();
  child.stdout?.on("data", (c: Buffer) => remember(m, c));
  child.stderr?.on("data", (c: Buffer) => remember(m, c));
  child.on("error", (e) => {
    m.lastError = `Lancement impossible : ${e.message}`;
    if (m.child === child) m.child = null;
  });
  child.on("exit", (code) => {
    if (m.child === child) {
      m.child = null;
      if (code !== 0 && code !== null) m.lastError = `Arrêt inattendu (code ${code}). ${m.log.slice(-3).join(" ")}`;
    }
  });
}

async function waitFor(check: () => Promise<boolean>, timeoutMs: number) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function stopChild(name: EngineName) {
  const m = state[name];
  const child = m.child;
  if (!child) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill();
  });
  m.child = null;
}

export type StartResult = { ok: true; message: string } | { ok: false; error: string };

export async function startWhisper(): Promise<StartResult> {
  if ((await whisperHealth()).status !== "down") return { ok: true, message: "Transcription locale déjà démarrée." };
  const bin = whisperServerBin();
  if (!bin) {
    return { ok: false, error: "whisper-server introuvable. Lancez windows\\Installer-AurisMED.cmd ou renseignez WHISPER_SERVER_BIN." };
  }
  const model = selectedWhisperModel();
  const modelPath = model && path.join(whisperModelsDir(), model);
  if (!modelPath || !fs.existsSync(modelPath)) {
    return { ok: false, error: "Aucun modèle de transcription installé dans moteurs\\modeles-whisper." };
  }
  const url = new URL(whisperUrl());
  launch("whisper", bin, [
    "-m",
    modelPath,
    "-l",
    "fr",
    "-t",
    String(whisperThreads()),
    "--host",
    url.hostname === "localhost" ? "127.0.0.1" : url.hostname,
    "--port",
    url.port || "8178",
  ]);
  const ready = await waitFor(async () => (await whisperHealth()).status === "ok", 90_000);
  if (ready) return { ok: true, message: `Transcription locale démarrée (${model}).` };
  return { ok: false, error: state.whisper.lastError ?? "La transcription locale n'a pas démarré dans le délai prévu." };
}

export async function startOllama(): Promise<StartResult> {
  if ((await ollamaHealth()).status === "ok") return { ok: true, message: "Ollama déjà démarré." };
  const url = new URL(ollamaUrl());
  launch("ollama", ollamaBin(), ["serve"], {
    OLLAMA_HOST: `${url.hostname === "localhost" ? "127.0.0.1" : url.hostname}:${url.port || "11434"}`,
  });
  const ready = await waitFor(async () => (await ollamaHealth()).status === "ok", 30_000);
  if (ready) return { ok: true, message: "Ollama démarré." };
  return { ok: false, error: state.ollama.lastError ?? "Ollama n'a pas démarré. Est-il installé ?" };
}

export async function restartEngine(name: EngineName): Promise<StartResult> {
  const m = state[name];
  if (!m.child) {
    const health = name === "whisper" ? (await whisperHealth()).status : (await ollamaHealth()).status;
    if (health !== "down") {
      return {
        ok: false,
        error:
          name === "ollama"
            ? "Ollama a été lancé en dehors d'AurisMED (icône près de l'horloge) : quittez-le depuis cette icône, puis cliquez sur Démarrer."
            : "Ce moteur a été lancé en dehors d'AurisMED : arrêtez-le, puis cliquez sur Démarrer.",
      };
    }
  }
  await stopChild(name);
  return name === "whisper" ? startWhisper() : startOllama();
}

export function engineProcessInfo(name: EngineName) {
  const m = state[name];
  return {
    managed: Boolean(m.child),
    pid: m.child?.pid ?? null,
    startedAt: m.child ? m.startedAt : null,
    lastError: m.lastError,
    log: m.log.slice(-15),
  };
}

/** Démarrage automatique au lancement du serveur (instrumentation.ts). */
export async function autostartEngines() {
  const [w, o] = await Promise.all([startWhisper(), startOllama()]);
  for (const [name, r] of [["whisper", w], ["ollama", o]] as const) {
    console.log(`[moteur local] ${name} : ${r.ok ? r.message : r.error}`);
  }
}
