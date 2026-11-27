"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, RotateCw, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDuration, type LiveSegmentInfo } from "@/lib/recording/types";
import { cn } from "@/lib/utils";
import type { Speaker } from "@/types/database";
import type { LiveChunk } from "./use-live-recorder";

type ChunkResponse =
  | { ok: true; kind: "partial"; seq: number; text: string }
  | { ok: true; kind: "final"; segment: LiveSegmentInfo }
  | { ok: false; error: string; retryable?: boolean };

async function sendChunk(consultationId: string, chunk: LiveChunk): Promise<ChunkResponse> {
  const body = new FormData();
  body.set("file", new File([chunk.wav], `direct-${chunk.seq}.wav`, { type: chunk.wav.type }));
  body.set("kind", chunk.kind);
  body.set("seq", String(chunk.seq));
  body.set("startMs", String(chunk.startMs));
  body.set("endMs", String(chunk.endMs));
  body.set("overlapMs", String(chunk.overlapMs));
  try {
    const res = await fetch(`/api/consultations/${consultationId}/direct`, { method: "POST", body });
    if (!(res.headers.get("content-type") ?? "").includes("application/json")) {
      return { ok: false, error: "Session expirée. Reconnectez-vous dans un autre onglet puis réessayez.", retryable: true };
    }
    return (await res.json()) as ChunkResponse;
  } catch {
    return { ok: false, error: "Connexion au serveur local impossible.", retryable: true };
  }
}

/**
 * File d'envoi des morceaux de parole au moteur local. Un seul envoi à la
 * fois ; les versions stables passent avant les provisoires, et une version
 * provisoire dépassée est abandonnée. En cas d'erreur, la file s'arrête (rien
 * n'est perdu : les morceaux restent en mémoire et l'audio complet est stocké)
 * jusqu'à « Réessayer ».
 */
export function useLiveTranscript(initial: LiveSegmentInfo[], onIdle: () => void) {
  const [segments, setSegments] = useState<LiveSegmentInfo[]>(initial);
  const [partial, setPartial] = useState<{ seq: number; text: string } | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string>();
  const queue = useRef<LiveChunk[]>([]);
  const latestPartial = useRef<LiveChunk | null>(null);
  const inflight = useRef(false);
  const blocked = useRef(false);
  const doneSeq = useRef(Math.max(-1, ...initial.map((s) => s.seq)));
  const consultation = useRef<string | null>(null);
  const onIdleRef = useRef(onIdle);
  useEffect(() => {
    onIdleRef.current = onIdle;
  });

  const pump = async () => {
    const id = consultation.current;
    if (inflight.current || blocked.current || !id) return;
    const next = queue.current[0] ?? latestPartial.current;
    if (!next) return onIdleRef.current();
    if (next === latestPartial.current) latestPartial.current = null;
    inflight.current = true;
    const result = await sendChunk(id, next);
    inflight.current = false;
    if (next.kind === "final") {
      if (result.ok && result.kind === "final") {
        queue.current.shift();
        doneSeq.current = Math.max(doneSeq.current, result.segment.seq);
        setSegments((s) => [...s.filter((x) => x.seq !== result.segment.seq), result.segment].sort((a, b) => a.seq - b.seq));
        setPartial((p) => (p && p.seq <= result.segment.seq ? null : p));
        setPending(queue.current.length);
        setError(undefined);
      } else {
        blocked.current = true;
        setError(result.ok ? "Réponse inattendue du serveur." : result.error);
        return;
      }
    } else if (result.ok && result.kind === "partial") {
      // Affiché seulement si la version stable de ce morceau n'est pas déjà arrivée.
      if (result.seq > doneSeq.current && !queue.current.some((c) => c.seq === result.seq)) {
        setPartial({ seq: result.seq, text: result.text });
      }
    }
    void pump();
  };

  const push = (consultationId: string, chunk: LiveChunk) => {
    consultation.current = consultationId;
    if (chunk.kind === "final") {
      queue.current.push(chunk);
      if (latestPartial.current?.seq === chunk.seq) latestPartial.current = null;
      setPending(queue.current.length);
    } else {
      latestPartial.current = chunk;
    }
    void pump();
  };

  const retry = () => {
    blocked.current = false;
    setError(undefined);
    void pump();
  };

  const isIdle = () => !inflight.current && queue.current.length === 0;
  const nextSeq = () => Math.max(doneSeq.current, ...queue.current.map((c) => c.seq)) + 1;
  const clear = () => {
    queue.current = [];
    latestPartial.current = null;
    blocked.current = false;
    doneSeq.current = -1;
    setSegments([]);
    setPartial(null);
    setPending(0);
    setError(undefined);
  };

  return { segments, setSegments, partial, pending, error, push, retry, isIdle, nextSeq, clear };
}

