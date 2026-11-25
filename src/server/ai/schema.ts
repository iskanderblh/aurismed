import { z } from "zod";
import { AI_FIELD_PATHS } from "@/lib/medical/catalog";

/**
 * Format de réponse imposé au modèle (JSON Schema « strict ») : une liste
 * d'informations extraites, chacune rattachée à un champ connu du catalogue,
 * avec sa citation, sa confiance, qui l'a dite et sa nature.
 */
export function extractionJsonSchema() {
  const str = { type: "string" };
  const nullableStr = { type: ["string", "null"] };
  const confidence = { type: "string", enum: ["high", "medium", "low"] };
  return {
    name: "observation_extraction",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["fields", "medications", "contradictions", "missing_important"],
      properties: {
        fields: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["path", "value", "confidence", "speaker", "kind", "source_quote", "note"],
            properties: {
              path: { type: "string", enum: AI_FIELD_PATHS },
              value: str,
              confidence,
              speaker: { type: "string", enum: ["patient", "doctor", "onboard_caregiver", "unknown"] },
              kind: { type: "string", enum: ["reported", "observed", "measured", "instruction"] },
              source_quote: str,
              note: nullableStr,
            },
          },
        },
        medications: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "dosage", "posology", "duration_days", "indication", "source_quote", "confidence"],
            properties: {
              name: str,
              dosage: nullableStr,
              posology: nullableStr,
              duration_days: { type: ["number", "null"] },
              indication: nullableStr,
              source_quote: str,
              confidence,
            },
          },
        },
        contradictions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["paths", "description", "quotes"],
            properties: {
              paths: { type: "array", items: { type: "string", enum: AI_FIELD_PATHS } },
              description: str,
              quotes: { type: "array", items: str },
            },
          },
        },
        missing_important: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["path", "reason"],
            properties: { path: { type: "string", enum: AI_FIELD_PATHS }, reason: str },
          },
        },
      },
    },
  } as const;
}

const pathSchema = z.string().refine((p) => AI_FIELD_PATHS.includes(p), "Champ inconnu");
const conf = z.enum(["high", "medium", "low"]);

/** Validation côté serveur de la réponse du modèle, même en mode strict. */
export const aiOutputSchema = z.object({
  fields: z
    .array(
      z.object({
        path: pathSchema,
        value: z.string().max(20000),
        confidence: conf,
        speaker: z.enum(["patient", "doctor", "onboard_caregiver", "unknown"]),
        kind: z.enum(["reported", "observed", "measured", "instruction"]),
        source_quote: z.string().max(4000),
        note: z.string().max(1000).nullable(),
      }),
    )
    .max(400),
  medications: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        dosage: z.string().max(200).nullable(),
        posology: z.string().max(500).nullable(),
        duration_days: z.number().min(0).max(3650).nullable(),
        indication: z.string().max(300).nullable(),
        source_quote: z.string().max(4000),
        confidence: conf,
      }),
    )
    .max(50),
  contradictions: z
    .array(z.object({ paths: z.array(pathSchema).max(20), description: z.string().max(1000), quotes: z.array(z.string().max(1000)).max(10) }))
    .max(50),
  missing_important: z.array(z.object({ path: pathSchema, reason: z.string().max(500) })).max(200),
});

export type AiOutput = z.infer<typeof aiOutputSchema>;
