"use client";

import { useEffect, useRef, useState } from "react";
import { SEGMENT_SECONDS } from "@/lib/recording/types";
import { Downsampler, SAMPLE_RATE, SpeechChunker, type ChunkEvent } from "@/lib/recording/vad";
import { WAV_MIME, encodeWav } from "@/lib/recording/wav";

export type RecorderState = "idle" | "requesting" | "recording" | "paused" | "stopped";
export type MicPermission = "unknown" | "prompt" | "granted" | "denied" | "unsupported" | "no-device";

export type FinishedSegment = { blob: Blob; mimeType: string; duration: number };
export type LiveChunk = Omit<ChunkEvent, "samples"> & { wav: Blob };

/**
 * Processeur audio (AudioWorklet) : regroupe les trames de 128 échantillons en
 * blocs de 4096 et les envoie au fil principal. Chargé depuis une URL blob :
 * aucun fichier à servir.
 */
const WORKLET = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(4096); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor("aurismed-capture", CaptureProcessor);
`;

const wavBlob = (samples: Float32Array) => new Blob([encodeWav(samples, SAMPLE_RATE)], { type: WAV_MIME });

/**
 * Enregistrement micro avec transcription en direct.
 *
 * L'audio est capté en PCM, ramené à 16 kHz mono, puis :
 * - accumulé en segments WAV de SEGMENT_SECONDS remis à `onSegment` pour être
 *   chiffrés et stockés au fil de l'eau (l'enregistrement complet est conservé) ;
 * - découpé en morceaux de parole (VAD, src/lib/recording/vad.ts) remis à
 *   `onChunk` : versions provisoires pendant la phrase, version stable à la fin.
 */
export function useLiveRecorder(handlers: { onSegment: (s: FinishedSegment) => void; onChunk: (c: LiveChunk) => void }) {
  const [state, setState] = useState<RecorderState>("idle");
  const [permission, setPermission] = useState<MicPermission>("unknown");
  const [elapsed, setElapsed] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string>();

  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const nodes = useRef<AudioNode[]>([]);
  const capturing = useRef(false);
  const chunker = useRef<SpeechChunker | null>(null);
  const downsampler = useRef<Downsampler | null>(null);
  const baseMs = useRef(0);
  const storage = useRef<Float32Array[]>([]);
  const storageLength = useRef(0);
  const recordedSamples = useRef(0);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
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

  const emitChunks = (events: ChunkEvent[]) => {
    for (const e of events) {
      const { samples, ...meta } = e;
      handlersRef.current.onChunk({ ...meta, startMs: meta.startMs + baseMs.current, endMs: meta.endMs + baseMs.current, wav: wavBlob(samples) });
    }
  };

  const flushStorage = () => {
    if (!storageLength.current) return;
    const all = new Float32Array(storageLength.current);
    let o = 0;
    for (const p of storage.current) {
      all.set(p, o);
      o += p.length;
    }
    storage.current = [];
    storageLength.current = 0;
    handlersRef.current.onSegment({ blob: wavBlob(all), mimeType: WAV_MIME, duration: all.length / SAMPLE_RATE });
  };

  const onBlock = (block: Float32Array) => {
    if (!capturing.current || !downsampler.current || !chunker.current) return;
    const samples = downsampler.current.push(block);
    if (!samples.length) return;
    recordedSamples.current += samples.length;
    storage.current.push(samples);
    storageLength.current += samples.length;
    if (storageLength.current >= SEGMENT_SECONDS * SAMPLE_RATE) flushStorage();
    emitChunks(chunker.current.push(samples));
  };

  const releaseDevices = () => {
    capturing.current = false;
    nodes.current.forEach((n) => n.disconnect());
    nodes.current = [];
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audioCtx.current?.close().catch(() => undefined);
    audioCtx.current = null;
    analyser.current = null;
  };

  const stop = () => {
    if (!chunker.current) return;
    capturing.current = false;
    emitChunks(chunker.current.flush());
    flushStorage();
    chunker.current = null;
    releaseDevices();
    setElapsed(recordedSamples.current / SAMPLE_RATE);
    setSpeaking(false);
    setState("stopped");
  };

  /** Démarre la capture. `firstSeq` et `offsetMs` prolongent une session précédente de la même consultation. */
  const start = async (options: { firstSeq: number; offsetMs: number }) => {
    setError(undefined);
    if (typeof AudioContext === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPermission("unsupported");
      setError("Ce navigateur ne permet pas l'enregistrement audio. Utilisez une version récente de Chrome, Edge ou Firefox, ou importez un fichier.");
      return;
    }
    setState("requesting");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
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
    stream.current.getAudioTracks().forEach((track) =>
      track.addEventListener("ended", () => {
        setError("L'enregistrement a été interrompu (micro déconnecté). La partie déjà enregistrée est conservée.");
        stop();
      }),
    );

    try {
      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const source = ctx.createMediaStreamSource(stream.current);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      source.connect(an);
      analyser.current = an;
      // Sortie muette : le graphe doit être relié à la destination pour être traité.
      const mute = ctx.createGain();
      mute.gain.value = 0;
      mute.connect(ctx.destination);
      let capture: AudioNode;
      if (ctx.audioWorklet) {
        const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
        try {
          await ctx.audioWorklet.addModule(url);
        } finally {
          URL.revokeObjectURL(url);
        }
        const node = new AudioWorkletNode(ctx, "aurismed-capture", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
        node.port.onmessage = (e: MessageEvent<Float32Array>) => onBlock(e.data);
        capture = node;
      } else {
        // Navigateurs sans AudioWorklet.
        const node = ctx.createScriptProcessor(4096, 1, 1);
        node.onaudioprocess = (e) => onBlock(new Float32Array(e.inputBuffer.getChannelData(0)));
        capture = node;
      }
      source.connect(capture);
      capture.connect(mute);
      nodes.current = [source, an, capture, mute];
      downsampler.current = new Downsampler(ctx.sampleRate);
    } catch {
      releaseDevices();
      setError("La capture audio n'a pas pu démarrer dans ce navigateur. Importez un fichier audio à la place.");
      setState("idle");
      return;
    }

    chunker.current = new SpeechChunker({}, options.firstSeq);
    baseMs.current = options.offsetMs;
    storage.current = [];
    storageLength.current = 0;
    recordedSamples.current = 0;
    setElapsed(0);
    capturing.current = true;
    setState("recording");
  };

  const pause = () => {
    if (!capturing.current || !chunker.current) return;
    capturing.current = false;
    // La phrase en cours est close : elle est transcrite pendant la pause.
    emitChunks(chunker.current.flush());
    void audioCtx.current?.suspend();
    setSpeaking(false);
    setState("paused");
  };

  const resume = () => {
    if (state !== "paused") return;
    void audioCtx.current?.resume();
    capturing.current = true;
    setState("recording");
  };

  // Horloge d'affichage et indicateur de parole.
  useEffect(() => {
    if (state !== "recording") return;
    const timer = setInterval(() => {
      setElapsed(recordedSamples.current / SAMPLE_RATE);
      setSpeaking(chunker.current?.speaking ?? false);
    }, 250);
    return () => clearInterval(timer);
  }, [state]);

  // Libère le micro si le composant disparaît (la partie en mémoire est remise avant).
  useEffect(
    () => () => {
      if (chunker.current) {
        capturing.current = false;
        flushStorage();
      }
      releaseDevices();
    },
    [],
  );

  const reset = () => {
    setState("idle");
    setElapsed(0);
    setError(undefined);
  };

  return { state, permission, elapsed, speaking, error, analyser, start, pause, resume, stop, reset };
}
