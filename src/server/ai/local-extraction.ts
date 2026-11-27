import "server-only";
import { selectedOllamaModel } from "@/server/local-ai/config";
import { LocalAiError } from "@/server/local-ai/errors";
import { ollamaChatJson } from "@/server/local-ai/ollama";
import { aiOutputSchema, extractionJsonSchema, type AiOutput } from "./schema";
import { SYSTEM_PROMPT, userPrompt } from "./prompt";

/**
 * Extraction de la fiche par le modèle local (Ollama), sortie JSON contrainte
 * par le même schéma qu'avant, puis validée avec Zod. Une réponse invalide est
 * retentée une fois. Aucun repli vers un service en ligne.
 */
export async function extractWithLocalModel(transcript: string): Promise<{ output: AiOutput; model: string }> {
  const model = selectedOllamaModel();
  if (!model) throw new LocalAiError("model_missing", "ollama", false);
  const { schema } = extractionJsonSchema();

  for (let attempt = 1; attempt <= 2; attempt++) {
    const content = await ollamaChatJson({ model, system: SYSTEM_PROMPT, user: userPrompt(transcript), schema });
    try {
      const parsed = aiOutputSchema.safeParse(JSON.parse(content));
      if (parsed.success) return { output: parsed.data, model };
      console.error("[extraction] réponse non conforme", attempt, parsed.error.issues.slice(0, 3));
    } catch {
      console.error("[extraction] JSON invalide", attempt);
    }
  }
  throw new LocalAiError("invalid_response", "ollama", false);
}
