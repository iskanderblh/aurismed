/**
 * Catalogue des champs de la fiche d'observation médicale (fiche de référence,
 * pages 1 à 6). Source unique pour le formulaire, les instructions données à
 * l'IA, la validation de sa réponse et, en phase 6, le PDF.
 *
 * Les champs « Décision » et « Envoi au CCMM » ne sont jamais remplis par l'IA :
 * ils restent sous le contrôle du médecin.
 */

export type FieldType = "text" | "longtext" | "number" | "yesno" | "choice" | "multi";

export type Option = { code: string; label: string };

export type FieldDef = {
  path: string;
  label: string;
  type: FieldType;
  section: SectionKey;
  group: string;
  options?: Option[];
  unit?: string;
  min?: number;
  max?: number;
  /** Valeur devant avoir été mesurée (pas seulement rapportée) pour être reprise. */
  requiresMeasurement?: boolean;
  /** false : jamais rempli par l'IA (décision, envoi de documents...). */
  ai?: boolean;
  /** Indication donnée à l'IA en plus du libellé. */
  hint?: string;
};

export type SectionKey = "history" | "vitals" | "trauma" | "medical" | "exam" | "teleconsultation";

export const SECTIONS: { key: SectionKey; title: string; description: string }[] = [
  { key: "history", title: "Antécédents et histoire de la maladie", description: "Page 1 de la fiche" },
  { key: "vitals", title: "Bilan des fonctions vitales (BFV)", description: "Neurologique, respiratoire, circulatoire" },
  { key: "trauma", title: "Douleur et bilan lésionnel", description: "Examen d'un blessé / traumatisé" },
  { key: "medical", title: "Bilan médical", description: "Bilan d'un malade" },
  { key: "exam", title: "Examen clinique", description: "Constatations de l'examen" },
  { key: "teleconsultation", title: "Téléconsultation médicale", description: "Conclusion, surveillance, actes, décision" },
];

