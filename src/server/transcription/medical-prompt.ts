/**
 * Indication de contexte transmise au modèle de transcription : elle oriente
 * l'orthographe du vocabulaire médical sans dicter de contenu.
 */
export const MEDICAL_VOCABULARY_HINT =
  "Consultation d'urologie en français entre un médecin et un patient. " +
  "Vocabulaire possible : pollakiurie, nycturie, urgenturie, dysurie, brûlures mictionnelles, rétention urinaire, anurie, " +
  "jet faible, gouttes retardataires, résidu post-mictionnel, incontinence, hématurie, caillots, urines troubles, pyurie, " +
  "colique néphrétique, douleur lombaire, fosse lombaire, sus-pubien, testicule, scrotum, prostate, toucher rectal, " +
  "bandelette urinaire, ECBU, créatinine, DFG, PSA, NFS, CRP, échographie rénale, vésicale et prostatique, uroscanner, " +
  "débitmétrie, cystoscopie, sonde urinaire, tamsulosine, alfuzosine, finastéride, paracétamol, fosfomycine, ofloxacine.";

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
