/**
 * Transcription en direct : règles d'assemblage, sans accès à la base
 * (testées dans live.test.ts).
 */
import type { Speaker } from "@/types/database";
import type { WhisperSegment } from "@/server/local-ai/whisper";
import { toParagraphs } from "./paragraphs";

export const SPEAKER_LABEL: Record<Speaker, string> = {
  doctor: "Médecin",
  patient: "Patient",
  unknown: "Non identifié",
};

/**
 * Phrases que whisper produit parfois sur du silence ou du bruit (génériques de
 * vidéos vues à l'entraînement). Un morceau n'est écarté que si TOUT son texte
 * en fait partie : aucun contenu de consultation n'est retiré.
 */
const HALLUCINATIONS = [
  /^sous-titr(age|es|é)s?\b.*$/i,
  /^merci d'avoir regardé.*$/i,
  /^abonnez-vous.*$/i,
  /^merci\.?$/i,
  /^\[?(musique|silence|bruit|rires?|applaudissements)\]?\.?$/i,
  /^\(?(musique|silence|bruit)\)?\.?$/i,
  /^\.+$/,
];

/** Texte utile d'un morceau : segments whisper très probablement sans parole et hallucinations connues retirés. */
export function cleanLiveText(text: string, segments: WhisperSegment[] = []): string {
  const kept = segments.length
    ? segments.filter((s) => (s.noSpeechProb ?? 0) < 0.8).map((s) => s.text)
    : [text];
  const joined = kept.join(" ").replace(/\s+/g, " ").trim();
  if (!joined || HALLUCINATIONS.some((re) => re.test(joined))) return "";
  return joined;
}

export type LiveSegmentRow = { seq: number; start_ms: number; end_ms: number; text: string; speaker: Speaker };

/**
 * Assemble les morceaux en transcription. Si au moins un interlocuteur est
 * connu, chaque tour de parole est préfixé (« Médecin : », « Patient : »,
 * « Non identifié : ») ; les morceaux consécutifs du même interlocuteur sont
 * regroupés. Sinon le texte est simplement mis en paragraphes.
 * Aucun mot n'est ajouté ni reformulé.
 */
export function assembleLiveTranscript(segments: LiveSegmentRow[]): string {
  const ordered = [...segments].sort((a, b) => a.seq - b.seq).filter((s) => s.text.trim());
  if (!ordered.length) return "";
  if (ordered.every((s) => s.speaker === "unknown")) {
    return toParagraphs(ordered.map((s) => s.text.trim()).join(" "));
  }
  const turns: { speaker: Speaker; text: string[] }[] = [];
  for (const s of ordered) {
    const last = turns.at(-1);
    if (last && last.speaker === s.speaker) last.text.push(s.text.trim());
    else turns.push({ speaker: s.speaker, text: [s.text.trim()] });
  }
  return turns.map((t) => `${SPEAKER_LABEL[t.speaker]} : ${t.text.join(" ")}`).join("\n\n");
}

/**
 * Répartit le texte des morceaux entre les segments audio enregistrés, d'après
 * la position de chaque morceau sur la ligne de temps de la consultation
 * (durées cumulées des segments audio, dans l'ordre). Un morceau va au segment
 * audio qui contient son milieu.
 */
export function assignToRecordings(
  recordings: { id: string; segment_index: number; duration: number | null }[],
  segments: LiveSegmentRow[],
): Map<string, string> {
  const windows: { id: string; start: number; end: number }[] = [];
  let t = 0;
  for (const r of [...recordings].sort((a, b) => a.segment_index - b.segment_index)) {
    const d = Math.max(0, (r.duration ?? 0) * 1000);
    windows.push({ id: r.id, start: t, end: t + d });
    t += d;
  }
  const result = new Map<string, string[]>(windows.map((w) => [w.id, []]));
  for (const s of [...segments].sort((a, b) => a.seq - b.seq)) {
    if (!s.text.trim()) continue;
    const mid = (s.start_ms + s.end_ms) / 2;
    const w = windows.find((x) => mid >= x.start && mid < x.end) ?? (mid >= t ? windows.at(-1) : undefined);
    if (w) result.get(w.id)!.push(s.text.trim());
  }
  return new Map([...result].map(([id, texts]) => [id, texts.join(" ")]));
}