const yesno = (section: SectionKey, group: string, path: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({
  path,
  label,
  type: "yesno",
  section,
  group,
  ...extra,
});

const o = (code: string, label: string): Option => ({ code, label });

export const FIELDS: FieldDef[] = [
  // --- Page 1 : antécédents et histoire ------------------------------------
  { path: "history.medicalSurgical", label: "Antécédents médicaux et chirurgicaux", type: "longtext", section: "history", group: "Antécédents" },
  { path: "history.drugAllergy", label: "Allergie à des médicaments", type: "choice", section: "history", group: "Antécédents", options: [o("non", "Non"), o("oui", "Oui")] },
  { path: "history.drugAllergyDetail", label: "Allergies : lesquelles", type: "text", section: "history", group: "Antécédents" },
  { path: "history.currentTreatment", label: "Traitement en cours", type: "choice", section: "history", group: "Antécédents", options: [o("aucun", "Aucun"), o("oui", "Oui")] },
  { path: "history.currentTreatmentDetail", label: "Traitements : lesquels", type: "text", section: "history", group: "Antécédents" },
  { path: "history.illnessHistory", label: "Histoire de la maladie / Circonstances de l'accident", type: "longtext", section: "history", group: "Histoire de la maladie" },
  { path: "history.onsetDate", label: "Date de début des symptômes ou de l'accident", type: "text", section: "history", group: "Histoire de la maladie", hint: "Telle qu'énoncée (ex. « hier soir », « 23/11 vers 22 h »)." },
  { path: "history.careBeforeCall", label: "Soins et traitements débutés avant téléconsultation", type: "longtext", section: "history", group: "Histoire de la maladie" },

  // --- Page 2 : BFV ----------------------------------------------------------
  {
    path: "vitals.neuro.speech", label: "Parole", type: "choice", section: "vitals", group: "Neurologique",
    options: [o("oriente", "Oui, orienté, adapté"), o("desoriente", "Oui, désorienté, confus"), o("geignement", "Geignement"), o("aucune", "Aucune")],
  },
  {
    path: "vitals.neuro.eyes", label: "Yeux", type: "choice", section: "vitals", group: "Neurologique",
    options: [o("spontane", "Ouverts spontanément"), o("ordre", "À l'ordre « Ouvrez les yeux ! »"), o("douleur", "Ouverture à la douleur"), o("aucune", "Aucune réaction à la douleur")],
  },
  {
    path: "vitals.neuro.movements", label: "Mouvements", type: "choice", section: "vitals", group: "Neurologique",
    options: [o("spontane", "Bouge spontanément"), o("ordre", "Aux ordres simples (« Serrez-moi les mains ! »)"), o("adaptes", "Mouvements adaptés à la douleur"), o("inadaptes", "Mouvements inadaptés"), o("aucune", "Aucune réaction")],
  },
  yesno("vitals", "Neurologique", "vitals.neuro.pupilsReactive", "Pupilles réactives à la lumière"),
  yesno("vitals", "Neurologique", "vitals.neuro.pupilsSymmetric", "Pupilles symétriques"),
  { path: "vitals.neuro.pupilLeft", label: "Diamètre pupille gauche", type: "choice", section: "vitals", group: "Neurologique", options: [o("serre", "Serré"), o("intermediaire", "Intermédiaire"), o("dilate", "Dilaté")] },
  { path: "vitals.neuro.pupilRight", label: "Diamètre pupille droite", type: "choice", section: "vitals", group: "Neurologique", options: [o("serre", "Serré"), o("intermediaire", "Intermédiaire"), o("dilate", "Dilaté")] },

  { path: "vitals.resp.rate", label: "Fréquence respiratoire", type: "number", unit: "/min", min: 0, max: 80, section: "vitals", group: "Respiratoire", requiresMeasurement: true, hint: "Normale 12-20." },
  yesno("vitals", "Respiratoire", "vitals.resp.retraction", "Tirage"),
  yesno("vitals", "Respiratoire", "vitals.resp.hotSweats", "Sueurs chaudes"),
  yesno("vitals", "Respiratoire", "vitals.resp.cannotSpeak", "Parole impossible"),
  yesno("vitals", "Respiratoire", "vitals.resp.noises", "Bruits respiratoires"),
  yesno("vitals", "Respiratoire", "vitals.resp.cyanosis", "Cyanose (lèvres, ongles bleutés)"),

  { path: "vitals.circ.radialPulse", label: "Pouls radial", type: "choice", section: "vitals", group: "Circulatoire", options: [o("bien_frappe", "Bien frappé"), o("filant", "Filant"), o("non_percu", "Non perçu")] },
  { path: "vitals.circ.heartRate", label: "Fréquence cardiaque", type: "number", unit: "/min", min: 0, max: 300, section: "vitals", group: "Circulatoire", requiresMeasurement: true, hint: "Normale 60-100." },
  { path: "vitals.circ.systolic", label: "Tension artérielle systolique", type: "number", unit: "mmHg", min: 0, max: 300, section: "vitals", group: "Circulatoire", requiresMeasurement: true, hint: "« 13/8 » s'entend 130/80 mmHg." },
  { path: "vitals.circ.diastolic", label: "Tension artérielle diastolique", type: "number", unit: "mmHg", min: 0, max: 200, section: "vitals", group: "Circulatoire", requiresMeasurement: true },
  yesno("vitals", "Circulatoire", "vitals.circ.mottling", "Marbrures"),
  yesno("vitals", "Circulatoire", "vitals.circ.pallor", "Pâleur"),
  yesno("vitals", "Circulatoire", "vitals.circ.sweats", "Sueurs"),
  yesno("vitals", "Circulatoire", "vitals.circ.coldExtremities", "Froideur des extrémités"),
  yesno("vitals", "Circulatoire", "vitals.circ.capillaryRefill", "Temps de recoloration cutanée > 3 s"),
  yesno("vitals", "Circulatoire", "vitals.circ.thirst", "Sensation de soif"),

  // --- Page 3 : douleur et bilan lésionnel -----------------------------------
  { path: "trauma.painScore", label: "Douleur EN (évaluation numérique)", type: "number", unit: "/10", min: 0, max: 10, section: "trauma", group: "Douleur", hint: "Note donnée par le patient de 0 à 10." },
  yesno("trauma", "Tête", "trauma.head.blow", "Coup à la tête (traumatisme crânien)"),
  yesno("trauma", "Tête", "trauma.head.lossOfConsciousness", "Perte de connaissance"),
  yesno("trauma", "Tête", "trauma.head.remembers", "Se souvient de ce qui s'est passé"),
  yesno("trauma", "Rachis", "trauma.spine.cervical", "Douleur à la palpation cervicale"),
  yesno("trauma", "Rachis", "trauma.spine.back", "Douleur à la palpation dorsale"),
  yesno("trauma", "Rachis", "trauma.spine.lumbar", "Douleur à la palpation lombaire"),
  yesno("trauma", "Rachis", "trauma.spine.canMoveExtremities", "Peut bouger orteils et doigts"),
  yesno("trauma", "Rachis", "trauma.spine.tingling", "Fourmillements (pieds, mains)"),
  yesno("trauma", "Rachis", "trauma.spine.feelsTouch", "Sent le toucher (jambes, bras)"),
  yesno("trauma", "Thorax", "trauma.thorax.painOnInspiration", "Douleur à l'inspiration profonde"),
  yesno("trauma", "Thorax", "trauma.thorax.ribPain", "Douleur au toucher des côtes"),
  yesno("trauma", "Abdomen", "trauma.abdomen.pain", "Mal au ventre"),
  yesno("trauma", "Abdomen", "trauma.abdomen.palpationPain", "Douleur à la palpation abdominale"),
  yesno("trauma", "Bassin", "trauma.pelvis.painfulPressure", "Appui sur le bassin douloureux"),
  yesno("trauma", "Bassin", "trauma.pelvis.testicularHematoma", "Hématome testiculaire"),
  yesno("trauma", "Membres", "trauma.limbs.pain", "Douleur d'un membre"),
  yesno("trauma", "Membres", "trauma.limbs.burn", "Brûlure"),
  yesno("trauma", "Membres", "trauma.limbs.fracture", "Fracture"),
  { path: "trauma.limbs.fractureType", label: "Type de fracture", type: "choice", section: "trauma", group: "Membres", options: [o("ouverte", "Ouverte"), o("fermee", "Fermée")] },
  yesno("trauma", "Membres", "trauma.limbs.deformity", "Déformation"),
  yesno("trauma", "Membres", "trauma.limbs.bleedingWound", "Plaie hémorragique"),
  yesno("trauma", "Membres", "trauma.limbs.compressionEffective", "Compression efficace"),
  { path: "trauma.limbs.tourniquetTime", label: "Heure de pose du garrot", type: "text", section: "trauma", group: "Membres" },
  {
    path: "trauma.injuryNotes", label: "Localisation des lésions (description)", type: "longtext", section: "trauma", group: "Schéma lésionnel",
    hint: "Uniquement les localisations explicitement précisées. Le médecin annote le schéma lui-même.",
  },

  // --- Page 4 : bilan médical --------------------------------------------------
  { path: "medical.general.temperature", label: "Température", type: "number", unit: "°C", min: 25, max: 45, section: "medical", group: "Général", requiresMeasurement: true },
  { path: "medical.general.glycemia", label: "Glycémie", type: "text", section: "medical", group: "Général", requiresMeasurement: true, hint: "Valeur et unité telles qu'énoncées (g/L ou mmol/L)." },
  yesno("medical", "Général", "medical.general.ecg", "ECG réalisé"),

  { path: "medical.chest.location", label: "Localisation de la douleur thoracique", type: "text", section: "medical", group: "Douleur thoracique" },
  { path: "medical.chest.type", label: "Type de douleur thoracique", type: "multi", section: "medical", group: "Douleur thoracique", options: [o("etau", "En étau"), o("brulure", "Brûlure"), o("crampe", "Crampe"), o("autre", "Autre")] },
  { path: "medical.chest.typeOther", label: "Type de douleur : autre", type: "text", section: "medical", group: "Douleur thoracique" },
  { path: "medical.chest.durationMin", label: "Durée", type: "number", unit: "min", min: 0, max: 100000, section: "medical", group: "Douleur thoracique" },
  yesno("medical", "Douleur thoracique", "medical.chest.stillPresent", "Toujours présente"),
  { path: "medical.chest.onset", label: "Début", type: "multi", section: "medical", group: "Douleur thoracique", options: [o("brutal", "Brutal"), o("progressif", "Progressif"), o("effort", "À l'effort"), o("repos", "Au repos")] },
  { path: "medical.chest.radiation", label: "Irradiation", type: "multi", section: "medical", group: "Douleur thoracique", options: [o("bras", "Bras"), o("machoire", "Mâchoire"), o("dos", "Dos"), o("abdomen", "Abdomen"), o("autre", "Autre")] },
  { path: "medical.chest.radiationOther", label: "Irradiation : autre", type: "text", section: "medical", group: "Douleur thoracique" },
  { path: "medical.chest.severitySigns", label: "Signes associés de gravité", type: "multi", section: "medical", group: "Douleur thoracique", options: [o("paleur", "Pâleur"), o("sueurs", "Sueurs"), o("malaise", "Malaise")] },
  {
    path: "medical.chest.otherSigns", label: "Autres signes", type: "multi", section: "medical", group: "Douleur thoracique",
    options: [o("toux", "Toux"), o("crachats", "Crachats"), o("majoree_inspiration", "Majorée à l'inspiration, à la toux"), o("nausees", "Nausées"), o("vomissements", "Vomissements"), o("emphyseme", "Emphysème sous-cutané")],
  },
  {
    path: "medical.chest.riskFactors", label: "Facteurs de risque", type: "multi", section: "medical", group: "Douleur thoracique",
    options: [o("tabac", "Tabac"), o("diabete", "Diabète"), o("obesite", "Obésité"), o("hypertension", "Hypertension"), o("hypercholesterolemie", "Hypercholestérolémie")],
  },

  { path: "medical.abdominal.location", label: "Localisation de la douleur abdominale", type: "text", section: "medical", group: "Douleur abdominale" },
  { path: "medical.abdominal.type", label: "Type de douleur abdominale", type: "multi", section: "medical", group: "Douleur abdominale", options: [o("brulure", "Brûlure"), o("crampe", "Crampe"), o("pointe", "Pointe"), o("autre", "Autre")] },
  { path: "medical.abdominal.typeOther", label: "Type de douleur : autre", type: "text", section: "medical", group: "Douleur abdominale" },
  { path: "medical.abdominal.onsetTime", label: "Heure de début", type: "text", section: "medical", group: "Douleur abdominale" },
  { path: "medical.abdominal.durationMin", label: "Durée", type: "number", unit: "min", min: 0, max: 100000, section: "medical", group: "Douleur abdominale" },
  { path: "medical.abdominal.radiation", label: "Irradiations", type: "text", section: "medical", group: "Douleur abdominale" },
  yesno("medical", "Douleur abdominale", "medical.abdominal.urinarySigns", "Signes urinaires"),
  yesno("medical", "Douleur abdominale", "medical.abdominal.vomiting", "Vomissements"),
  yesno("medical", "Douleur abdominale", "medical.abdominal.nausea", "Nausées"),
  yesno("medical", "Douleur abdominale", "medical.abdominal.constipation", "Constipation"),
  yesno("medical", "Douleur abdominale", "medical.abdominal.diarrhea", "Diarrhée"),
  { path: "medical.abdominal.stoolsPerDay", label: "Nombre de selles par jour", type: "number", min: 0, max: 50, section: "medical", group: "Douleur abdominale" },
  { path: "medical.abdominal.otherSigns", label: "Autres signes", type: "text", section: "medical", group: "Douleur abdominale" },
  { path: "medical.abdominal.lastPeriod", label: "Date des dernières règles", type: "text", section: "medical", group: "Douleur abdominale" },

  yesno("medical", "Malaise", "medical.syncope.lossOfConsciousness", "Perte de connaissance"),
  { path: "medical.syncope.duration", label: "Durée de la perte de connaissance", type: "text", section: "medical", group: "Malaise" },
  yesno("medical", "Malaise", "medical.syncope.convulsions", "Mouvements anormaux (convulsions)"),
  {
    path: "medical.syncope.prodromes", label: "Prodromes", type: "multi", section: "medical", group: "Malaise",
    options: [o("aucun", "Aucun"), o("cephalee", "Céphalée"), o("en_se_levant", "En se levant"), o("apres_traumatisme", "Après un traumatisme"), o("douleur_thoracique", "Douleur thoracique")],
  },
  {
    path: "medical.syncope.neuroSigns", label: "Signes neurologiques", type: "multi", section: "medical", group: "Malaise",
    options: [o("trouble_parole", "Trouble de la parole"), o("membre_immobile", "Ne bouge pas un membre"), o("asymetrie_face", "Asymétrie de la face"), o("convulsion", "Convulsion"), o("perte_urine", "Perte d'urine"), o("morsure_langue", "Morsure de langue")],
  },

  // --- Page 5 : examen clinique ------------------------------------------------
  {
    path: "exam.findings", label: "Examen clinique", type: "longtext", section: "exam", group: "Examen clinique",
    hint: "Uniquement les constatations d'examen effectivement observées ou rapportées par la personne qui examine, pas les plaintes du patient.",
  },

  // --- Page 6 : téléconsultation ----------------------------------------------
  {
    path: "teleconsultation.diagnosticHypotheses", label: "Hypothèses diagnostiques", type: "longtext", section: "teleconsultation", group: "Conclusion",
    hint: "Seulement les hypothèses formulées explicitement par le médecin, au conditionnel. Ne jamais en proposer.",
  },
  { path: "teleconsultation.monitoring", label: "Surveillance", type: "longtext", section: "teleconsultation", group: "Surveillance", hint: "Consignes de surveillance données par le médecin." },
  {
    path: "teleconsultation.procedures", label: "Actes à réaliser", type: "multi", section: "teleconsultation", group: "Actes à réaliser",
    options: [
      o("ecg", "ECG"), o("photos", "Photos"), o("bu", "BU"), o("oxygene", "Oxygène"), o("test_palu", "Test paludisme"), o("injection", "Injection"),
      o("pansement", "Pansement"), o("glycemie", "Glycémie"), o("sutures", "Sutures / Agrafes"), o("rcp", "Réanimation (RCP)"), o("immobilisation", "Immobilisation"), o("pls", "PLS"),
    ],
    hint: "Actes demandés explicitement par le médecin.",
  },
  {
    path: "teleconsultation.sentToCcmm", label: "Envoi au CCMM", type: "multi", section: "teleconsultation", group: "Envoi au CCMM", ai: false,
    options: [o("ecg", "ECG"), o("photos", "Photos"), o("compte_rendu", "Compte rendu médical"), o("dossier_conclu", "Dossier CCMM conclu")],
  },
];

export const FIELD_BY_PATH = new Map(FIELDS.map((f) => [f.path, f]));
export const AI_FIELDS = FIELDS.filter((f) => f.ai !== false);
export const AI_FIELD_PATHS = AI_FIELDS.map((f) => f.path);

export function optionLabel(field: FieldDef, code: string) {
  return field.options?.find((x) => x.code === code)?.label ?? code;
}
