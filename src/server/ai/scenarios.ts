/**
 * Scénarios de consultation entièrement fictifs (aucune donnée réelle de patient)
 * servant à évaluer l'extraction avec un vrai fournisseur : `npm run eval:extraction`.
 *
 * expect : valeurs qui doivent être proposées.
 * absent : champs qui ne doivent PAS être remplis (contrôle des inventions).
 */
import type { FieldValue, SymptomPresence } from "@/lib/medical/form-state";

export type Scenario = {
  name: string;
  transcript: string;
  expect: Record<string, FieldValue>;
  absent: string[];
  medications?: { name: RegExp; dosageEmpty?: boolean }[];
  noMedications?: boolean;
  expectContradiction?: boolean;
  expectNeedsVerification?: string[];
  /** Sections maritimes proposées au modèle (vrai par défaut, faux pour l'urologie). */
  maritime?: boolean;
  /** Symptômes urologiques attendus avec leur présence. */
  symptoms?: Record<string, SymptomPresence>;
};

export const SCENARIOS: Scenario[] = [
  {
    name: "Brûlures mictionnelles (urologie, exemple du cahier des charges)",
    maritime: false,
    transcript:
      "Médecin : Bonjour, qu'est-ce qui vous amène ? Patient : J'ai des brûlures quand je fais pipi depuis trois jours. Médecin : Vous y allez plus souvent ? Patient : Oui, toutes les heures dans la journée, et je me lève trois fois la nuit. Médecin : Vous avez vu du sang dans les urines ? Patient : Non. Médecin : Vous avez de la fièvre ? Patient : Non, pas de fièvre. Médecin : Des douleurs dans le dos ? Patient : Non plus.",
    expect: {},
    symptoms: {
      brulures_mictionnelles: "yes",
      pollakiurie_diurne: "yes",
      nycturie: "yes",
      hematurie_macro: "no",
      fievre: "no",
      douleur_lombaire: "no",
    },
    absent: ["uro.exam.temperature", "uro.exam.prostate", "uro.exam.abdomen", "uro.lab.psa", "uro.lab.dipstick", "teleconsultation.diagnosticHypotheses"],
    noMedications: true,
  },
  {
    name: "Douleur abdominale fébrile (exemple du cahier des charges)",
    transcript:
      "Médecin : Bonjour, qu'est-ce qui vous arrive ? Patient : J'ai mal au ventre depuis hier soir, en bas à droite. Médecin : Vous avez des nausées ? Patient : Oui, un peu. Médecin : Des vomissements ? Patient : Non, pas de vomissements. Médecin : Vous avez pris votre température ? Patient : Oui, le thermomètre affichait 38 ce matin.",
    expect: { "medical.abdominal.nausea": true, "medical.abdominal.vomiting": false, "medical.general.temperature": 38 },
    absent: ["vitals.circ.systolic", "vitals.circ.heartRate", "teleconsultation.diagnosticHypotheses", "history.drugAllergy"],
    noMedications: true,
  },
  {
    name: "Douleur thoracique avec facteurs de risque",
    transcript:
      "Médecin : Décrivez-moi la douleur. Patient : Ça serre dans la poitrine, comme un étau, ça a commencé brutalement il y a vingt minutes au repos et ça descend dans le bras gauche. Médecin : Vous fumez ? Patient : Oui, un paquet par jour, et je suis diabétique. Soignant : Il est pâle et il transpire beaucoup. Médecin : Prenez-lui la tension. Soignant : 160 sur 95, pouls à 102.",
    expect: {
      "medical.chest.type": ["etau"],
      "medical.chest.radiation": ["bras"],
      "medical.chest.riskFactors": ["tabac", "diabete"],
      "vitals.circ.systolic": 160,
      "vitals.circ.diastolic": 95,
      "vitals.circ.heartRate": 102,
    },
    absent: ["medical.general.temperature", "teleconsultation.diagnosticHypotheses", "medical.general.glycemia"],
  },
  {
    name: "Chute sur le pont, traumatisme de cheville",
    transcript:
      "Soignant : Il a glissé sur le pont mouillé et est tombé sur la cheville droite. Médecin : Il s'est cogné la tête ? Soignant : Non, pas de choc à la tête, il n'a pas perdu connaissance. Médecin : La cheville est déformée ? Soignant : Elle est très gonflée mais pas déformée, pas de plaie. Médecin : Quelle douleur sur 10 ? Patient : Je dirais 7.",
    expect: { "trauma.head.blow": false, "trauma.head.lossOfConsciousness": false, "trauma.limbs.deformity": false, "trauma.limbs.bleedingWound": false, "trauma.painScore": 7 },
    absent: ["trauma.limbs.fracture", "trauma.limbs.fractureType", "vitals.circ.systolic"],
    noMedications: true,
  },
  {
    name: "Malaise avec perte de connaissance brève",
    transcript:
      "Soignant : Il s'est évanoui dans la salle des machines, ça a duré peut-être trente secondes. Médecin : Il a convulsé ? Soignant : Non, aucune convulsion. Médecin : Il avait des signes avant ? Patient : J'avais mal à la tête juste avant. Médecin : Vous avez mesuré la glycémie ? Soignant : Non, on n'a pas de lecteur.",
    expect: { "medical.syncope.lossOfConsciousness": true, "medical.syncope.convulsions": false, "medical.syncope.prodromes": ["cephalee"] },
    absent: ["medical.general.glycemia", "medical.general.temperature"],
  },
  {
    name: "Température rapportée non mesurée",
    transcript:
      "Patient : Je crois que j'ai de la fièvre, je dirais 39 mais je n'ai pas de thermomètre. Médecin : D'accord, on fera sans. Vous toussez ? Patient : Oui, depuis trois jours.",
    expect: {},
    absent: ["vitals.circ.systolic"],
    expectNeedsVerification: ["medical.general.temperature"],
  },
  {
    name: "Contradiction sur les vomissements",
    transcript:
      "Médecin : Avez-vous vomi ? Patient : Non, pas du tout. Médecin : Et ce matin ? Patient : Ah si, j'ai vomi une fois ce matin en fait.",
    expect: {},
    absent: [],
    expectContradiction: true,
    expectNeedsVerification: ["medical.abdominal.vomiting"],
  },
  {
    name: "Médicament cité sans posologie",
    transcript:
      "Médecin : Vous avez pris quelque chose ? Patient : Du paracétamol hier soir. Médecin : Vous êtes allergique à un médicament ? Patient : Oui, à la pénicilline.",
    expect: { "history.drugAllergy": "oui" },
    absent: ["teleconsultation.procedures"],
    medications: [{ name: /parac[ée]tamol/i, dosageEmpty: true }],
  },
  {
    name: "Consultation sans élément clinique",
    transcript: "Médecin : Bonjour, vous m'entendez ? Patient : Oui je vous entends. Médecin : Très bien, je vous rappelle dans cinq minutes, la liaison est mauvaise.",
    expect: {},
    absent: ["history.illnessHistory", "medical.general.temperature", "vitals.circ.heartRate", "teleconsultation.diagnosticHypotheses", "exam.findings"],
    noMedications: true,
  },
];
