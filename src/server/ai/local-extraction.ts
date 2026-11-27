import "server-only";
import { selectedOllamaModel } from "@/server/local-ai/config";
import { LocalAiError } from "@/server/local-ai/errors";
import { ollamaChatJson } from "@/server/local-ai/ollama";
import { aiOutputSchema, extractionJsonSchema, type AiOutput } from "./schema";
import { INCREMENTAL_RULES, incrementalUserPrompt, systemPrompt, userPrompt, type PromptSegment } from "./prompt";
import { SYMPTOMS, type SymptomDef } from "@/lib/urology/taxonomy";

export type ExtractionOptions = { maritime?: boolean; taxonomy?: SymptomDef[] };

const schemaFor = (o: ExtractionOptions, segments: boolean) =>
  extractionJsonSchema({ segments, maritime: o.maritime ?? false, symptomIds: (o.taxonomy ?? SYMPTOMS).map((x) => x.id) }).schema;

/**
 * Extraction de la fiche par le modèle local (Ollama), sortie JSON contrainte
 * par le même schéma qu'avant, puis validée avec Zod. Une réponse invalide est
 * retentée une fois. Aucun repli vers un service en ligne.
 */
export async function extractWithLocalModel(transcript: string, options: ExtractionOptions = {}): Promise<{ output: AiOutput; model: string }> {
  return run(systemPrompt(options), userPrompt(transcript, options), schemaFor(options, false));
}

/** Analyse des nouvelles répliques (ou relecture de toute la consultation) de la transcription en direct. */
export async function extractFromSegments(input: {
  segments: PromptSegment[];
  context: PromptSegment[];
  current: { path: string; label: string; value: string }[];
  full: boolean;
} & ExtractionOptions): Promise<{ output: AiOutput; model: string }> {
  return run(systemPrompt(input) + INCREMENTAL_RULES, incrementalUserPrompt(input), schemaFor(input, true));
}

async function run(system: string, user: string, schema: object): Promise<{ output: AiOutput; model: string }> {
  const model = selectedOllamaModel();
  if (!model) throw new LocalAiError("model_missing", "ollama", false);
  for (let attempt = 1; attempt <= 2; attempt++) {
    const content = await ollamaChatJson({ model, system, user, schema });
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
