"use client";

import { useEffect, useEffectEvent, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { confirmTranscription, saveTranscriptCorrection } from "@/app/(app)/consultations/recording-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { RecordingInfo, TranscriptionInfo } from "@/lib/recording/types";

type SaveState = "saved" | "dirty" | "saving" | "error";

export function TranscriptionEditor({
  consultationId,
  transcription,
  retentionDays,
  onConfirmed,
}: {
  consultationId: string;
  transcription: TranscriptionInfo;
  retentionDays: number;
  onConfirmed: (t: TranscriptionInfo, recordings: RecordingInfo[]) => void;
}) {
  const [text, setText] = useState(transcription.corrected);
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState<string>();
  const [confirming, startConfirm] = useTransition();
  const confirmed = Boolean(transcription.confirmedAt);
  const edited = text !== transcription.original;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  const persist = async () => {
    setState("saving");
    const result = await saveTranscriptCorrection(consultationId, text).catch(() => ({
      ok: false as const,
      error: "Connexion au serveur impossible.",
    }));
    if (result.ok) {
      setState((s) => (s === "saving" ? "saved" : s));
      setError(undefined);
    } else {
      setState("error");
      setError(result.error);
    }
  };
  const autosave = useEffectEvent(() => void persist());

  useEffect(() => {
    if (state !== "dirty") return;
    const timer = setTimeout(autosave, 1500);
    return () => clearTimeout(timer);
  }, [state, text]);

  useEffect(() => {
    if (state === "saved") return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state]);

  const change = (value: string) => {
    setText(value);
    setState("dirty");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">Transcription</p>
        {confirmed ? (
          <Badge variant="success">
            <ShieldCheck className="size-3" /> Confirmée
          </Badge>
        ) : (
          <Badge variant="warning">À relire et confirmer</Badge>
        )}
        {edited && <Badge variant="secondary">Corrigée</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">
          {words} mots ·{" "}
          {state === "saving" ? "enregistrement…" : state === "dirty" ? "modifications non enregistrées" : state === "error" ? "échec de l'enregistrement" : "enregistrée"}
        </span>
      </div>
      <Textarea
        value={text}
        onChange={(e) => change(e.target.value)}
        className="min-h-80 font-[450] leading-relaxed"
        aria-label="Transcription de la consultation"
        spellCheck
        lang="fr"
      />
      {error && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="size-4" /> {error}
          <Button size="sm" variant="link" onClick={() => void persist()}>
            Réessayer
          </Button>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {edited && !confirmed && (
          <Button variant="ghost" size="sm" onClick={() => change(transcription.original)}>
            <RotateCcw /> Rétablir le texte original
          </Button>
        )}
        {!confirmed && (
          <Button
            className="ml-auto"
            disabled={confirming || !text.trim()}
            onClick={() =>
              startConfirm(async () => {
                const result = await confirmTranscription(consultationId, text).catch(() => ({
                  ok: false as const,
                  error: "Connexion au serveur impossible.",
                }));
                if (result.ok) {
                  setState("saved");
                  onConfirmed(result.transcription, result.recordings);
                } else setError(result.error);
              })
            }
          >
            {confirming ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            Confirmer la transcription
          </Button>
        )}
      </div>
      {!confirmed && (
        <p className="text-xs text-muted-foreground">
          À la confirmation, l&apos;audio sera conservé {retentionDays === 0 ? "0 jour (supprimé immédiatement)" : `${retentionDays} jours`} puis supprimé
          (réglable dans Paramètres).
        </p>
      )}
    </div>
  );
}
