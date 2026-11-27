"use client";

import { useCallback, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Loader2,
  Mic,
  Play,
  RefreshCw,
  RotateCw,
  Sparkles,
  Wand2,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toWavSegments } from "@/lib/recording/wav";
import type { EngineStatus } from "@/server/local-ai/service";

type Engine = "whisper" | "ollama";
type Notice = { kind: "ok" | "error"; text: string } | null;

const gb = (bytes: number | null | undefined) =>
  bytes == null ? "inconnu" : `${(bytes / 1024 ** 3).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Go`;
const mb = (bytes: number) => `${Math.round(bytes / 1024 ** 2).toLocaleString("fr-FR")} Mo`;

function Health({ state }: { state: "ok" | "loading" | "down" }) {
  if (state === "ok")
    return (
      <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700">
        <CheckCircle2 className="size-3" /> En marche
      </Badge>
    );
  if (state === "loading")
    return (
      <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-700">
        <Loader2 className="size-3 animate-spin" /> Chargement du modèle
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-red-700">
      <XCircle className="size-3" /> Arrêté
    </Badge>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p className={`flex items-start gap-2 text-sm ${notice.kind === "ok" ? "text-emerald-700" : "text-destructive"}`}>
      {notice.kind === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertCircle className="mt-0.5 size-4 shrink-0" />}
      <span>{notice.text}</span>
    </p>
  );
}

/** Enregistre quelques secondes au micro ; onLevel reçoit le niveau sonore (0 à 1). */
async function recordSeconds(seconds: number, onLevel: (level: number) => void): Promise<Blob> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
    onLevel(Math.min(1, rms * 4));
  }, 80);
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  recorder.start();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  recorder.stop();
  await done;
  clearInterval(timer);
  onLevel(0);
  stream.getTracks().forEach((t) => t.stop());
  await ctx.close();
  return new Blob(chunks, { type: recorder.mimeType });
}

/**
 * Page « Moteur IA local » : état des moteurs (whisper.cpp, Ollama), modèles,
 * ressources du poste, démarrage, et tests. Aucune clé d'API : tout est local.
 */
