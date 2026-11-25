"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileAudio,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCw,
  Square,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { deleteAllRecordings, getPlaybackUrl, registerRecording } from "@/app/(app)/consultations/recording-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  ACCEPTED_AUDIO_TYPES,
  MAX_SEGMENT_BYTES,
  SEGMENT_SECONDS,
  baseMime,
  extensionFor,
  formatDuration,
  type ConsentInfo,
  type RecordingInfo,
  type RecordingStageData,
  type TranscriptionInfo,
} from "@/lib/recording/types";
import { TRANSCRIPTION_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { ConsentPanel } from "./consent-panel";
import { TranscriptionEditor } from "./transcription-editor";
import { useSegmentRecorder, type FinishedSegment } from "./use-segment-recorder";
import { Waveform } from "./waveform";

type LocalSegment = {
  key: string;
  segmentIndex: number;
  blob: Blob;
  mimeType: string;
  duration: number | null;
  source: "microphone" | "upload";
  originalFilename: string | null;
  status: "uploading" | "error";
  error?: string;
};

async function postJson<T>(url: string): Promise<T | { ok: false; error: string; retryable?: boolean }> {
  try {
    const response = await fetch(url, { method: "POST" });
    if (!(response.headers.get("content-type") ?? "").includes("application/json")) {
      return { ok: false, error: "Session expirée. Reconnectez-vous dans un autre onglet puis réessayez.", retryable: true };
    }
    return (await response.json()) as T;
  } catch {
    return { ok: false, error: "Connexion au serveur impossible. Vérifiez le réseau puis réessayez.", retryable: true };
  }
}

function audioDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
    setTimeout(() => done(null), 5000);
  });
}

