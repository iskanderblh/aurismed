/**
 * Taxonomie des symptômes urologiques : base structurée et extensible.
 *
 * Chaque symptôme a un identifiant stable, un nom, le terme médical, des
 * synonymes (expressions des patients incluses), une catégorie, une
 * description, les caractéristiques utiles à documenter et, si besoin, une
 * formulation simple pour le patient. Le médecin peut ajouter ses propres
 * termes et synonymes (table urology_terms) : ils s'ajoutent à cette base.
 *
 * Ce n'est pas un dictionnaire médical exhaustif, ni un outil de diagnostic :
 * un symptôme reste un symptôme rapporté ou constaté.
 */

export type SymptomAttribute =
  | "duration"
  | "onset"
  | "frequency"
  | "severity"
  | "location"
  | "side"
  | "radiation"
  | "aggravating"
  | "relieving"
  | "count"
  | "value"
  | "date"
  | "details";

export const ATTRIBUTE_LABEL: Record<SymptomAttribute, string> = {
  duration: "Durée / depuis",
  onset: "Début (brutal, progressif…)",
  frequency: "Fréquence",
  severity: "Intensité (/10)",
  location: "Localisation",
  side: "Côté",
  radiation: "Irradiation",
  aggravating: "Facteurs aggravants",
  relieving: "Facteurs soulageants",
  count: "Nombre d'épisodes",
  value: "Valeur / résultat",
  date: "Date",
  details: "Précisions",
};

export type CategoryKey =
  | "filling"
  | "voiding"
  | "volume"
  | "pain"
  | "urine"
  | "infection"
  | "prostate"
  | "male_genital"
  | "female"
  | "history"
  | "custom";

export const CATEGORIES: { key: CategoryKey; title: string }[] = [
  { key: "filling", title: "Troubles du remplissage vésical" },
  { key: "voiding", title: "Troubles de la vidange" },
  { key: "volume", title: "Troubles de la quantité urinaire" },
  { key: "pain", title: "Douleurs" },
  { key: "urine", title: "Modifications des urines" },
  { key: "infection", title: "Symptômes infectieux" },
  { key: "prostate", title: "Prostate" },
  { key: "male_genital", title: "Appareil génital masculin" },
  { key: "female", title: "Particularités urologiques féminines" },
  { key: "history", title: "Antécédents urologiques" },
  { key: "custom", title: "Termes ajoutés par le médecin" },
];

export type SymptomDef = {
  id: string;
  name: string;
  term: string;
  synonyms: string[];
  category: CategoryKey;
  description: string;
  attributes: SymptomAttribute[];
  patientWording?: string;
  /** Terme ajouté par le médecin (base locale). */
  custom?: boolean;
};

const PAIN: SymptomAttribute[] = ["location", "side", "severity", "duration", "onset", "frequency", "radiation", "aggravating", "relieving", "details"];
const BASIC: SymptomAttribute[] = ["duration", "frequency", "severity", "details"];
const HIST: SymptomAttribute[] = ["date", "count", "details"];

const s = (
  category: CategoryKey,
  id: string,
  name: string,
  term: string,
  synonyms: string[],
  description: string,
  attributes: SymptomAttribute[] = BASIC,
  patientWording?: string,
): SymptomDef => ({ id, name, term, synonyms, category, description, attributes, ...(patientWording && { patientWording }) });

