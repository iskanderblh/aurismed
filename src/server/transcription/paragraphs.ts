/**
 * Mise en paragraphes déterministe du texte transcrit : aucun mot n'est ajouté,
 * retiré ni reformulé. Les phrases sont regroupées par paragraphes courts, et un
 * nouveau paragraphe commence à chaque question (alternance médecin / patient
 * probable) ou après un regroupement de phrases trop long.
 */
export function toParagraphs(text: string, maxSentences = 4, maxChars = 600): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const sentences = normalized.match(/[^.!?…]+(?:[.!?…]+["»”)]*|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [normalized];

  const paragraphs: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) paragraphs.push(current.join(" "));
    current = [];
  };
  for (const sentence of sentences) {
    current.push(sentence);
    const length = current.join(" ").length;
    if (sentence.endsWith("?") || current.length >= maxSentences || length >= maxChars) flush();
  }
  flush();
  return paragraphs.join("\n\n");
}

/** Assemble les textes des segments dans l'ordre, séparés par un paragraphe. */
export function joinSegments(segments: (string | null | undefined)[]): string {
  return segments
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}