export function RecordingStage({
  consultationId,
  ensureId,
  data,
  onProgress,
  onTranscriptionChange,
}: {
  consultationId: string | null;
  ensureId: () => Promise<string | null>;
  data: RecordingStageData;
  onProgress?: (step: number) => void;
  onTranscriptionChange?: (t: TranscriptionInfo | null) => void;
}) {
  const [consent, setConsent] = useState<ConsentInfo>(data.consent);
  const [recordings, setRecordings] = useState<RecordingInfo[]>(data.recordings);
  const [local, setLocal] = useState<LocalSegment[]>([]);
  const [transcription, setTranscriptionState] = useState<TranscriptionInfo | null>(data.transcription);
  const setTranscription = (t: TranscriptionInfo | null) => {
    setTranscriptionState(t);
    onTranscriptionChange?.(t);
  };
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null);
  const [transcribing, setTranscribing] = useState<{ done: number; total: number } | null>(null);
  const [transcribeError, setTranscribeError] = useState<string>();
  const [stageError, setStageError] = useState<string>();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, startReset] = useTransition();
  const localUrls = useRef(new Map<string, string>());
  const nextIndex = useRef(Math.max(-1, ...data.recordings.map((r) => r.segmentIndex)) + 1);
  const fileInput = useRef<HTMLInputElement>(null);
  const idRef = useRef(consultationId);
  useEffect(() => {
    idRef.current = consultationId;
  }, [consultationId]);

  const upload = async (seg: LocalSegment) => {
    const id = idRef.current;
    if (!id) return;
    setLocal((l) => l.map((s) => (s.key === seg.key ? { ...s, status: "uploading", error: undefined } : s)));
    const path = `${data.userId}/${id}/seg-${String(seg.segmentIndex).padStart(4, "0")}-${Date.now()}.${extensionFor(seg.mimeType)}`;
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from("recordings")
      .upload(path, seg.blob, { contentType: baseMime(seg.mimeType), upsert: false });
    let error = uploadError ? "L'envoi du segment a échoué. Il est conservé dans cette page : réessayez." : undefined;
    if (!error) {
      const result = await registerRecording(id, {
        path,
        segmentIndex: seg.segmentIndex,
        duration: seg.duration,
        sizeBytes: seg.blob.size,
        mimeType: seg.mimeType,
        source: seg.source,
        originalFilename: seg.originalFilename,
      }).catch(() => ({ ok: false as const, error: "Connexion au serveur impossible." }));
      if (result.ok) {
        localUrls.current.set(result.recording.id, URL.createObjectURL(seg.blob));
        setRecordings((r) => [...r, result.recording].sort((a, b) => a.segmentIndex - b.segmentIndex));
        setLocal((l) => l.filter((s) => s.key !== seg.key));
        return;
      }
      error = result.error;
    }
    setLocal((l) => l.map((s) => (s.key === seg.key ? { ...s, status: "error", error } : s)));
  };

  const enqueue = (segment: Omit<LocalSegment, "key" | "segmentIndex" | "status">) => {
    const seg: LocalSegment = { ...segment, key: crypto.randomUUID(), segmentIndex: nextIndex.current++, status: "uploading" };
    setLocal((l) => [...l, seg]);
    void upload(seg);
  };

  const recorder = useSegmentRecorder((s: FinishedSegment) =>
    enqueue({ blob: s.blob, mimeType: s.mimeType, duration: s.duration, source: "microphone", originalFilename: null }),
  );

  // Ne jamais quitter la page avec un enregistrement en cours ou un envoi non terminé.
  const busy = recorder.state === "recording" || recorder.state === "paused" || local.length > 0 || transcribing !== null;
  useEffect(() => {
    if (!busy) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [busy]);

  useEffect(
    () => () => {
      localUrls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  const onFiles = async (files: FileList | null) => {
    setStageError(undefined);
    for (const file of Array.from(files ?? [])) {
      if (!ACCEPTED_AUDIO_TYPES.includes(baseMime(file.type))) {
        setStageError(`« ${file.name} » n'est pas un format audio pris en charge (webm, ogg, mp3, m4a, wav, flac).`);
        continue;
      }
      if (file.size > MAX_SEGMENT_BYTES) {
        setStageError(
          `« ${file.name} » dépasse 24 Mo, la limite du service de transcription. Découpez-le ou exportez-le en qualité inférieure (mp3 64 kbit/s ≈ 50 min).`,
        );
        continue;
      }
      enqueue({ blob: file, mimeType: file.type, duration: await audioDuration(file), source: "upload", originalFilename: file.name });
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  const play = async (rec: RecordingInfo) => {
    const localUrl = localUrls.current.get(rec.id);
    if (localUrl) return setPlaying({ id: rec.id, url: localUrl });
    const result = await getPlaybackUrl(idRef.current!, rec.id);
    if (result.ok) setPlaying({ id: rec.id, url: result.url });
    else setStageError(result.error);
  };

  const transcribe = async () => {
    const id = idRef.current;
    if (!id) return;
    setTranscribeError(undefined);
    const todo = recordings.filter((r) => r.status !== "completed");
    setTranscribing({ done: recordings.length - todo.length, total: recordings.length });
    for (const rec of todo) {
      setRecordings((rs) => rs.map((r) => (r.id === rec.id ? { ...r, status: "processing", error: null } : r)));
      const result = await postJson<{ ok: true; recording: RecordingInfo } | { ok: false; error: string; recording?: RecordingInfo }>(
        `/api/recordings/${rec.id}/transcribe`,
      );
      if (!result.ok) {
        const failed = "recording" in result ? result.recording : undefined;
        setRecordings((rs) => rs.map((r) => (r.id === rec.id ? (failed ?? { ...r, status: "failed", error: result.error }) : r)));
        setTranscribeError(result.error);
        setTranscribing(null);
        return;
      }
      setRecordings((rs) => rs.map((r) => (r.id === rec.id ? result.recording : r)));
      setTranscribing((t) => (t ? { ...t, done: t.done + 1 } : t));
    }
    const final = await postJson<{ ok: true; transcription: TranscriptionInfo } | { ok: false; error: string }>(
      `/api/consultations/${id}/transcription`,
    );
    setTranscribing(null);
    if (!final.ok) return setTranscribeError(final.error);
    setTranscription(final.transcription);
    onProgress?.(2);
  };

  const reset = () =>
    startReset(async () => {
      const id = idRef.current;
      if (!id) return;
      const result = await deleteAllRecordings(id);
      setConfirmReset(false);
      if (!result.ok) return setStageError(result.error);
      localUrls.current.forEach((u) => URL.revokeObjectURL(u));
      localUrls.current.clear();
      setRecordings([]);
      setTranscription(null);
      setPlaying(null);
      setTranscribeError(undefined);
      nextIndex.current = 0;
      recorder.reset();
    });

  const consentGiven = Boolean(consent.recordingConsentAt && consent.aiAcknowledgedAt);
  const isLive = recorder.state === "recording" || recorder.state === "paused";
  const confirmed = Boolean(transcription?.confirmedAt);
  const totalDuration = recordings.reduce((s, r) => s + (r.duration ?? 0), 0) + local.reduce((s, r) => s + (r.duration ?? 0), 0);
  const canTranscribe = recordings.length > 0 && local.length === 0 && !isLive && !transcribing && !confirmed;
  const needsTranscription = recordings.some((r) => r.status !== "completed") || !transcription;

  if (!consentGiven) {
    return (
      <ConsentPanel
        providerLabel={data.providerLabel}
        ensureId={ensureId}
        onAccepted={(c) => {
          setConsent(c);
          onProgress?.(1);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {!data.providerConfigured && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-warning">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          La transcription n&apos;est pas configurée sur le serveur (OPENAI_API_KEY). Vous pouvez enregistrer ; la
          transcription sera possible une fois la clé ajoutée.
        </div>
      )}

      {!confirmed && (
        <div className="rounded-xl border bg-gradient-to-b from-secondary/50 to-card p-5">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
              {recorder.state === "recording" && (
                <span className="flex items-center gap-2 font-medium text-destructive">
                  <span className="size-2.5 animate-pulse rounded-full bg-destructive" /> Enregistrement en cours
                </span>
              )}
              {recorder.state === "paused" && <span className="font-medium text-warning">En pause</span>}
              {recorder.state === "requesting" && <span className="text-muted-foreground">Autorisation du micro…</span>}
              {(recorder.state === "idle" || recorder.state === "stopped") && (
                <MicStatus permission={recorder.permission} />
              )}
            </div>
            <p className="font-mono text-4xl font-semibold tabular-nums tracking-tight">
              {formatDuration(isLive ? recorder.elapsed : totalDuration)}
            </p>
            <div className="w-full max-w-md">
              <Waveform analyser={recorder.analyser} active={recorder.state === "recording"} />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {!isLive ? (
                <Button
                  size="lg"
                  className="h-14 rounded-full px-8"
                  onClick={() => void recorder.start()}
                  disabled={recorder.state === "requesting" || transcribing !== null}
                >
                  {recorder.state === "requesting" ? <Loader2 className="animate-spin" /> : <Mic />}
                  {recordings.length || local.length ? "Reprendre l'enregistrement" : "Démarrer l'enregistrement"}
                </Button>
              ) : (
                <>
                  {recorder.state === "recording" ? (
                    <Button size="lg" variant="outline" className="h-14 rounded-full px-6" onClick={recorder.pause}>
                      <Pause /> Pause
                    </Button>
                  ) : (
                    <Button size="lg" variant="outline" className="h-14 rounded-full px-6" onClick={recorder.resume}>
                      <Play /> Reprendre
                    </Button>
                  )}
                  <Button size="lg" variant="destructive" className="h-14 rounded-full px-6" onClick={recorder.stop}>
                    <Square /> Arrêter
                  </Button>
                </>
              )}
            </div>
            {!isLive && (
              <div>
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPTED_AUDIO_TYPES.join(",")}
                  multiple
                  className="sr-only"
                  id="audio-file"
                  onChange={(e) => void onFiles(e.target.files)}
                />
                <Button variant="link" size="sm" onClick={() => fileInput.current?.click()}>
                  <Upload /> Importer un fichier audio
                </Button>
              </div>
            )}
            {recorder.error && <p className="max-w-lg text-sm text-destructive">{recorder.error}</p>}
            {stageError && <p className="max-w-lg text-sm text-destructive">{stageError}</p>}
            <p className="max-w-lg text-xs text-muted-foreground">
              Les longues consultations sont découpées automatiquement en segments de{" "}
              {SEGMENT_SECONDS >= 60 ? `${Math.round(SEGMENT_SECONDS / 60)} minutes` : `${SEGMENT_SECONDS} secondes`}, envoyés au fil de l&apos;eau.
            </p>
          </div>
        </div>
      )}

      {(recordings.length > 0 || local.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              Segments audio <span className="text-muted-foreground">· {formatDuration(totalDuration)}</span>
            </p>
            {confirmReset ? (
              <div className="flex items-center gap-2">
                <span className="hidden text-xs text-destructive sm:inline">Audio et transcription seront effacés.</span>
                <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)} disabled={resetting}>
                  Annuler
                </Button>
                <Button size="sm" variant="destructive" onClick={reset} disabled={resetting}>
                  {resetting ? <Loader2 className="animate-spin" /> : <Trash2 />} Confirmer
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)} disabled={isLive || local.length > 0 || !!transcribing}>
                <Trash2 /> Supprimer et recommencer
              </Button>
            )}
          </div>
          <ul className="divide-y rounded-lg border bg-card">
            {recordings.map((r) => {
              const s = TRANSCRIPTION_STATUS[r.status];
              return (
                <li key={r.id} className="space-y-2 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <FileAudio className="size-4 shrink-0 text-sky-600" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="truncate font-medium">
                        {r.source === "upload" ? r.originalFilename ?? "Fichier importé" : `Segment ${r.segmentIndex + 1}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDuration(r.duration)}
                        {r.sizeBytes ? ` · ${formatSize(r.sizeBytes)}` : ""}
                        {!r.audioAvailable && " · audio supprimé (rétention)"}
                      </p>
                    </div>
                    <Badge variant={s.variant}>
                      {r.status === "processing" && <Loader2 className="size-3 animate-spin" />}
                      {s.label}
                    </Badge>
                    {r.audioAvailable && (
                      <Button size="icon" variant="ghost" aria-label="Écouter" onClick={() => void play(r)}>
                        <Play />
                      </Button>
                    )}
                  </div>
                  {r.error && r.status === "failed" && <p className="text-xs text-destructive">{r.error}</p>}
                  {playing?.id === r.id && <audio src={playing.url} controls autoPlay className="h-9 w-full" />}
                </li>
              );
            })}
            {local.map((seg) => (
              <li key={seg.key} className="flex items-center gap-3 px-4 py-3">
                <FileAudio className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium">{seg.originalFilename ?? `Segment ${seg.segmentIndex + 1}`}</p>
                  <p className={cn("text-xs", seg.status === "error" ? "text-destructive" : "text-muted-foreground")}>
                    {seg.status === "error" ? seg.error : "Envoi sécurisé en cours…"}
                  </p>
                </div>
                {seg.status === "uploading" ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <Button size="sm" variant="outline" onClick={() => void upload(seg)}>
                    <RotateCw /> Réessayer
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recordings.length > 0 && !confirmed && needsTranscription && (
        <div className="flex flex-col items-center gap-3 rounded-xl border p-5 text-center">
          <Button size="lg" onClick={() => void transcribe()} disabled={!canTranscribe || !data.providerConfigured}>
            {transcribing ? <Loader2 className="animate-spin" /> : <Wand2 />}
            {transcribing
              ? `Transcription… ${Math.min(transcribing.done + 1, transcribing.total)}/${transcribing.total}`
              : transcribeError
                ? "Reprendre la transcription"
                : "Transcrire la consultation"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Transcription en français par {data.providerLabel}. L&apos;audio original est conservé jusqu&apos;à la
            confirmation de la transcription.
          </p>
          {transcribeError && (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="size-4" /> {transcribeError}
            </p>
          )}
        </div>
      )}

      {transcription && consultationId && (
        <TranscriptionEditor
          key={transcription.id + transcription.updatedAt}
          consultationId={consultationId}
          transcription={transcription}
          retentionDays={data.retentionDays}
          onConfirmed={(t, recs) => {
            setTranscription(t);
            setRecordings(recs);
            onProgress?.(3);
          }}
        />
      )}

      {confirmed && (
        <p className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="size-4" /> Transcription confirmée. Vous pouvez lancer l&apos;analyse de la fiche d&apos;observation ci-dessous.
        </p>
      )}
    </div>
  );
}

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

function MicStatus({ permission }: { permission: string }) {
  const map: Record<string, { label: string; icon: typeof Mic; className: string }> = {
    granted: { label: "Micro autorisé", icon: Mic, className: "text-success" },
    prompt: { label: "Le navigateur demandera l'accès au micro", icon: Mic, className: "text-muted-foreground" },
    unknown: { label: "Micro prêt à être autorisé", icon: Mic, className: "text-muted-foreground" },
    denied: { label: "Accès au micro refusé", icon: MicOff, className: "text-destructive" },
    "no-device": { label: "Aucun micro détecté", icon: MicOff, className: "text-destructive" },
    unsupported: { label: "Enregistrement non pris en charge par ce navigateur", icon: MicOff, className: "text-destructive" },
  };
  const s = map[permission] ?? map.unknown;
  return (
    <span className={cn("flex items-center gap-1.5", s.className)}>
      <s.icon className="size-4" /> {s.label}
    </span>
  );
}