export const SYMPTOMS: SymptomDef[] = [
  // 1. Troubles du remplissage vésical
  s("filling", "pollakiurie_diurne", "Pollakiurie diurne", "Pollakiurie diurne", ["uriner souvent la journée", "envies fréquentes d'uriner"], "Mictions anormalement fréquentes pendant la journée.", ["frequency", "duration", "details"], "Vous urinez plus souvent que d'habitude dans la journée ?"),
  s("filling", "nycturie", "Nycturie", "Nycturie", ["se lever la nuit pour uriner", "uriner la nuit", "réveils nocturnes pour uriner"], "Besoin de se réveiller la nuit pour uriner.", ["frequency", "duration", "details"], "Combien de fois vous levez-vous la nuit pour uriner ?"),
  s("filling", "urgenturie", "Urgenturie", "Urgenturie", ["envie pressante", "besoin urgent d'uriner", "impériosités mictionnelles", "ne pas pouvoir se retenir"], "Besoin soudain et pressant d'uriner, difficile à différer.", BASIC),
  s("filling", "incontinence_urgenturie", "Incontinence urinaire par urgenturie", "Incontinence urinaire par impériosité", ["fuites avant d'arriver aux toilettes", "fuites sur envie pressante"], "Perte involontaire d'urine précédée d'un besoin urgent.", ["frequency", "severity", "duration", "details"]),
  s("filling", "incontinence_effort", "Incontinence urinaire d'effort", "Incontinence urinaire d'effort", ["fuites en toussant", "fuites en éternuant", "fuites à l'effort", "fuites en riant"], "Perte involontaire d'urine lors d'un effort (toux, rire, sport).", ["frequency", "severity", "aggravating", "duration", "details"]),
  s("filling", "incontinence_mixte", "Incontinence mixte", "Incontinence urinaire mixte", ["fuites à l'effort et sur envie pressante"], "Association d'incontinence d'effort et par urgenturie.", ["frequency", "severity", "duration", "details"]),
  s("filling", "frequence_augmentee", "Augmentation de la fréquence mictionnelle", "Augmentation de la fréquence mictionnelle", ["urine plus souvent qu'avant"], "Augmentation globale du nombre de mictions (jour et nuit).", ["frequency", "duration", "details"]),
  s("filling", "douleur_remplissage", "Douleur liée au remplissage vésical", "Douleur vésicale de remplissage", ["mal au bas-ventre quand la vessie est pleine", "douleur soulagée en urinant"], "Douleur sus-pubienne qui augmente avec le remplissage et diminue après la miction.", ["severity", "duration", "relieving", "details"]),

  // 2. Troubles de la vidange
  s("voiding", "dysurie", "Dysurie", "Dysurie", ["difficulté à uriner", "mal à uriner", "uriner difficilement"], "Difficulté à évacuer l'urine (effort, lenteur). Ne pas confondre avec les brûlures mictionnelles.", BASIC),
  s("voiding", "hesitation", "Hésitation mictionnelle", "Retard au démarrage de la miction", ["met du temps à démarrer", "attendre avant que ça coule"], "Délai anormal avant le début du jet.", BASIC),
  s("voiding", "jet_faible", "Jet faible", "Diminution de la force du jet", ["jet faible", "jet qui ne pousse pas", "petit jet"], "Jet urinaire de faible débit.", BASIC),
  s("voiding", "jet_intermittent", "Jet intermittent", "Jet haché", ["jet en plusieurs fois", "jet qui s'arrête et repart"], "Jet qui s'interrompt et reprend plusieurs fois au cours d'une même miction.", BASIC),
  s("voiding", "jet_interrompu", "Jet interrompu", "Interruption brutale du jet", ["le jet se coupe d'un coup"], "Arrêt brutal du jet en cours de miction.", BASIC),
  s("voiding", "poussee_abdominale", "Poussée abdominale pour uriner", "Miction par poussée abdominale", ["pousser pour uriner", "forcer pour uriner"], "Nécessité de pousser avec les abdominaux pour uriner.", BASIC),
  s("voiding", "vidange_incomplete", "Sensation de vidange incomplète", "Sensation de résidu post-mictionnel", ["vessie pas vide", "impression de ne pas avoir fini", "besoin de réuriner juste après"], "Impression que la vessie n'est pas vide après la miction.", BASIC),
  s("voiding", "retention", "Rétention urinaire", "Rétention urinaire", ["ne peut plus uriner", "impossible d'uriner", "vessie bloquée", "globe vésical"], "Impossibilité d'uriner malgré une vessie pleine (aiguë ou chronique).", ["onset", "duration", "severity", "details"], "Arrivez-vous à uriner ?"),
  s("voiding", "gouttes_terminales", "Gouttes terminales", "Gouttes terminales", ["ça goutte à la fin"], "Écoulement goutte à goutte en fin de miction.", BASIC),
  s("voiding", "gouttes_retardataires", "Gouttes retardataires", "Gouttes retardataires (post-mictionnelles)", ["quelques gouttes après s'être rhabillé", "fuites après avoir uriné"], "Perte de quelques gouttes après la fin de la miction.", BASIC),
  s("voiding", "miction_prolongee", "Miction prolongée", "Allongement du temps mictionnel", ["met longtemps à uriner"], "Durée anormalement longue de la miction.", BASIC),

  // 3. Troubles de la quantité urinaire
  s("volume", "polyurie", "Polyurie", "Polyurie", ["urine beaucoup", "grandes quantités d'urine"], "Volume urinaire anormalement élevé sur 24 heures.", ["value", "duration", "details"]),
  s("volume", "oligurie", "Oligurie", "Oligurie", ["urine très peu", "très peu d'urine"], "Volume urinaire anormalement bas sur 24 heures.", ["value", "duration", "details"]),
  s("volume", "anurie", "Anurie", "Anurie", ["n'urine plus du tout", "plus une goutte d'urine", "pas d'urine depuis"], "Absence (ou quasi-absence) de production d'urine.", ["duration", "onset", "details"]),
  s("volume", "diminution_volume", "Diminution du volume urinaire", "Diminution de la diurèse", ["urine moins qu'avant"], "Baisse du volume urinaire par rapport à l'habitude.", ["duration", "details"]),
  s("volume", "augmentation_volume", "Augmentation du volume urinaire", "Augmentation de la diurèse", ["urine plus qu'avant"], "Hausse du volume urinaire par rapport à l'habitude.", ["duration", "details"]),

  // 4. Douleurs
  s("pain", "douleur_lombaire", "Douleur lombaire", "Lombalgie", ["mal au dos en bas", "mal aux reins", "douleur dans le bas du dos"], "Douleur de la région lombaire.", PAIN),
  s("pain", "douleur_flanc", "Douleur du flanc", "Douleur du flanc", ["mal sur le côté", "douleur au côté"], "Douleur latérale de l'abdomen, entre côtes et bassin.", PAIN),
  s("pain", "colique_nephretique", "Colique néphrétique", "Colique néphrétique", ["crise de colique néphrétique", "calcul qui fait mal", "douleur du rein qui descend vers l'aine"], "Douleur lombaire aiguë, paroxystique, irradiant vers l'aine ou les organes génitaux. Ne la noter que si elle est décrite ou nommée (symptôme, pas diagnostic).", PAIN),
  s("pain", "douleur_hypogastrique", "Douleur hypogastrique", "Douleur hypogastrique", ["mal au bas-ventre", "douleur sous le nombril"], "Douleur de la partie basse et médiane de l'abdomen.", PAIN),
  s("pain", "douleur_sus_pubienne", "Douleur sus-pubienne", "Douleur sus-pubienne", ["mal au-dessus du pubis", "douleur de la vessie"], "Douleur juste au-dessus du pubis.", PAIN),
  s("pain", "douleur_pelvienne", "Douleur pelvienne", "Douleur pelvienne", ["mal au bassin", "douleur dans le petit bassin"], "Douleur du petit bassin.", PAIN),
  s("pain", "douleur_perineale", "Douleur périnéale", "Douleur périnéale", ["mal entre les jambes", "douleur du périnée"], "Douleur de la région périnéale.", PAIN),
  s("pain", "douleur_uretrale", "Douleur urétrale", "Urétralgie", ["mal dans le canal", "douleur dans l'urètre"], "Douleur le long de l'urètre.", PAIN),
  s("pain", "douleur_penienne", "Douleur pénienne", "Douleur pénienne", ["mal à la verge", "douleur du pénis"], "Douleur de la verge.", PAIN),
  s("pain", "douleur_testiculaire", "Douleur testiculaire", "Orchialgie", ["mal aux testicules", "mal à un testicule"], "Douleur d'un ou des deux testicules. Préciser le début (brutal ?) et l'intensité.", PAIN),
  s("pain", "douleur_scrotale", "Douleur scrotale", "Douleur scrotale", ["mal aux bourses"], "Douleur de la bourse (scrotum).", PAIN),
  s("pain", "douleur_miction", "Douleur pendant la miction", "Douleur mictionnelle", ["mal en urinant", "douleur quand j'urine"], "Douleur ressentie pendant la miction.", PAIN),
  s("pain", "douleur_post_miction", "Douleur après la miction", "Douleur post-mictionnelle", ["mal après avoir uriné"], "Douleur survenant après la miction.", PAIN),
  s("pain", "douleur_ejaculation", "Douleur à l'éjaculation", "Éjaculation douloureuse", ["mal en éjaculant"], "Douleur pendant ou après l'éjaculation.", PAIN),

  // 5. Modifications des urines
  s("urine", "hematurie_macro", "Hématurie macroscopique", "Hématurie macroscopique", ["sang dans les urines", "urines rouges", "urines couleur rosé", "pipi rouge"], "Urines teintées de sang visibles à l'œil nu. Symptôme, pas diagnostic.", ["duration", "frequency", "details"]),
  s("urine", "hematurie_micro", "Hématurie microscopique", "Hématurie microscopique", ["sang à la bandelette", "traces de sang à l'analyse"], "Sang détecté seulement à l'analyse (bandelette, ECBU). Seulement si un résultat est énoncé.", ["value", "date", "details"]),
  s("urine", "hematurie_initiale", "Hématurie initiale", "Hématurie initiale", ["sang au début de la miction"], "Sang au début du jet uniquement.", ["duration", "details"]),
  s("urine", "hematurie_terminale", "Hématurie terminale", "Hématurie terminale", ["sang à la fin de la miction"], "Sang en fin de miction uniquement.", ["duration", "details"]),
  s("urine", "hematurie_totale", "Hématurie totale", "Hématurie totale", ["sang pendant toute la miction"], "Sang sur toute la durée de la miction.", ["duration", "details"]),
  s("urine", "caillots", "Présence de caillots", "Hématurie caillotante", ["caillots dans les urines", "morceaux de sang"], "Caillots de sang dans les urines.", ["duration", "details"]),
  s("urine", "urines_troubles", "Urines troubles", "Urines troubles", ["urines pas claires", "urines laiteuses"], "Urines d'aspect trouble.", ["duration", "details"]),
  s("urine", "urines_malodorantes", "Urines malodorantes", "Urines malodorantes", ["urines qui sentent fort", "mauvaise odeur des urines"], "Odeur anormale des urines.", ["duration", "details"]),
  s("urine", "urines_mousseuses", "Urines mousseuses", "Urines mousseuses", ["urines qui moussent", "mousse dans les urines"], "Mousse abondante et persistante dans les urines.", ["duration", "details"]),
  s("urine", "pneumaturie", "Pneumaturie", "Pneumaturie", ["air dans les urines", "bulles en urinant"], "Émission de gaz avec les urines.", ["duration", "details"]),
  s("urine", "fecalurie", "Fécalurie", "Fécalurie", ["selles dans les urines", "matières dans les urines"], "Présence de matières fécales dans les urines.", ["duration", "details"]),
  s("urine", "sediments", "Sédiments urinaires", "Sédiments urinaires", ["dépôt dans les urines", "sable dans les urines", "gravier"], "Dépôt ou particules visibles dans les urines.", ["duration", "details"]),

  // 6. Symptômes infectieux
  s("infection", "brulures_mictionnelles", "Brûlures mictionnelles", "Brûlures mictionnelles", ["ça brûle quand j'urine", "brûlures en urinant", "picotements en urinant"], "Sensation de brûlure pendant la miction.", BASIC, "Est-ce que ça brûle quand vous urinez ?"),
  s("infection", "dysurie_douloureuse", "Dysurie douloureuse", "Dysurie douloureuse", ["uriner fait mal"], "Miction douloureuse et difficile.", BASIC),
  s("infection", "fievre", "Fièvre", "Fièvre", ["température", "fébrile", "de la fièvre"], "Fièvre rapportée ou mesurée. Une valeur chiffrée ne se note que si elle a été mesurée.", ["value", "duration", "details"]),
  s("infection", "frissons", "Frissons", "Frissons", ["grelotter", "trembler de froid"], "Frissons.", ["duration", "details"]),
  s("infection", "malaise_general", "Malaise général", "Altération de l'état général", ["fatigué", "pas bien du tout", "patraque"], "Malaise ou fatigue générale.", ["duration", "details"]),
  s("infection", "nausees", "Nausées", "Nausées", ["envie de vomir", "mal au cœur"], "Nausées.", ["duration", "details"]),
  s("infection", "vomissements", "Vomissements", "Vomissements", ["a vomi", "vomir"], "Vomissements.", ["count", "duration", "details"]),
  s("infection", "ecoulement_uretral", "Écoulement urétral", "Écoulement urétral", ["écoulement par la verge", "pus par le canal", "goutte le matin"], "Écoulement par le méat urétral.", ["duration", "details"]),
  s("infection", "iu_recidivantes", "Infections urinaires récidivantes", "Infections urinaires récidivantes", ["infections urinaires à répétition", "cystites à répétition"], "Infections urinaires répétées.", HIST),

  // 7. Prostate
  s("prostate", "atcd_hbp", "Antécédent d'hypertrophie bénigne de la prostate", "Hypertrophie bénigne de la prostate (antécédent)", ["grosse prostate", "adénome de prostate", "HBP"], "Antécédent connu d'HBP rapporté.", HIST),
  s("prostate", "sbau", "Symptômes du bas appareil urinaire", "Symptômes du bas appareil urinaire (SBAU)", ["troubles urinaires de la prostate"], "Ensemble de symptômes mictionnels (remplissage, vidange, post-mictionnels).", ["duration", "severity", "details"]),
  s("prostate", "atcd_prostatite", "Antécédent de prostatite", "Prostatite (antécédent)", ["infection de la prostate"], "Antécédent de prostatite rapporté.", HIST),
  s("prostate", "atcd_cancer_prostate", "Antécédent de cancer de la prostate", "Cancer de la prostate (antécédent)", ["cancer de la prostate"], "Antécédent personnel de cancer prostatique rapporté.", HIST),
  s("prostate", "troubles_mictionnels", "Troubles mictionnels", "Troubles mictionnels", ["problèmes pour uriner"], "Troubles mictionnels non précisés.", BASIC),
  s("prostate", "psa_anterieur", "Résultat de PSA antérieur", "PSA (résultat antérieur)", ["dosage PSA", "PSA"], "Résultat de PSA explicitement énoncé. Ne jamais inventer de valeur.", ["value", "date", "details"]),
  s("prostate", "date_dernier_psa", "Date du dernier PSA", "Date du dernier dosage de PSA", ["dernier PSA"], "Date du dernier dosage de PSA, telle qu'énoncée.", ["date", "details"]),
  s("prostate", "atcd_familial_prostate", "Antécédents familiaux de pathologie prostatique", "Antécédents familiaux prostatiques", ["père avec un cancer de la prostate", "frère opéré de la prostate"], "Pathologie prostatique chez un apparenté.", ["details"]),

  // 8. Appareil génital masculin
  s("male_genital", "gonflement_scrotal", "Gonflement scrotal", "Augmentation de volume scrotal", ["bourse gonflée", "testicule gonflé"], "Augmentation de volume d'une bourse.", ["side", "onset", "duration", "severity", "details"]),
  s("male_genital", "masse_testiculaire", "Masse testiculaire", "Masse testiculaire", ["boule dans le testicule", "grosseur au testicule"], "Masse palpée ou perçue dans un testicule.", ["side", "duration", "details"]),
  s("male_genital", "lesions_genitales", "Lésions génitales", "Lésions génitales", ["bouton sur la verge", "plaie sur le sexe", "ulcération"], "Lésion cutanée ou muqueuse génitale.", ["location", "duration", "details"]),
  s("male_genital", "phimosis", "Phimosis", "Phimosis", ["prépuce trop serré", "ne peut pas décalotter"], "Étroitesse du prépuce empêchant de décalotter.", ["duration", "details"]),
  s("male_genital", "paraphimosis", "Paraphimosis", "Paraphimosis", ["prépuce coincé en arrière", "ne peut pas recalotter"], "Prépuce rétracté qui ne peut plus être ramené.", ["onset", "duration", "details"]),
  s("male_genital", "troubles_erection", "Troubles de l'érection", "Dysfonction érectile", ["problèmes d'érection", "pannes", "impuissance", "n'arrive plus à avoir d'érection"], "Difficulté à obtenir ou maintenir une érection.", ["duration", "frequency", "severity", "details"]),
  s("male_genital", "baisse_libido", "Baisse de libido", "Baisse de la libido", ["moins de désir", "plus envie"], "Diminution du désir sexuel.", ["duration", "details"]),
  s("male_genital", "troubles_ejaculation", "Troubles de l'éjaculation", "Troubles de l'éjaculation", ["éjaculation précoce", "éjaculation retardée", "pas d'éjaculation"], "Trouble de l'éjaculation (précoce, retardée, absente, rétrograde).", ["duration", "frequency", "details"]),
  s("male_genital", "hemospermie", "Hémospermie", "Hémospermie", ["sang dans le sperme", "sperme rouge ou marron"], "Présence de sang dans le sperme.", ["duration", "frequency", "details"]),
  s("male_genital", "troubles_fertilite", "Troubles de la fertilité", "Infertilité", ["pas d'enfant malgré les essais", "problème pour avoir un enfant"], "Difficulté à concevoir.", ["duration", "details"]),

  // 9. Particularités urologiques féminines
  s("female", "f_incontinence", "Incontinence urinaire (femme)", "Incontinence urinaire", ["fuites urinaires"], "Fuites urinaires chez la femme (préciser effort, urgenturie ou mixte si dit).", ["frequency", "severity", "aggravating", "duration", "details"]),
  s("female", "f_urgenturie", "Urgenturie (femme)", "Urgenturie", ["envie pressante"], "Besoin urgent d'uriner chez la femme.", BASIC),
  s("female", "f_dysurie", "Dysurie (femme)", "Dysurie", ["difficulté à uriner"], "Difficulté mictionnelle chez la femme.", BASIC),
  s("female", "f_iu_recidivantes", "Infections urinaires récidivantes (femme)", "Infections urinaires récidivantes", ["cystites à répétition"], "Infections urinaires répétées chez la femme.", HIST),
  s("female", "f_douleurs_pelviennes", "Douleurs pelviennes (femme)", "Douleurs pelviennes", ["mal au bas-ventre", "douleur du bassin"], "Douleurs pelviennes chez la femme.", PAIN),
  s("female", "prolapsus", "Sensation de prolapsus", "Sensation de prolapsus génito-urinaire", ["boule dans le vagin", "sensation de descente d'organe", "pesanteur pelvienne"], "Sensation de boule ou de pesanteur vaginale.", ["duration", "aggravating", "details"]),
  s("female", "atcd_obstetricaux", "Antécédents obstétricaux pertinents", "Antécédents obstétricaux", ["accouchements", "grossesses", "déchirure", "forceps"], "Grossesses, accouchements et complications rapportés.", ["count", "details"]),
  s("female", "atcd_gynecologiques", "Antécédents gynécologiques pertinents", "Antécédents gynécologiques", ["hystérectomie", "ménopause", "chirurgie gynécologique"], "Antécédents gynécologiques rapportés.", ["date", "details"]),

  // 10. Antécédents urologiques
  s("history", "atcd_calculs_renaux", "Calculs rénaux", "Lithiase rénale (antécédent)", ["calculs dans les reins", "pierres aux reins"], "Antécédent de calculs rénaux.", HIST),
  s("history", "atcd_calculs_ureteraux", "Calculs urétéraux", "Lithiase urétérale (antécédent)", ["calcul coincé dans l'uretère"], "Antécédent de calcul de l'uretère.", HIST),
  s("history", "atcd_colique_nephretique", "Antécédent de colique néphrétique", "Colique néphrétique (antécédent)", ["déjà eu des coliques néphrétiques", "déjà fait des crises de colique néphrétique"], "Épisodes antérieurs de colique néphrétique : nombre et dates tels qu'énoncés.", HIST),
  s("history", "atcd_iu_repetees", "Infections urinaires répétées (antécédent)", "Infections urinaires récidivantes (antécédent)", ["plusieurs infections urinaires"], "Antécédent d'infections urinaires répétées.", HIST),
  s("history", "insuffisance_renale", "Insuffisance rénale connue", "Insuffisance rénale chronique", ["reins qui fonctionnent mal", "insuffisance rénale"], "Insuffisance rénale connue rapportée.", ["date", "value", "details"]),
  s("history", "rein_unique", "Rein unique", "Rein unique", ["un seul rein", "rein enlevé"], "Rein unique (congénital ou après néphrectomie).", ["side", "details"]),
  s("history", "dialyse", "Dialyse", "Dialyse", ["est dialysé", "hémodialyse", "dialyse péritonéale"], "Traitement par dialyse.", ["date", "frequency", "details"]),
  s("history", "chirurgie_urologique", "Chirurgie urologique", "Chirurgie urologique (antécédent)", ["opéré de la prostate", "opéré de la vessie", "opéré du rein"], "Intervention urologique antérieure.", HIST),
  s("history", "sondage_urinaire", "Sondage urinaire", "Sondage vésical (antécédent ou en cours)", ["sonde urinaire", "a été sondé"], "Sondage urinaire antérieur ou en place.", HIST),
  s("history", "sonde_jj", "Sonde JJ", "Sonde double J", ["sonde double J", "JJ"], "Sonde urétérale double J (en place ou antérieure).", ["side", "date", "details"]),
  s("history", "nephrostomie", "Néphrostomie", "Néphrostomie", ["tuyau dans le rein", "drain du rein"], "Néphrostomie (en place ou antérieure).", ["side", "date", "details"]),
  s("history", "traumatisme_urologique", "Traumatisme urologique", "Traumatisme urologique", ["coup sur les bourses", "choc sur le rein", "chute à califourchon", "accident avec douleur au rein"], "Traumatisme touchant l'appareil urinaire ou génital (récent ou ancien).", ["date", "location", "side", "severity", "details"]),
  s("history", "atcd_cancer_urologique", "Antécédent de cancer urologique", "Cancer urologique (antécédent)", ["cancer de la vessie", "cancer du rein", "cancer du testicule"], "Antécédent personnel de cancer urologique.", HIST),
  s("history", "atcd_familiaux_uro", "Antécédents familiaux urologiques", "Antécédents familiaux urologiques", ["dans la famille", "mon père a eu", "ma mère a eu"], "Pathologies urologiques chez des apparentés.", ["details"]),
];

