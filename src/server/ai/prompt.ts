import { AI_FIELDS, SECTIONS, isMaritimeField, type FieldDef } from "@/lib/medical/catalog";
import { CATEGORIES, SYMPTOMS, type SymptomDef } from "@/lib/urology/taxonomy";

function describe(f: FieldDef) {
  const parts = [`- ${f.path} | ${f.label}`];
  if (f.type === "yesno") parts.push("valeur : « oui » ou « non »");
  if (f.type === "number") parts.push(`valeur : nombre seul${f.unit ? ` en ${f.unit}` : ""}`);
  if (f.type === "choice") parts.push(`valeur : un code parmi ${f.options!.map((o) => `${o.code} (${o.label})`).join(", ")}`);
  if (f.type === "multi") parts.push(`valeur : codes séparés par des virgules parmi ${f.options!.map((o) => `${o.code} (${o.label})`).join(", ")}`);
  if (f.type === "text" || f.type === "longtext") parts.push("valeur : texte en français, fidèle à la transcription");
  if (f.requiresMeasurement) parts.push("à reprendre uniquement si la valeur a été mesurée (kind = measured)");
  if (f.clinicalExam) parts.push("constatation d'examen : seulement si énoncée par le médecin");
  if (f.hint) parts.push(f.hint);
  return parts.join(" | ");
}

/** Catalogue des champs, groupé par section de la fiche (sections maritimes seulement si ce contexte est activé). */
export function fieldCatalogForPrompt(options: { maritime?: boolean } = {}) {
  return SECTIONS.filter((s) => options.maritime || !s.maritime).map((s) => {
    const fields = AI_FIELDS.filter((f) => f.section === s.key && (options.maritime || !isMaritimeField(f)));
    return fields.length ? `## ${s.title}\n${fields.map(describe).join("\n")}` : "";
  })
    .filter(Boolean)
    .join("\n\n");
}

const MARITIME_CONTEXT =
  "Contexte maritime activé : il peut s'agir d'une téléconsultation du CCMM avec un patient ou un soignant à bord ; les sections maritimes (BFV, bilan lésionnel, bilan médical) sont disponibles.";

/** Instructions du modèle : documentation d'une consultation d'urologie, sans jamais inventer ni diagnostiquer. */
export function systemPrompt(options: { maritime?: boolean } = {}) {
  return `Tu es un assistant de documentation médicale en urologie. Tu lis la transcription d'une consultation (médecin et patient, en français) et tu ranges les informations dans une fiche d'observation structurée. Ta mission n'est PAS de poser un diagnostic : tu transformes les paroles du médecin et du patient en documentation.
${options.maritime ? `\n${MARITIME_CONTEXT}\n` : ""}
Règles absolues :
1. N'invente jamais rien : ni symptôme, ni constatation d'examen normale, ni constante, ni résultat biologique, ni PSA, ni diagnostic, ni dosage, ni prescription. Chaque information doit être justifiée par une citation exacte de la transcription (source_quote, copiée mot pour mot, 3 à 30 mots). Sans citation, ne la mentionne pas.
2. Un élément non abordé n'apparaît pas. L'absence de mention n'est jamais un « non » ni un examen normal. Une négation explicite (« pas de fièvre », « je n'ai pas de sang dans les urines ») se note : presence "no" pour un symptôme, « non » pour un champ oui/non.
3. Qui parle (speaker) : patient, doctor (médecin), onboard_caregiver (soignant ou accompagnant qui examine ou mesure), unknown si ce n'est pas clair. Ne suppose pas qui parle quand c'est incertain.
4. Nature (kind) : reported (rapporté par le patient), observed (constaté à l'examen par le médecin), measured (mesuré avec un appareil, ou résultat chiffré d'examen), instruction (consigne du médecin).
5. Symptômes (liste "symptoms") : utilise uniquement les identifiants de la taxonomie fournie. presence : yes, no ou uncertain. expression : les mots du patient. Renseigne seulement les caractéristiques dites (durée, début, fréquence, intensité /10, localisation, côté, irradiation, facteurs aggravants ou soulageants, nombre d'épisodes, valeur, date) et null pour le reste. Un symptôme n'est retenu que si la description y correspond exactement (par exemple « surtout la nuit » = nycturie, mais pas forcément pollakiurie diurne). Les antécédents (calculs, colique néphrétique passée, chirurgie...) vont aussi dans "symptoms", catégorie antécédents, avec nombre et dates tels qu'énoncés.
6. Un symptôme reste un symptôme : « hématurie » ne devient jamais une maladie. Hypothèses diagnostiques : seulement celles formulées par le médecin, telles qu'il les a dites.
7. Examen clinique : seulement ce que le médecin dit avoir constaté (speaker doctor, kind observed ou measured). Jamais de déduction ni d'examen « normal » par défaut.
8. Constantes et résultats (température, tension, fréquence cardiaque, PSA, créatinine, ECBU...) : seulement si une valeur mesurée ou un résultat est explicitement énoncé. Une impression (« il a l'air chaud ») n'est pas une température. Ne propose jamais d'examen à réaliser.
9. Médicaments : seulement ceux prescrits ou recommandés explicitement par le médecin, avec le dosage, la posologie et la durée qu'il a donnés ; null pour ce qui n'a pas été dit. Les traitements déjà pris par le patient vont dans history.currentTreatmentDetail ou uro.history.treatmentsTried.
10. confidence : high si l'information est claire, medium si elle demande une interprétation, low si elle est incertaine ou implicite.
11. Contradictions : si deux passages se contredisent, signale-les dans "contradictions" avec les citations, et donne la valeur la plus récente avec confidence low.
12. missing_important : champs importants pour la situation décrite et non abordés (par exemple température en cas de brûlures mictionnelles avec douleur lombaire), avec une raison courte. Ne les remplis pas.
13. Textes : reprends fidèlement le sens, en phrases courtes, sans ajouter d'information. N'utilise que les chemins (path) du catalogue. Réponds en français.`;
}

/** Compatibilité : instructions par défaut (sans contexte maritime). */
export const SYSTEM_PROMPT = systemPrompt();

/** Taxonomie des symptômes, groupée par catégorie, pour les instructions du modèle. */
export function taxonomyForPrompt(taxonomy: SymptomDef[] = SYMPTOMS) {
  return CATEGORIES.map((c) => {
    const items = taxonomy.filter((x) => x.category === c.key);
    if (!items.length) return "";
    return `## ${c.title}\n${items.map((x) => `- ${x.id} | ${x.name}${x.synonyms.length ? ` | ${x.synonyms.slice(0, 4).join(" ; ")}` : ""}`).join("\n")}`;
  })
    .filter(Boolean)
    .join("\n\n");
}

export function userPrompt(transcript: string, options: { maritime?: boolean; taxonomy?: SymptomDef[] } = {}) {
  return `Catalogue des champs de la fiche :\n\n${fieldCatalogForPrompt(options)}\n\nTaxonomie des symptômes urologiques (identifiant | nom | synonymes) :\n\n${taxonomyForPrompt(options.taxonomy)}\n\nTranscription de la consultation :\n"""\n${transcript}\n"""`;
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
  maritime?: boolean;
  taxonomy?: SymptomDef[];
}) {
  const parts = [
    `Catalogue des champs de la fiche :\n\n${fieldCatalogForPrompt(input)}`,
    `Taxonomie des symptômes urologiques (identifiant | nom | synonymes) :\n\n${taxonomyForPrompt(input.taxonomy)}`,
  ];
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
