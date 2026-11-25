"use client";

import { useEffect, useRef, useState } from "react";
import { SEGMENT_SECONDS } from "@/lib/recording/types";

export type RecorderState = "idle" | "requesting" | "recording" | "paused" | "stopped";
export type MicPermission = "unknown" | "prompt" | "granted" | "denied" | "unsupported" | "no-device";

export type FinishedSegment = { blob: Blob; mimeType: string; duration: number };

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

/**
 * Enregistrement micro découpé en segments autonomes (fichiers lisibles seuls) :
 * toutes les SEGMENT_SECONDS, l'enregistreur est arrêté puis relancé sur le même
 * flux. Chaque segment terminé est remis à `onSegment` pour être envoyé
 * immédiatement : une longue consultation n'est jamais gardée en un seul bloc.
 */
export function useSegmentRecorder(onSegment: (segment: FinishedSegment) => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [permission, setPermission] = useState<MicPermission>("unknown");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string>();

  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const currentMeta = useRef<{ duration: number } | null>(null);
  const segmentElapsed = useRef(0);
  const totalElapsed = useRef(0);
  const tickStart = useRef<number | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const finishing = useRef(false);
  const onSegmentRef = useRef(onSegment);
  useEffect(() => {
    onSegmentRef.current = onSegment;
  });

  // État de la permission micro, quand le navigateur sait le dire.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      queueMicrotask(() => setPermission("unsupported"));
      return;
    }
    let status: PermissionStatus | undefined;
    const update = () => status && setPermission(status.state as MicPermission);
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((s) => {
        status = s;
        update();
        s.addEventListener("change", update);
      })
      .catch(() => setPermission("unknown"));
    return () => status?.removeEventListener("change", update);
  }, []);

  const accumulate = () => {
    if (tickStart.current !== null) {
      const delta = (performance.now() - tickStart.current) / 1000;
      segmentElapsed.current += delta;
      totalElapsed.current += delta;
      tickStart.current = performance.now();
    }
  };

  const startSegment = (mimeType: string) => {
    if (!stream.current) return;
    const rec = new MediaRecorder(stream.current, mimeType ? { mimeType, audioBitsPerSecond: 48_000 } : undefined);
    // Données et durée propres à ce segment : le segment suivant démarre avant que
    // celui-ci ait fini d'émettre ses dernières données.
    const parts: Blob[] = [];
    const meta = { duration: 0 };
    currentMeta.current = meta;
    segmentElapsed.current = 0;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) parts.push(e.data);
    };
    rec.onstop = () => {
      const type = rec.mimeType || mimeType || "audio/webm";
      const blob = new Blob(parts, { type });
      if (blob.size > 0) onSegmentRef.current({ blob, mimeType: type, duration: meta.duration });
    };
    rec.onerror = () => setError("L'enregistreur du navigateur a rencontré une erreur. Le segment en cours a été conservé.");
    // Tranches d'une seconde : en cas d'arrêt brutal, les données déjà reçues restent disponibles.
    rec.start(1000);
    recorder.current = rec;
  };

  /** Arrête l'enregistreur courant en figeant la durée de son segment. */
  const stopCurrent = () => {
    if (currentMeta.current) currentMeta.current.duration = segmentElapsed.current;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  };

  const releaseDevices = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audioCtx.current?.close().catch(() => undefined);
    audioCtx.current = null;
    analyser.current = null;
  };

  const stop = () => {
    if (!recorder.current || finishing.current) return;
    finishing.current = true;
    accumulate();
    tickStart.current = null;
    stopCurrent();
    recorder.current = null;
    releaseDevices();
    setElapsed(totalElapsed.current);
    setState("stopped");
    finishing.current = false;
  };

  const start = async () => {
    setError(undefined);
    const mimeType = pickMimeType();
    if (mimeType === null) {
      setPermission("unsupported");
      setError("Ce navigateur ne permet pas l'enregistrement audio. Utilisez une version récente de Chrome, Edge, Firefox ou Safari, ou importez un fichier.");
      return;
    }
    setState("requesting");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setPermission("denied");
        setError("L'accès au micro a été refusé. Autorisez le micro pour ce site dans les réglages du navigateur, puis réessayez.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setPermission("no-device");
        setError("Aucun micro détecté. Branchez un micro ou importez un fichier audio.");
      } else if (name === "NotReadableError") {
        setError("Le micro est utilisé par une autre application. Fermez-la puis réessayez.");
      } else {
        setError("Impossible d'accéder au micro.");
      }
      setState("idle");
      return;
    }
    setPermission("granted");

    // Micro débranché ou coupé par le système : le segment en cours est conservé.
    stream.current.getAudioTracks().forEach((track) =>
      track.addEventListener("ended", () => {
        setError("L'enregistrement a été interrompu (micro déconnecté). La partie déjà enregistrée est conservée.");
        stop();
      }),
    );

    try {
      const ctx = new AudioContext();
      const node = ctx.createAnalyser();
      node.fftSize = 512;
      ctx.createMediaStreamSource(stream.current).connect(node);
      audioCtx.current = ctx;
      analyser.current = node;
    } catch {
      // Visualisation facultative.
    }

    totalElapsed.current = 0;
    setElapsed(0);
    startSegment(mimeType);
    tickStart.current = performance.now();
    setState("recording");
  };

  const pause = () => {
    if (recorder.current?.state !== "recording") return;
    recorder.current.pause();
    accumulate();
    tickStart.current = null;
    setState("paused");
  };

  const resume = () => {
    if (recorder.current?.state !== "paused") return;
    recorder.current.resume();
    tickStart.current = performance.now();
    setState("recording");
  };

  // Horloge d'affichage et rotation des segments.
  useEffect(() => {
    if (state !== "recording") return;
    const timer = setInterval(() => {
      accumulate();
      setElapsed(totalElapsed.current);
      if (segmentElapsed.current >= SEGMENT_SECONDS && recorder.current && recorder.current.state === "recording") {
        const mimeType = recorder.current.mimeType;
        stopCurrent();
        startSegment(mimeType);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [state]);

  // Libère le micro si le composant disparaît.
  useEffect(
    () => () => {
      stopCurrent();
      releaseDevices();
    },
    [],
  );

  const reset = () => {
    setState("idle");
    setElapsed(0);
    setError(undefined);
  };

  return { state, permission, elapsed, error, analyser, start, pause, resume, stop, reset };
}