export type CustomTerm = {
  /** Code du symptôme ajouté (custom_…) ou d'un symptôme existant auquel on ajoute des synonymes. */
  code: string;
  name: string;
  category: CategoryKey;
  synonyms: string[];
  description: string;
};

/** Base complète : symptômes intégrés + termes et synonymes ajoutés par le médecin. */
export function buildTaxonomy(custom: CustomTerm[] = []): SymptomDef[] {
  const byId = new Map(SYMPTOMS.map((x) => [x.id, { ...x, synonyms: [...x.synonyms] }]));
  for (const t of custom) {
    const existing = byId.get(t.code);
    if (existing) {
      existing.synonyms = [...new Set([...existing.synonyms, ...t.synonyms])];
      continue;
    }
    byId.set(t.code, {
      id: t.code,
      name: t.name,
      term: t.name,
      synonyms: t.synonyms,
      category: t.category,
      description: t.description,
      attributes: ["duration", "frequency", "severity", "location", "side", "details"],
      custom: true,
    });
  }
  return [...byId.values()];
}

export const SYMPTOM_BY_ID = new Map(SYMPTOMS.map((x) => [x.id, x]));

/** Recherche par nom, terme ou synonyme (sans accents ni casse). */
export function searchSymptoms(query: string, taxonomy: SymptomDef[] = SYMPTOMS): SymptomDef[] {
  const n = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const q = n(query.trim());
  if (!q) return [];
  return taxonomy.filter((x) => [x.name, x.term, ...x.synonyms].some((v) => n(v).includes(q))).slice(0, 20);
}

/** Code d'un terme ajouté par le médecin, à partir de son nom. */
export function customCode(name: string) {
  return (
    "custom_" +
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40)
  );
}
