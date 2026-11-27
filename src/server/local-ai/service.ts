import "server-only";
import { extractWithLocalModel } from "@/server/ai/local-extraction";
import { SCENARIOS } from "@/server/ai/scenarios";
import { processExtraction } from "@/server/ai/process";
import type { TranscriptionInput } from "@/server/transcription/provider";
import {
  listWhisperModels,
  selectedOllamaModel,
  selectedWhisperModel,
  setSetting,
  whisperServerBin,
} from "./config";
import { LocalAiError } from "./errors";
import { ollamaHealth, ollamaLoaded, ollamaModels, type OllamaLoaded, type OllamaModel } from "./ollama";
import { engineProcessInfo, restartEngine, startOllama, startWhisper, type EngineName } from "./supervisor";
import { systemInfo, type SystemInfo } from "./system";
import { WhisperCppProvider, whisperHealth } from "./whisper";

export type EngineStatus = {
  whisper: {
    health: "ok" | "loading" | "down";
    url: string;
    installed: boolean;
    model: string | null;
    models: { name: string; sizeBytes: number }[];
    process: ReturnType<typeof engineProcessInfo>;
  };
  ollama: {
    health: "ok" | "down";
    url: string;
    version: string | null;
    model: string | null;
    modelInstalled: boolean;
    models: OllamaModel[];
    loaded: OllamaLoaded[];
    process: ReturnType<typeof engineProcessInfo>;
  };
  system: SystemInfo;
};

/**
 * Point d'entrée unique de l'IA médicale locale : transcription (whisper.cpp),
 * extraction (Ollama), état des moteurs, choix des modèles et tests.
 *
 * Il n'existe aucun repli vers un service en ligne : si un moteur est arrêté,
 * l'appel échoue avec un message clair et rien n'est envoyé ailleurs.
 */
export class LocalMedicalAIService {
  private readonly whisper = new WhisperCppProvider();

  /** Fournisseur de transcription (interface TranscriptionProvider). */
  transcriptionProvider() {
    return this.whisper;
  }

  async transcribe(input: TranscriptionInput) {
    if (!selectedWhisperModel()) throw new LocalAiError("model_missing", "whisper", false);
    return this.whisper.transcribe(input);
  }

  async extractObservation(transcript: string) {
    return extractWithLocalModel(transcript);
  }

  async status(): Promise<EngineStatus> {
    const [wh, oh, system] = await Promise.all([whisperHealth(), ollamaHealth(), systemInfo()]);
    const [models, loaded] =
      oh.status === "ok"
        ? await Promise.all([ollamaModels().catch(() => []), ollamaLoaded().catch(() => [])])
        : [[], []];
    const ollamaModel = selectedOllamaModel();
    return {
      whisper: {
        health: wh.status,
        url: wh.url,
        installed: whisperServerBin() !== null,
        model: selectedWhisperModel(),
        models: listWhisperModels(),
        process: engineProcessInfo("whisper"),
      },
      ollama: {
        health: oh.status,
        url: oh.url,
        version: oh.version ?? null,
        model: ollamaModel,
        modelInstalled: Boolean(ollamaModel && models.some((m) => m.name === ollamaModel)),
        models,
        loaded,
        process: engineProcessInfo("ollama"),
      },
      system,
    };
  }

  start(engine: EngineName) {
    return engine === "whisper" ? startWhisper() : startOllama();
  }

  restart(engine: EngineName) {
    return restartEngine(engine);
  }

  /** Choix du modèle de transcription : appliqué au prochain (re)démarrage de whisper-server. */
  selectWhisperModel(name: string) {
    if (!listWhisperModels().some((m) => m.name === name)) throw new Error("Modèle de transcription introuvable.");
    setSetting("whisper_model", name);
  }

  /** Choix du modèle d'extraction : uniquement parmi les modèles déjà installés (aucun téléchargement). */
  async selectOllamaModel(name: string) {
    const models = await ollamaModels();
    if (!models.some((m) => m.name === name)) throw new Error("Modèle d'extraction introuvable dans Ollama.");
    setSetting("ollama_model", name);
  }

  /** Test d'extraction sur une consultation fictive : durée et nombre de champs proposés. */
  async testExtraction() {
    const scenario = SCENARIOS[0];
    const started = Date.now();
    const { output, model } = await this.extractObservation(scenario.transcript);
    const form = processExtraction(output, scenario.transcript, null, { model });
    const proposed = Object.entries(form.fields).filter(([, f]) => f.value !== null);
    return {
      model,
      seconds: (Date.now() - started) / 1000,
      transcript: scenario.transcript,
      fields: proposed.map(([path, f]) => ({ path, value: f.value, status: f.status })),
      discarded: form.discarded.length,
    };
  }
}

export const localMedicalAI = new LocalMedicalAIService();
