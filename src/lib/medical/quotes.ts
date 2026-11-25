/**
 * Localisation d'une citation de l'IA dans la transcription, avec la même
 * normalisation que la vérification serveur (casse, accents, ponctuation).
 */
export function normalizeForMatch(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Texte normalisé + position dans le texte original de chaque caractère normalisé. */
function indexed(text: string) {
  let norm = "";
  const map: number[] = [];
  let sep = true;
  for (let i = 0; i < text.length; i++) {
    const base = text[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    for (const ch of base) {
      if (/[a-z0-9]/.test(ch)) {
        norm += ch;
        map.push(i);
        sep = false;
      } else if (!sep) {
        norm += " ";
        map.push(i);
        sep = true;
      }
    }
  }
  return { norm, map };
}

/** Extrait de la transcription autour de la citation, ou null si elle n'y figure pas. */
export function quoteContext(transcript: string, quote: string, radius = 180) {
  const piece = normalizeForMatch(quote.split(/\.\.\.|…/)[0] ?? "");
  if (!piece) return null;
  const { norm, map } = indexed(transcript);
  const at = norm.indexOf(piece);
  if (at < 0) return null;
  const start = map[at];
  const end = map[at + piece.length - 1] + 1;
  const from = Math.max(0, start - radius);
  const to = Math.min(transcript.length, end + radius);
  return {
    before: (from > 0 ? "…" : "") + transcript.slice(from, start),
    match: transcript.slice(start, end),
    after: transcript.slice(end, to) + (to < transcript.length ? "…" : ""),
  };
}
