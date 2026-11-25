/**
 * Indication de contexte transmise au modèle de transcription : elle oriente
 * l'orthographe du vocabulaire médical sans dicter de contenu.
 */
export const MEDICAL_VOCABULARY_HINT =
  "Téléconsultation médicale maritime en français entre un médecin et un patient ou un soignant à bord. " +
  "Vocabulaire possible : fréquence cardiaque, fréquence respiratoire, tension artérielle systolique et diastolique, " +
  "saturation, glycémie, température, échelle numérique de la douleur, Glasgow, pupilles réactives, cyanose, marbrures, " +
  "temps de recoloration cutanée, fosse iliaque droite, hypochondre, épigastre, défense abdominale, nausées, vomissements, " +
  "dyspnée, tachycardie, bradycardie, syncope, convulsions, traumatisme crânien, fracture ouverte, garrot, " +
  "paracétamol, ibuprofène, amoxicilline, morphine, CCMM, CROSS, SAMU, EVASAN, EVAMED, PLS, RCP.";

/** Garde les derniers caractères du texte précédent, coupés sur une limite de mot. */
export function continuityPrompt(previousText: string | undefined, maxChars = 600): string {
  if (!previousText) return MEDICAL_VOCABULARY_HINT;
  if (previousText.length <= maxChars) return `${MEDICAL_VOCABULARY_HINT}\n\n${previousText}`;
  const start = previousText.length - maxChars;
  let tail = previousText.slice(start);
  // Si la coupe tombe au milieu d'un mot, on retire ce mot partiel.
  if (previousText[start - 1] !== " ") tail = tail.slice(tail.indexOf(" ") + 1);
  return `${MEDICAL_VOCABULARY_HINT}\n\n${tail}`;
}
