/**
 * Au démarrage du serveur : lancement des moteurs IA locaux (whisper.cpp,
 * Ollama) en arrière-plan, sans retarder l'ouverture de l'application.
 * AURISMED_AUTOSTART_ENGINES=0 désactive ce lancement automatique.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.AURISMED_AUTOSTART_ENGINES === "0") return;
  const { autostartEngines } = await import("./server/local-ai/supervisor");
  void autostartEngines().catch((e) => console.error("[moteur local] démarrage automatique", e));
}
