"use server";

import { z } from "zod";
import { UUID_RE } from "@/lib/data/consultations";
import { toLiveSegmentInfo, toRecordingInfo, toTranscriptionInfo } from "@/lib/data/recordings";
import type { LiveSegmentInfo, RecordingInfo, TranscriptionInfo } from "@/lib/recording/types";
import { createClient, type DbClient } from "@/server/db/client";
import { selectedOllamaModel, selectedWhisperModel } from "@/server/local-ai/config";
import { LocalAiError } from "@/server/local-ai/errors";
import { ollamaChatJson } from "@/server/local-ai/ollama";
import { assembleLiveTranscript, assignToRecordings } from "@/server/transcription/live";

type Fail = { ok: false; error: string };

async function context(consultationId: string) {
  if (!UUID_RE.test(consultationId)) return { error: "Consultation introuvable." } as const;
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { error: "Session expirée. Reconnectez-vous." } as const;
  const { data: consultation } = await db.from("consultations").select("id").eq("id", consultationId).maybeSingle();
  if (!consultation) return { error: "Consultation introuvable." } as const;
  return { db, user: auth.user } as const;
}

async function loadSegments(db: DbClient, consultationId: string) {
  const { data, error } = await db.from("transcription_segments").select("*").eq("consultation_id", consultationId).order("seq");
  if (error) throw new Error("lecture des morceaux");
  return data ?? [];
}

/**
 * Après un changement d'interlocuteur : la transcription assemblée est mise à
 * jour seulement si le médecin ne l'a pas encore corrigée ni confirmée
 * (une correction n'est jamais écrasée).
 */
async function refreshTranscript(db: DbClient, consultationId: string) {
  const { data: t } = await db.from("transcriptions").select("*").eq("consultation_id", consultationId).maybeSingle();
  if (!t) return { transcription: null, transcriptKept: false };
  if (t.confirmed_at || (t.corrected_transcript !== null && t.corrected_transcript !== t.original_transcript)) {
    return { transcription: null, transcriptKept: true };
  }
  const text = assembleLiveTranscript(await loadSegments(db, consultationId));
  const { data } = await db
    .from("transcriptions")
    .update({ original_transcript: text, corrected_transcript: text })
    .eq("id", t.id)
    .select("*")
    .single();
  return { transcription: data ? toTranscriptionInfo(data) : null, transcriptKept: false };
}

type SpeakerResult =
  | { ok: true; segments: LiveSegmentInfo[]; transcription: TranscriptionInfo | null; transcriptKept: boolean }
  | Fail;

const speakerSchema = z.enum(["doctor", "patient", "unknown"]);

/** Le médecin attribue (ou corrige) l'interlocuteur d'un morceau. Ce choix n'est plus jamais modifié par l'IA. */
export async function setSegmentSpeaker(consultationId: string, segmentId: string, speaker: string): Promise<SpeakerResult> {
  const ctx = await context(consultationId);
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  const parsed = speakerSchema.safeParse(speaker);
  if (!parsed.success || !UUID_RE.test(segmentId)) return { ok: false, error: "Choix invalide." };
  const { error } = await ctx.db
    .from("transcription_segments")
    .update({ speaker: parsed.data, speaker_source: "doctor" })
    .eq("id", segmentId)
    .eq("consultation_id", consultationId);
  if (error) return { ok: false, error: "L'interlocuteur n'a pas pu être enregistré." };
  const refreshed = await refreshTranscript(ctx.db, consultationId);
  return { ok: true, segments: (await loadSegments(ctx.db, consultationId)).map(toLiveSegmentInfo), ...refreshed };
}

const SPEAKER_SYSTEM = `Tu aides un médecin urologue à relire la transcription d'une consultation entre un médecin et son patient.
Pour chaque réplique numérotée, indique qui parle : "doctor" (le médecin : questions, examen, explications, conseils), "patient" (le patient ou son accompagnant : symptômes ressentis, réponses, antécédents racontés) ou "unknown" si ce n'est pas clair.
Règles : ne modifie jamais le texte ; ne devine pas — en cas de doute réponds "unknown" ; une réplique peut être très courte ("oui", "d'accord") : déduis-la du contexte seulement si c'est évident.
Réponds uniquement au format JSON demandé, avec une entrée par numéro reçu.`;

const SPEAKER_JSON_SCHEMA = {
  type: "object",
  properties: {
    repliques: {
      type: "array",
      items: {
        type: "object",
        properties: { n: { type: "integer" }, interlocuteur: { type: "string", enum: ["doctor", "patient", "unknown"] } },
        required: ["n", "interlocuteur"],
      },
    },
  },
  required: ["repliques"],
};

const speakerAnswer = z.object({
  repliques: z.array(z.object({ n: z.number().int(), interlocuteur: speakerSchema })),
});

/**
 * Propose l'interlocuteur des morceaux avec le modèle local (Ollama). Seuls les
 * morceaux que le médecin n'a pas attribués lui-même sont modifiés ; le texte
 * n'est jamais touché. Les propositions sont marquées « IA » et restent
 * modifiables.
 */
