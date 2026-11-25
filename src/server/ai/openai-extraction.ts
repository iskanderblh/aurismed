import "server-only";
import { aiOutputSchema, extractionJsonSchema, type AiOutput } from "./schema";
import { SYSTEM_PROMPT, userPrompt } from "./prompt";

export type ExtractionErrorCode = "not_configured" | "invalid_key" | "rate_limited" | "unavailable" | "timeout" | "invalid_response" | "refused";

const MESSAGES: Record<ExtractionErrorCode, string> = {
  not_configured: "L'extraction IA n'est pas configurée : OPENAI_API_KEY est absente du serveur.",
  invalid_key: "La clé du service d'IA est invalide ou révoquée.",
  rate_limited: "Le service d'IA limite les requêtes ou le quota est atteint. Réessayez dans un moment.",
  unavailable: "Le service d'IA est momentanément indisponible. Réessayez.",
  timeout: "Le service d'IA n'a pas répondu à temps. Réessayez.",
  invalid_response: "La réponse de l'IA était invalide, même après un second essai. Aucune donnée n'a été modifiée.",
  refused: "Le modèle a refusé de traiter cette transcription.",
};

export class ExtractionError extends Error {
  constructor(readonly code: ExtractionErrorCode) {
    super(MESSAGES[code]);
    this.name = "ExtractionError";
  }
}

const TIMEOUT_MS = 180_000;

/**
 * Appelle le modèle avec une sortie JSON structurée stricte, puis valide la
 * réponse avec Zod. Une réponse invalide est retentée une fois.
 */
export async function extractWithOpenAI(transcript: string): Promise<{ output: AiOutput; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ExtractionError("not_configured");
  const model = process.env.OPENAI_EXTRACTION_MODEL || "gpt-4.1";
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

  for (let attempt = 1; attempt <= 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_schema", json_schema: extractionJsonSchema() },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt(transcript) },
          ],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new ExtractionError("timeout");
      throw new ExtractionError("unavailable");
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[extraction] OpenAI", response.status, detail.slice(0, 300));
      if (response.status === 401 || response.status === 403) throw new ExtractionError("invalid_key");
      if (response.status === 429) throw new ExtractionError("rate_limited");
      throw new ExtractionError("unavailable");
    }

    const data = (await response.json().catch(() => null)) as {
      choices?: { message?: { content?: string | null; refusal?: string | null } }[];
    } | null;
    const message = data?.choices?.[0]?.message;
    if (message?.refusal) throw new ExtractionError("refused");
    try {
      const parsed = aiOutputSchema.safeParse(JSON.parse(message?.content ?? ""));
      if (parsed.success) return { output: parsed.data, model };
      console.error("[extraction] réponse non conforme", attempt, parsed.error.issues.slice(0, 3));
    } catch {
      console.error("[extraction] JSON invalide", attempt);
    }
  }
  throw new ExtractionError("invalid_response");
}
