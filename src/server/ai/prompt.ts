import { AI_FIELDS, SECTIONS, type FieldDef } from "@/lib/medical/catalog";

function describe(f: FieldDef) {
  const parts = [`- ${f.path} | ${f.label}`];
  if (f.type === "yesno") parts.push("valeur : « oui » ou « non »");
  if (f.type === "number") parts.push(`valeur : nombre seul${f.unit ? ` en ${f.unit}` : ""}`);
  if (f.type === "choice") parts.push(`valeur : un code parmi ${f.options!.map((o) => `${o.code} (${o.label})`).join(", ")}`);
  if (f.type === "multi") parts.push(`valeur : codes séparés par des virgules parmi ${f.options!.map((o) => `${o.code} (${o.label})`).join(", ")}`);
  if (f.type === "text" || f.type === "longtext") parts.push("valeur : texte en français, fidèle à la transcription");
  if (f.requiresMeasurement) parts.push("à reprendre uniquement si la valeur a été mesurée (kind = measured)");
  if (f.hint) parts.push(f.hint);
  return parts.join(" | ");
}

/** Catalogue des champs, groupé par section de la fiche. */
export function fieldCatalogForPrompt() {
  return SECTIONS.map((s) => {
    const fields = AI_FIELDS.filter((f) => f.section === s.key);
    return fields.length ? `## ${s.title}\n${fields.map(describe).join("\n")}` : "";
  })
    .filter(Boolean)
    .join("\n\n");
}

export const SYSTEM_PROMPT = `Tu es un assistant de documentation médicale. Tu lis la transcription d'une téléconsultation médicale maritime (médecin du CCMM au téléphone avec un patient ou un soignant à bord) et tu ranges les informations dans les champs d'une fiche d'observation.

Règles absolues :
1. N'invente jamais rien. Chaque valeur doit être justifiée par une citation exacte de la transcription (source_quote, copiée mot pour mot, 3 à 30 mots). Sans citation, ne remplis pas le champ.
2. Un champ non abordé n'apparaît pas dans "fields". Ne mets jamais de valeur par défaut, de valeur normale supposée ni de déduction.
3. Une réponse négative explicite (« pas de vomissements », « il n'a pas perdu connaissance ») se note « non ». L'absence de mention n'est pas un « non ».
4. Distingue qui parle (speaker) : patient, doctor (médecin), onboard_caregiver (soignant ou officier à bord qui examine ou mesure), unknown si ce n'est pas clair.
5. Distingue la nature (kind) : reported (symptôme ou information rapportée), observed (signe constaté à l'examen), measured (valeur mesurée avec un appareil ou un comptage), instruction (consigne ou acte demandé par le médecin).
6. Les constantes (fréquences, tension, température, glycémie) ne sont reprises que si elles ont été mesurées. Une impression (« il a l'air chaud ») n'est pas une température.
7. Hypothèses diagnostiques : seulement celles formulées par le médecin, telles qu'il les a dites, sans en ajouter ni conclure. N'établis jamais de diagnostic.
8. Médicaments : seulement ceux prescrits ou recommandés explicitement par le médecin, avec le dosage, la posologie et la durée qu'il a donnés. Laisse null ce qui n'a pas été dit. Ne propose jamais de traitement. Les traitements déjà pris par le patient vont dans history.currentTreatmentDetail, pas dans medications.
9. confidence : high si l'information est claire et sans ambiguïté, medium si elle demande une interprétation, low si elle est incertaine, mal audible ou implicite.
10. Contradictions : si deux passages se contredisent (le patient revient sur une information, deux valeurs différentes), signale-les dans "contradictions" avec les citations, et donne dans "fields" la valeur la plus récente avec confidence low.
11. missing_important : liste les champs importants pour la situation clinique décrite qui n'ont pas été abordés (par exemple tension ou fréquence cardiaque pour une douleur thoracique), avec une raison courte. Ne remplis pas ces champs.
12. Les textes (histoire de la maladie, examen clinique) reprennent fidèlement le sens, en phrases courtes, sans ajouter d'information ni répéter ce qui est déjà dans un autre champ.
13. N'utilise que les chemins (path) du catalogue. Réponds en français.`;

export function userPrompt(transcript: string) {
  return `Catalogue des champs de la fiche d'observation :\n\n${fieldCatalogForPrompt()}\n\nTranscription de la consultation :\n"""\n${transcript}\n"""`;
}

/** Réplique de la transcription en direct telle que transmise au modèle. */
export type PromptSegment = { seq: number; startMs: number; text: string; speaker: "doctor" | "patient" | "unknown" };

const SPEAKER_FR = { doctor: "Médecin", patient: "Patient", unknown: "Locuteur non identifié" } as const;
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
export const formatPromptSegment = (s: PromptSegment) => `[${s.seq}] (${SPEAKER_FR[s.speaker]}, ${clock(s.startMs)}) ${s.text.trim()}`;

export const INCREMENTAL_RULES = `

Analyse au fil de la consultation :
14. Tu reçois des répliques numérotées [n] de la transcription en direct. Pour chaque information, indique dans "segment" le numéro de la réplique d'où vient la citation (source_quote doit être copiée de cette réplique).
15. L'interlocuteur indiqué entre parenthèses a pu être vérifié par le médecin : utilise-le pour "speaker" quand il est connu. « Locuteur non identifié » : déduis-le seulement si c'est évident, sinon "unknown".
16. Les valeurs déjà présentes dans la fiche te sont données. Ne les répète pas. Si une nouvelle réplique les contredit, donne la nouvelle valeur dans "fields" (elle sera présentée au médecin comme contradiction, jamais remplacée automatiquement) et décris l'écart dans "contradictions".
17. Les répliques de contexte (déjà analysées) servent seulement à comprendre la suite : n'en extrais rien.`;

export function incrementalUserPrompt(input: {
  segments: PromptSegment[];
  context: PromptSegment[];
  current: { path: string; label: string; value: string }[];
  full: boolean;
}) {
  const parts = [`Catalogue des champs de la fiche d'observation :\n\n${fieldCatalogForPrompt()}`];
  if (input.current.length) {
    parts.push(`Valeurs déjà présentes dans la fiche :\n${input.current.map((c) => `- ${c.path} (${c.label}) = ${c.value}`).join("\n")}`);
  }
  if (input.context.length) parts.push(`Répliques de contexte (déjà analysées) :\n${input.context.map(formatPromptSegment).join("\n")}`);
  parts.push(
    `${input.full ? "Transcription complète de la consultation (relecture d'ensemble)" : "Nouvelles répliques à analyser"} :\n"""\n${input.segments.map(formatPromptSegment).join("\n")}\n"""`,
  );
  if (!input.full) parts.push(`Pour "missing_important", renvoie une liste vide.`);
  return parts.join("\n\n");
}