export function LocalAiEngine({ initial }: { initial: EngineStatus }) {
  const [status, setStatus] = useState<EngineStatus | null>(initial);
  const [loadError, setLoadError] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, Notice>>({});
  const [level, setLevel] = useState(0);
  const [transcriptionTest, setTranscriptionTest] = useState<{ text: string; seconds: number; model: string } | null>(null);
  const [extractionTest, setExtractionTest] = useState<{
    model: string;
    seconds: number;
    transcript: string;
    fields: { path: string; value: unknown; status: string }[];
  } | null>(null);

  const notify = (key: string, notice: Notice) => setNotices((n) => ({ ...n, [key]: notice }));

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/moteur-ia/etat", { cache: "no-store" });
      const data = await res.json();
      if (data.ok) {
        setStatus(data.status);
        setLoadError(undefined);
      } else setLoadError(data.error ?? "État indisponible.");
    } catch {
      setLoadError("Le serveur AurisMED ne répond pas.");
    }
  }, []);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    notify(key, null);
    try {
      await fn();
    } catch (e) {
      notify(key, { kind: "error", text: e instanceof Error ? e.message : "L'opération a échoué." });
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  const post = async (url: string, body?: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: body instanceof FormData || body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ ok: false, error: "Réponse illisible du serveur." }));
    if (!data.ok) throw new Error(data.error ?? "L'opération a échoué.");
    return data;
  };

  const engineAction = (engine: Engine, action: "start" | "restart") =>
    run(`${engine}-action`, async () => {
      const data = await post("/api/moteur-ia/action", { engine, action });
      notify(`${engine}-action`, { kind: "ok", text: data.message });
    });

  const selectModel = (engine: Engine, name: string) =>
    run(`${engine}-model`, async () => {
      const data = await post("/api/moteur-ia/modele", { engine, name });
      notify(`${engine}-model`, { kind: "ok", text: data.message });
    });

  const testMic = () =>
    run("mic", async () => {
      let peak = 0;
      await recordSeconds(4, (l) => {
        peak = Math.max(peak, l);
        setLevel(l);
      });
      notify(
        "mic",
        peak > 0.05
          ? { kind: "ok", text: "Le micro capte le son." }
          : { kind: "error", text: "Aucun son détecté : vérifiez le micro choisi dans Windows et son niveau." },
      );
    });

  const testTranscription = () =>
    run("transcription", async () => {
      setTranscriptionTest(null);
      const recorded = await recordSeconds(6, setLevel);
      const [wav] = await toWavSegments(recorded, 30);
      const form = new FormData();
      form.set("file", new File([wav.blob], "test.wav", { type: "audio/wav" }));
      const data = await post("/api/moteur-ia/test-transcription", form);
      setTranscriptionTest({ text: data.text, seconds: data.seconds, model: data.model });
    });

  const testExtraction = () =>
    run("extraction", async () => {
      setExtractionTest(null);
      const data = await post("/api/moteur-ia/test-extraction");
      setExtractionTest(data.result);
    });

  const w = status?.whisper;
  const o = status?.ollama;
  const sys = status?.system;
  const ollamaGpu = o?.loaded.reduce((s, m) => s + m.vramBytes, 0) ?? 0;

  return (
    <Card id="moteur-ia-local" className="scroll-mt-6">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Moteur IA local</CardTitle>
            <CardDescription>
              La transcription (whisper.cpp) et l&apos;analyse médicale (Ollama) tournent sur ce poste. Aucune donnée
              n&apos;est envoyée en ligne, et aucune clé d&apos;API n&apos;est nécessaire.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void run("refresh", refresh)} disabled={busy !== null}>
            {busy === "refresh" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Vérifier l&apos;état
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {loadError && <NoticeLine notice={{ kind: "error", text: loadError }} />}
        {!status && !loadError && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Vérification des moteurs…
          </p>
        )}

        {status && w && o && sys && (
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Transcription */}
            <section className="space-y-3 rounded-lg border p-4" aria-label="Transcription locale">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 font-medium">
                  <Mic className="size-4" /> Transcription (whisper.cpp)
                </h3>
                <Health state={w.health} />
              </div>
              <Row label="Adresse">{w.url}</Row>
              <Row label="Programme">{w.installed ? "installé" : "introuvable"}</Row>
              <Row label="Processus">{w.process.managed ? `lancé par AurisMED (pid ${w.process.pid})` : w.health === "down" ? "—" : "lancé à part"}</Row>
              <div className="space-y-1.5">
                <label htmlFor="whisper-model" className="text-sm text-muted-foreground">
                  Modèle de transcription
                </label>
                {w.models.length ? (
                  <select
                    id="whisper-model"
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={w.model ?? ""}
                    disabled={busy !== null}
                    onChange={(e) => void selectModel("whisper", e.target.value)}
                  >
                    {!w.model && <option value="">Choisir…</option>}
                    {w.models.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name} ({mb(m.sizeBytes)})
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-warning">Aucun modèle dans moteurs\modeles-whisper : lancez l&apos;installation.</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void engineAction("whisper", "start")} disabled={busy !== null || w.health === "ok"}>
                  {busy === "whisper-action" ? <Loader2 className="animate-spin" /> : <Play />} Démarrer
                </Button>
                <Button size="sm" variant="outline" onClick={() => void engineAction("whisper", "restart")} disabled={busy !== null}>
                  <RotateCw /> Redémarrer
                </Button>
              </div>
              <NoticeLine notice={notices["whisper-action"] ?? notices["whisper-model"] ?? null} />
              {w.process.lastError && <NoticeLine notice={{ kind: "error", text: w.process.lastError }} />}
            </section>

            {/* Analyse médicale */}
            <section className="space-y-3 rounded-lg border p-4" aria-label="Analyse médicale locale">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 font-medium">
                  <Sparkles className="size-4" /> Analyse médicale (Ollama)
                </h3>
                <Health state={o.health} />
              </div>
              <Row label="Adresse">{o.url}</Row>
              <Row label="Version">{o.version ?? "—"}</Row>
              <Row label="Processus">{o.process.managed ? `lancé par AurisMED (pid ${o.process.pid})` : o.health === "down" ? "—" : "lancé à part"}</Row>
              <Row label="Modèle en mémoire">
                {o.loaded.length
                  ? o.loaded.map((m) => `${m.name} (${gb(m.sizeBytes)}, dont ${gb(m.vramBytes)} sur la carte graphique)`).join(", ")
                  : "aucun"}
              </Row>
              <div className="space-y-1.5">
                <label htmlFor="ollama-model" className="text-sm text-muted-foreground">
                  Modèle d&apos;analyse
                </label>
                {o.models.length ? (
                  <select
                    id="ollama-model"
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={o.modelInstalled ? (o.model ?? "") : ""}
                    disabled={busy !== null}
                    onChange={(e) => void selectModel("ollama", e.target.value)}
                  >
                    {!o.modelInstalled && <option value="">Choisir…</option>}
                    {o.models.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name} ({[m.parameterSize, gb(m.sizeBytes)].filter(Boolean).join(", ")})
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-warning">
                    {o.health === "ok" ? "Aucun modèle installé dans Ollama : lancez l'installation." : "Démarrez Ollama pour voir les modèles."}
                  </p>
                )}
                {o.model && !o.modelInstalled && o.health === "ok" && (
                  <p className="text-xs text-warning">Le modèle « {o.model} » n&apos;est pas installé.</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void engineAction("ollama", "start")} disabled={busy !== null || o.health === "ok"}>
                  {busy === "ollama-action" ? <Loader2 className="animate-spin" /> : <Play />} Démarrer
                </Button>
                <Button size="sm" variant="outline" onClick={() => void engineAction("ollama", "restart")} disabled={busy !== null}>
                  <RotateCw /> Redémarrer
                </Button>
              </div>
              <NoticeLine notice={notices["ollama-action"] ?? notices["ollama-model"] ?? null} />
              {o.process.lastError && <NoticeLine notice={{ kind: "error", text: o.process.lastError }} />}
            </section>

            {/* Ressources du poste */}
            <section className="space-y-3 rounded-lg border p-4 lg:col-span-2" aria-label="Ressources du poste">
              <h3 className="flex items-center gap-2 font-medium">
                <Cpu className="size-4" /> Ressources du poste
              </h3>
              <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                <Row label="Processeur">
                  {sys.cpuModel} ({sys.cpuCores} cœurs logiques)
                </Row>
                <Row label="Mémoire">
                  {gb(sys.memoryFreeBytes)} libres sur {gb(sys.memoryTotalBytes)}
                </Row>
                <Row label="Carte graphique">
                  {sys.gpus.length
                    ? sys.gpus.map((g) => `${g.name} (${(g.memoryTotalMb / 1024).toFixed(1)} Go)`).join(", ")
                    : "aucune carte NVIDIA détectée"}
                </Row>
                <Row label="Utilisée par l'analyse">{ollamaGpu > 0 ? `oui (${gb(ollamaGpu)})` : "non (processeur seul)"}</Row>
                <Row label="Espace disque libre">
                  {gb(sys.diskFreeBytes)} sur {gb(sys.diskTotalBytes)}
                </Row>
                <Row label="Données">{sys.dataDir}</Row>
              </div>
              {sys.diskFreeBytes !== null && sys.diskFreeBytes < 5 * 1024 ** 3 && (
                <NoticeLine notice={{ kind: "error", text: "Moins de 5 Go libres : libérez de l'espace avant d'enregistrer." }} />
              )}
            </section>
          </div>
        )}

        {/* Tests */}
        <section className="space-y-3 rounded-lg border p-4" aria-label="Tests">
          <h3 className="font-medium">Tests</h3>
          <p className="text-sm text-muted-foreground">
            Les tests n&apos;enregistrent rien : l&apos;audio de test est oublié après usage, et le test d&apos;analyse utilise une
            consultation fictive.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void testMic()} disabled={busy !== null}>
              {busy === "mic" ? <Loader2 className="animate-spin" /> : <Mic />} Tester le micro (4 s)
            </Button>
            <Button size="sm" variant="outline" onClick={() => void testTranscription()} disabled={busy !== null}>
              {busy === "transcription" ? <Loader2 className="animate-spin" /> : <Wand2 />} Tester la transcription (parlez 6 s)
            </Button>
            <Button size="sm" variant="outline" onClick={() => void testExtraction()} disabled={busy !== null}>
              {busy === "extraction" ? <Loader2 className="animate-spin" /> : <Sparkles />} Tester l&apos;analyse
            </Button>
          </div>
          {(busy === "mic" || busy === "transcription") && (
            <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted" aria-label="Niveau du micro">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
          )}
          {busy === "extraction" && (
            <p className="text-sm text-muted-foreground">Analyse en cours : sans carte graphique, cela peut prendre plusieurs minutes.</p>
          )}
          <NoticeLine notice={notices.mic ?? null} />
          <NoticeLine notice={notices.transcription ?? null} />
          <NoticeLine notice={notices.extraction ?? null} />
          {transcriptionTest && (
            <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
              <p className="text-xs text-muted-foreground">
                Transcrit en {transcriptionTest.seconds.toFixed(1)} s par {transcriptionTest.model}
              </p>
              <p>{transcriptionTest.text || "(aucune parole reconnue)"}</p>
            </div>
          )}
          {extractionTest && (
            <div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm">
              <p className="text-xs text-muted-foreground">
                Analyse en {extractionTest.seconds.toFixed(1)} s par {extractionTest.model} · {extractionTest.fields.length} champ(s)
                proposé(s)
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                {extractionTest.fields.map((f) => (
                  <li key={f.path}>
                    <code className="text-xs">{f.path}</code> : {String(f.value)}
                    {f.status === "needs_verification" ? " (à vérifier)" : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
