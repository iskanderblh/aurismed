import "server-only";
import { ollamaUrl } from "./config";
import { LocalAiError, networkError } from "./errors";

export type OllamaModel = { name: string; sizeBytes: number; parameterSize?: string; quantization?: string };
export type OllamaLoaded = { name: string; sizeBytes: number; vramBytes: number; expiresAt?: string };
export type OllamaHealth = { status: "ok" | "down"; url: string; version?: string };

async function get<T>(path: string, timeout = 3000): Promise<T> {
  const res = await fetch(`${ollamaUrl()}${path}`, { signal: AbortSignal.timeout(timeout), cache: "no-store" });
  if (!res.ok) throw new LocalAiError("engine_error", "ollama");
  return (await res.json()) as T;
}

export async function ollamaHealth(): Promise<OllamaHealth> {
  const url = ollamaUrl();
  try {
    const { version } = await get<{ version: string }>("/api/version", 2000);
    return { status: "ok", url, version };
  } catch {
    return { status: "down", url };
  }
}

export async function ollamaModels(): Promise<OllamaModel[]> {
  const data = await get<{ models?: { name: string; size: number; details?: { parameter_size?: string; quantization_level?: string } }[] }>(
    "/api/tags",
  );
  return (data.models ?? [])
    .map((m) => ({
      name: m.name,
      sizeBytes: m.size,
      parameterSize: m.details?.parameter_size,
      quantization: m.details?.quantization_level,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Modèles chargés en mémoire, avec la part en mémoire graphique (GPU). */
export async function ollamaLoaded(): Promise<OllamaLoaded[]> {
  const data = await get<{ models?: { name: string; size: number; size_vram?: number; expires_at?: string }[] }>("/api/ps");
  return (data.models ?? []).map((m) => ({
    name: m.name,
    sizeBytes: m.size,
    vramBytes: m.size_vram ?? 0,
    expiresAt: m.expires_at,
  }));
}

/**
 * Appel du modèle avec une sortie JSON contrainte par un schéma (sorties
 * structurées d'Ollama). Renvoie le texte JSON brut, validé par l'appelant.
 */
export async function ollamaChatJson(options: {
  model: string;
  system: string;
  user: string;
  schema: object;
  timeoutMs?: number;
  numCtx?: number;
}): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${ollamaUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        stream: false,
        format: options.schema,
        options: { temperature: 0, num_ctx: options.numCtx ?? 16384 },
        // Le modèle reste chargé 30 minutes : les analyses suivantes de la consultation sont plus rapides.
        keep_alive: "30m",
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 10 * 60_000),
    });
  } catch (error) {
    throw networkError(error, "ollama");
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[extraction] Ollama", response.status, detail.slice(0, 300));
    if (response.status === 404) throw new LocalAiError("model_missing", "ollama", false);
    throw new LocalAiError("engine_error", "ollama");
  }
  const data = (await response.json().catch(() => null)) as { message?: { content?: string } } | null;
  const content = data?.message?.content;
  if (typeof content !== "string") throw new LocalAiError("invalid_response", "ollama", false);
  return content;
}