const SPEAKERS: { value: Speaker; label: string; className: string }[] = [
  { value: "doctor", label: "Médecin", className: "border-sky-200 bg-sky-50 text-sky-800" },
  { value: "patient", label: "Patient", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  { value: "unknown", label: "Non identifié", className: "border-border bg-muted text-muted-foreground" },
];

export function LiveTranscriptPanel({
  segments,
  partial,
  pending,
  error,
  live,
  speaking,
  readOnly,
  suggesting,
  notice,
  onRetry,
  onSpeaker,
  onSuggest,
}: {
  segments: LiveSegmentInfo[];
  partial: { seq: number; text: string } | null;
  pending: number;
  error?: string;
  live: boolean;
  speaking: boolean;
  readOnly: boolean;
  suggesting: boolean;
  notice?: string;
  onRetry: () => void;
  onSpeaker: (segment: LiveSegmentInfo, speaker: Speaker) => void;
  onSuggest: () => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  const visible = segments.filter((s) => s.text.trim());
  useEffect(() => {
    if (live) end.current?.scrollIntoView({ block: "nearest" });
  }, [live, visible.length, partial?.text]);

  if (!live && !visible.length && !pending && !error) return null;
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="Transcription en direct">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          {live ? (
            <span className={cn("size-2 rounded-full", speaking ? "animate-pulse bg-destructive" : "bg-muted-foreground/40")} />
          ) : null}
          Transcription en direct
          {pending > 0 && (
            <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> {pending} morceau{pending > 1 ? "x" : ""} en cours
            </span>
          )}
        </p>
        {!readOnly && visible.length > 0 && (
          <Button size="sm" variant="outline" onClick={onSuggest} disabled={live || pending > 0 || suggesting}>
            {suggesting ? <Loader2 className="animate-spin" /> : <Sparkles />} Proposer Médecin / Patient (IA locale)
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Texte produit sur ce poste au fil de la consultation : à relire. L&apos;interlocuteur est à vérifier ; les propositions de l&apos;IA
        sont marquées « IA » et ne remplacent jamais votre choix.
      </p>
      <div className="max-h-96 space-y-2 overflow-y-auto pr-1" aria-live="polite">
        {visible.map((s) => {
          const sp = SPEAKERS.find((x) => x.value === s.speaker)!;
          return (
            <div key={s.id} className="flex gap-3 text-sm" data-testid="live-segment">
              <div className="w-32 shrink-0 space-y-1">
                {readOnly ? (
                  <span className={cn("inline-block rounded-md border px-2 py-0.5 text-xs", sp.className)}>{sp.label}</span>
                ) : (
                  <select
                    aria-label={`Interlocuteur à ${formatDuration(s.startMs / 1000)}`}
                    className={cn("w-full rounded-md border px-1.5 py-1 text-xs", sp.className)}
                    value={s.speaker}
                    onChange={(e) => onSpeaker(s, e.target.value as Speaker)}
                  >
                    {SPEAKERS.map((x) => (
                      <option key={x.value} value={x.value}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {formatDuration(s.startMs / 1000)}
                  {s.speakerSource === "ai" && <span className="ml-1 rounded bg-violet-100 px-1 text-violet-700">IA</span>}
                </p>
              </div>
              <p className="flex-1 leading-relaxed">{s.text}</p>
            </div>
          );
        })}
        {partial && partial.text && (
          <div className="flex gap-3 text-sm" data-testid="live-partial">
            <div className="w-32 shrink-0 text-xs text-muted-foreground">En cours…</div>
            <p className="flex-1 italic leading-relaxed text-muted-foreground">{partial.text}</p>
          </div>
        )}
        {live && !visible.length && !partial?.text && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="size-4" /> Le texte apparaîtra ici dès les premières phrases.
          </p>
        )}
        <div ref={end} />
      </div>
      {error && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span className="flex-1">
            Transcription en direct interrompue : {error} L&apos;audio continue d&apos;être enregistré et rien n&apos;est perdu.
          </span>
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RotateCw /> Réessayer
          </Button>
        </div>
      )}
      {notice && <p className="text-sm text-warning">{notice}</p>}
    </section>
  );
}