export async function suggestSpeakers(consultationId: string): Promise<SpeakerResult & { changed?: number }> {
  const ctx = await context(consultationId);
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  const model = selectedOllamaModel();
  if (!model) return { ok: false, error: "Aucun modèle d'analyse local n'est choisi (Paramètres > Moteur IA local)." };
  const all = await loadSegments(ctx.db, consultationId);
  const withText = all.filter((s) => s.text.trim());
  if (!withText.length) return { ok: false, error: "Aucun texte à attribuer." };

  let changed = 0;
  const BATCH = 60;
  try {
    for (let i = 0; i < withText.length; i += BATCH) {
      const batch = withText.slice(i, i + BATCH);
      const context = withText.slice(Math.max(0, i - 4), i);
      const lines = [
        ...(context.length ? ["Contexte (déjà traité) :", ...context.map((s) => `- ${s.text}`), ""] : []),
        "Répliques à attribuer :",
        ...batch.map((s, k) => `[${k + 1}] ${s.text}`),
      ];
      const raw = await ollamaChatJson({ model, system: SPEAKER_SYSTEM, user: lines.join("\n"), schema: SPEAKER_JSON_SCHEMA, timeoutMs: 5 * 60_000, numCtx: 8192 });
      let answer: z.infer<typeof speakerAnswer>;
      try {
        answer = speakerAnswer.parse(JSON.parse(raw));
      } catch {
        throw new LocalAiError("invalid_response", "ollama", true);
      }
      for (const { n, interlocuteur } of answer.repliques) {
        const seg = batch[n - 1];
        if (!seg || seg.speaker_source === "doctor" || seg.speaker === interlocuteur) continue;
        await ctx.db
          .from("transcription_segments")
          .update({ speaker: interlocuteur, speaker_source: "ai" })
          .eq("id", seg.id)
          .eq("speaker_source", seg.speaker_source);
        changed++;
      }
    }
  } catch (error) {
    if (error instanceof LocalAiError) return { ok: false, error: error.message };
    console.error("[direct] attribution des interlocuteurs", error);
    return { ok: false, error: "L'attribution des interlocuteurs a échoué." };
  }
  await ctx.db.from("audit_logs").insert({
    user_id: ctx.user.id,
    consultation_id: consultationId,
    action: "transcription.speakers_suggested",
    entity_type: "consultation",
    entity_id: consultationId,
    metadata: { segments: withText.length, changed, model },
  });
  const refreshed = await refreshTranscript(ctx.db, consultationId);
  return { ok: true, changed, segments: (await loadSegments(ctx.db, consultationId)).map(toLiveSegmentInfo), ...refreshed };
}

/**
 * Fin de l'enregistrement en direct : la transcription est assemblée à partir
 * des morceaux, et les segments audio enregistrés pendant cette session
 * reçoivent leur texte (ils n'ont pas besoin d'être retranscrits).
 * Une transcription corrigée ou confirmée par le médecin n'est jamais écrasée.
 */
export async function finishLiveTranscription(
  consultationId: string,
  recordingIds: string[],
): Promise<
  | { ok: true; transcription: TranscriptionInfo | null; recordings: RecordingInfo[]; transcriptKept: boolean }
  | Fail
> {
  const ctx = await context(consultationId);
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  if (!Array.isArray(recordingIds) || recordingIds.length > 10_000 || !recordingIds.every((r) => UUID_RE.test(r))) {
    return { ok: false, error: "Segments audio invalides." };
  }
  const segments = await loadSegments(ctx.db, consultationId);
  const { data: recs, error: recError } = await ctx.db
    .from("recordings")
    .select("*")
    .eq("consultation_id", consultationId)
    .order("segment_index");
  if (recError) return { ok: false, error: "Lecture des segments audio impossible." };

  // Texte de chaque segment audio de cette session, d'après la ligne de temps.
  const texts = assignToRecordings(recs ?? [], segments);
  // Aucune parole transcrite : les segments audio restent à transcrire normalement.
  const session = new Set(segments.some((s) => s.text.trim()) ? recordingIds : []);
  for (const r of recs ?? []) {
    if (!session.has(r.id) || r.source !== "microphone" || r.transcription_status === "completed") continue;
    await ctx.db
      .from("recordings")
      .update({ transcription_status: "completed", transcription_error: null, transcript: texts.get(r.id) ?? "" })
      .eq("id", r.id);
  }

  const text = assembleLiveTranscript(segments);
  const { data: existing } = await ctx.db.from("transcriptions").select("*").eq("consultation_id", consultationId).maybeSingle();
  const edited = existing && (existing.confirmed_at || (existing.corrected_transcript !== null && existing.corrected_transcript !== existing.original_transcript));
  let transcription: TranscriptionInfo | null = null;
  if (!edited && text) {
    const values = {
      original_transcript: text,
      corrected_transcript: text,
      language: "fr",
      provider: "whisper.cpp (direct)",
      model: selectedWhisperModel(),
      confirmed_at: null,
    };
    const { data, error } = existing
      ? await ctx.db.from("transcriptions").update(values).eq("id", existing.id).select("*").single()
      : await ctx.db.from("transcriptions").insert({ ...values, consultation_id: consultationId, user_id: ctx.user.id }).select("*").single();
    if (error || !data) return { ok: false, error: "La transcription n'a pas pu être enregistrée." };
    transcription = toTranscriptionInfo(data);
    await ctx.db.from("audit_logs").insert({
      user_id: ctx.user.id,
      consultation_id: consultationId,
      action: "transcription.created",
      entity_type: "transcription",
      entity_id: data.id,
      metadata: { mode: "direct", morceaux: segments.length },
    });
  }
  const { data: after } = await ctx.db.from("recordings").select("*").eq("consultation_id", consultationId).order("segment_index");
  return { ok: true, transcription, recordings: (after ?? []).map(toRecordingInfo), transcriptKept: Boolean(edited) };
}
