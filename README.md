# AurisMED

Assistant de documentation médicale vocale. Le médecin mène la téléconsultation, AurisMED enregistre,
transcrit, extrait les informations médicales et pré-remplit la **fiche d'observation médicale**
(structure de la fiche de référence en 9 pages) ainsi que l'**ordonnance**. Le médecin vérifie,
corrige et valide ; l'application génère ensuite les PDF.

**Version locale** : tout fonctionne sur un seul poste Windows, sans service en ligne. La
transcription (whisper.cpp), l'analyse (Ollama), la base (SQLite) et les fichiers (chiffrés) restent
sur l'ordinateur du médecin. Aucune clé d'API n'est nécessaire et il n'existe aucun repli vers un
service en ligne : si un moteur local est arrêté, l'application le dit et n'envoie rien ailleurs.

> AurisMED n'est pas un logiciel de gestion de clinique. Pas de facturation, de rendez-vous,
> de pharmacie, de laboratoire ni de dossier patient complet.

## État d'avancement

Version initiale (phases 1 à 6, terminées) : fondation, consultation, enregistrement et
transcription, extraction IA et revue, fiche complète et ordonnance, PDF.

Passage au tout-local et spécialisation urologie :

| Phase | Contenu | État |
| --- | --- | --- |
| 1 | Architecture locale : base SQLite, comptes locaux, fichiers chiffrés, `LocalMedicalAIService` (whisper.cpp, Ollama), lanceur des moteurs, page « Moteur IA local », scripts Windows | ✅ |
| 2 | Transcription progressive (VAD, segments chevauchants, texte stable et provisoire, locuteurs) | fait |
| 3 | Extraction incrémentale, réconciliation, statuts de champ, lien valeur / segment | fait |
| 4 | Spécialisation urologie (taxonomie des symptômes, fiche, alertes, espace à trois panneaux) | à venir |
| 5 | Documents urologie, sauvegardes, conservation et effacement | à venir |
| 6 | Parcours complet sur 14 cas urologiques synthétiques, hors ligne | à venir |

## Pile technique

- **Next.js 16** (App Router, Turbopack), **React 19**, **TypeScript**
- **Tailwind CSS 4**, composants **shadcn/ui** (style new-york, Radix UI), icônes **Lucide**
- **SQLite** intégré à Node.js (`node:sqlite`, Node 22.13 ou plus récent) : aucune dépendance native
- Fichiers chiffrés en **AES-256-GCM** (module `crypto` de Node.js)
- **whisper.cpp** (`whisper-server`) pour la transcription, **Ollama** pour l'analyse, tous deux en local
- **Zod** pour la validation des entrées, **@react-pdf/renderer** (PDF générés côté serveur)

## Architecture

```
src/
  app/
    (auth)/              connexion, premier compte, mot de passe oublié, changement de mot de passe
    (app)/               pages protégées (sidebar) : tableau-de-bord, consultations,
                         consultations/nouvelle, documents, parametres (dont « Moteur IA local »)
    api/moteur-ia/       état, démarrage, choix des modèles, tests des moteurs locaux
    api/fichiers/        liens signés et temporaires vers les fichiers chiffrés
    auth/actions.ts      Server Actions d'authentification (comptes locaux)
  components/            ui (shadcn/ui), layout, consultation
  lib/                   auth.ts (utilisateur courant), data/ (lectures), validation/ (Zod), recording/ (WAV)
  server/
    db/                  SQLite : schéma et migrations, requêtes limitées au propriétaire, stockage chiffré
    auth/                mots de passe (scrypt), comptes, sessions
    local-ai/            LocalMedicalAIService, clients whisper.cpp et Ollama, lanceur des moteurs, état du poste
    ai/                  schéma JSON, instructions, extraction locale, contrôles et fusion
    transcription/       interface TranscriptionProvider, mise en paragraphes
    pdf/                 gabarits et génération des PDF
  instrumentation.ts     démarrage automatique des moteurs locaux avec le serveur
  proxy.ts               protection des routes
  types/database.ts      types des tables
scripts/                 réinitialisation de mot de passe, sauvegarde (Node, sans dépendance)
windows/                 installation, démarrage, sauvegarde, réinitialisation (double-clic)
```

### Données locales

Tout est rangé dans `data/` (ou `AURISMED_DATA_DIR`) :

- `aurismed.db` : base SQLite (mode WAL, clés étrangères, `secure_delete`). Les migrations de
  `src/server/db/schema.ts` s'appliquent au démarrage.
- `fichiers/` : audio et PDF chiffrés (`<compartiment>/<user_id>/<consultation_id>/<fichier>.enc`).
- `cle/aurismed.key` : clé de chiffrement, créée au premier lancement. **À sauvegarder à part** :
  sans elle, les fichiers sont illisibles.

La sécurité au niveau des lignes de l'ancienne base est reprise par `src/server/db/query.ts` :
chaque requête est liée à l'utilisateur de la session et ne voit, ne crée, ne modifie et ne
supprime que ses lignes ; les tables liées à une consultation vérifient qu'elle lui appartient ;
le journal d'audit est en ajout seul (déclencheurs SQLite).

### Moteur IA local

`LocalMedicalAIService` (`src/server/local-ai/service.ts`) est le seul point d'entrée de l'IA :

- **Transcription** : `whisper-server` (whisper.cpp) sur `127.0.0.1:8178`, en français. L'audio
  est converti dans le navigateur en WAV 16 kHz mono (aucun ffmpeg à installer).
- **Analyse** : Ollama sur `127.0.0.1:11434`, sortie JSON contrainte par le schéma de la fiche,
  température 0, validée puis contrôlée comme avant (citations, limites, champs du médecin protégés).
- **Lanceur** : au démarrage du serveur, whisper-server est lancé avec le modèle choisi et Ollama
  s'il ne tourne pas déjà. La page Paramètres > Moteur IA local affiche l'état, les modèles, la
  mémoire, la carte graphique et l'espace disque, et permet de démarrer, redémarrer, choisir les
  modèles et tester le micro, la transcription et l'analyse.
- Les adresses des moteurs ne peuvent désigner que ce poste (`127.0.0.1`, `localhost`) : toute
  autre adresse est refusée.

## Enregistrement et transcription

1. **Consentement** : avant le premier enregistrement, le médecin confirme l'accord du patient et
   prend connaissance de l'analyse de l'audio et du texte par l'IA locale du poste. Les deux
   horodatages sont stockés sur la consultation.
2. **Enregistrement avec transcription en direct** : le micro est capté en PCM (AudioWorklet),
   ramené à 16 kHz mono. Pause, reprise, arrêt, durée, niveau audio, état du micro.
   - **Stockage** : toutes les 10 minutes, l'audio accumulé est écrit en WAV, chiffré et stocké ;
     un segment dont l'envoi échoue reste dans la page avec un bouton Réessayer.
   - **Découpage de la parole** (`src/lib/recording/vad.ts`) : détection d'activité vocale par
     énergie avec plancher de bruit adaptatif, trames de 30 ms. Un morceau s'ouvre à la parole
     (avec 0,4 s d'avance) et se ferme après 0,7 s de silence ; au-delà de 20 s il est coupé et le
     suivant reprend la dernière seconde (chevauchement, mots en double retirés). Les bruits
     brefs (< 0,3 s de parole) sont ignorés.
   - **Texte provisoire et texte stable** : pendant une phrase, une version provisoire est
     transcrite toutes les 2,5 s (affichée en italique gris, jamais enregistrée) ; à la fin de
     la phrase, la version stable est transcrite et enregistrée (table `transcription_segments`).
     Un seul envoi à la fois, les versions stables en priorité. Si le moteur s'arrête, la file
     s'interrompt avec un bouton Réessayer ; l'audio continue d'être enregistré.
   - **Interlocuteur** : chaque morceau est « Médecin », « Patient » ou « Non identifié »
     (par défaut). Le médecin le corrige d'un clic ; le bouton « Proposer Médecin / Patient (IA
     locale) » demande au modèle Ollama une attribution (marquée « IA »), qui ne touche ni au
     texte ni aux choix du médecin.
   - **Fin** : à l'arrêt, dès que tous les morceaux et segments sont stockés, la transcription
     est assemblée (« Médecin : … », « Patient : … ») et les segments audio reçoivent leur texte.
     Une transcription déjà corrigée ou confirmée par le médecin n'est jamais écrasée.
   - Import de fichiers audio possible (200 Mo maximum, découpés en segments de 10 minutes).
3. **Transcription depuis l'audio enregistré** (import, ou repli si la transcription en direct
   n'a pas pu se faire) : chaque segment est envoyé séparément (langue `fr`, vocabulaire médical
   en indication, fin du segment précédent pour la continuité), puis les textes sont assemblés
   et mis en paragraphes sans modifier les mots. Une erreur s'affiche sur le segment concerné et
   la transcription reprend là où elle s'est arrêtée.
4. **Correction et confirmation** : la correction est enregistrée automatiquement. La
   confirmation démarre le délai de conservation de l'audio (Paramètres, 30 jours par défaut,
   0 = suppression immédiate). Les fichiers expirés sont supprimés à l'ouverture du tableau de
   bord ou d'une consultation.

Le seul fournisseur est whisper.cpp local (`src/server/local-ai/whisper.ts`) ; aucun service en
ligne ne doit être ajouté.

## Extraction IA et revue de la fiche

1. **Catalogue unique** (`src/lib/medical/catalog.ts`) : chaque champ de la fiche de référence
   (type, options, unités, limites plausibles) sert à la fois au formulaire, aux instructions de
   l'IA, au schéma JSON strict et à la validation serveur. Les champs de décision et d'envoi au
   CCMM ne sont jamais proposés à l'IA.
2. **Analyse** : la transcription confirmée (texte corrigé) est analysée par le modèle Ollama
   choisi (température 0, sortie contrainte par le schéma JSON). Chaque proposition doit
   citer l'extrait exact de la transcription, le locuteur, la nature (rapportée, observée,
   mesurée) et une confiance. L'IA ne doit ni inventer, ni poser de diagnostic, ni déduire une
   posologie.
3. **Contrôles serveur** (`src/server/ai/process.ts`) : réponse validée par Zod, valeurs
   converties dans le type du champ (sinon écartées et listées), citation recherchée dans la
   transcription (sinon confiance faible), constante non mesurée, confiance non élevée ou
   contradiction → « À vérifier ». Les champs non mentionnés restent vides.
4. **Fusion** : une nouvelle analyse ne remplace jamais en silence. Ce que le médecin a saisi,
   corrigé, rejeté ou confirmé est conservé ; une valeur différente est signalée comme
   contradiction. Une proposition antérieure non retrouvée est gardée « À vérifier ».
4 bis. **Analyse au fil de la consultation** (`src/server/ai/incremental.ts`,
   `src/lib/medical/reconcile.ts`, route `/api/consultations/[id]/extraction/direct`) : pendant
   l'enregistrement, les nouvelles répliques stables (par 2, ou une seule après 20 s) sont
   analysées avec les 4 répliques précédentes en contexte et la liste des valeurs déjà dans la
   fiche. Le modèle indique pour chaque information le numéro de la réplique citée ; le serveur
   vérifie la citation dans les répliques et renvoie des propositions, sans écrire la fiche. Le
   navigateur les fusionne :
   - champ vide → rempli (« Information extraite » ou « À vérifier »), avec la réplique
     d'origine (position dans l'enregistrement, interlocuteur) ;
   - champ déjà rempli → jamais modifié : la nouvelle valeur apparaît comme **information
     contradictoire**, que le médecin tranche (« Utiliser cette valeur » / « Garder ») ; une
     contradiction non tranchée bloque la validation ;
   - champ réservé au médecin ou proposition déjà rejetée → ignoré.
   À l'arrêt, une **relecture de toute la consultation** (réconciliation) complète les oublis
   et met à jour la liste des informations manquantes, avec les mêmes règles.
   Statuts affichés : Information extraite, À vérifier, Information manquante, Modifié par le
   médecin, Validé par le médecin.
5. **Revue** : pour chaque champ, accepter, corriger, rejeter (avec possibilité de rétablir) et
   voir la source surlignée dans la transcription. Acceptation groupée possible, uniquement pour
   les propositions à confiance élevée dont la citation a été retrouvée, sur action explicite.
   Les médicaments cités sont proposés un par un, sans dosage déduit. La fiche est enregistrée
   automatiquement ; la validation est refusée (côté serveur aussi) tant qu'une proposition n'a
   pas été revue, et toute modification ultérieure la repasse en vérification.

Évaluation du modèle local sur 8 scénarios fictifs (`src/server/ai/scenarios.ts`) :
`npm run eval:extraction` (Ollama démarré, `OLLAMA_MODEL` défini ou modèle choisi dans Paramètres).

## Décision, suivi et ordonnance

- **Décision** (page 6) : date et heure, soins à bord / débarquement / déroutement / EVASAN /
  EVAMED, rappel, accueil à quai, agent local, port, pays, CROSS, SAMU, heure d'évacuation. Ces
  champs, comme « Envoi au CCMM », ne sont jamais transmis à l'IA (`ai: false` dans le catalogue)
  et une nouvelle analyse ne les modifie pas.
- **Schéma des lésions** (page 3) : un clic sur la silhouette (face ou dos) pose une annotation
  typée (douleur, plaie, hématome, fracture, brûlure, autre) avec une précision.
- **Fiche de suivi** (pages 7 et 8) : appels n° 2 et suivants, constantes bornées (une valeur hors
  limites n'est pas enregistrée), décision et prochain rendez-vous.
- **Diagramme de soins** (page 9) : une colonne par relevé horodaté ; lignes des médicaments de
  l'ordonnance, 8 paramètres de surveillance et 8 soins / examens.
- **Ordonnance** (table `prescriptions`) : rédigée par le médecin. Les médicaments acceptés dans
  la fiche peuvent être repris sur action explicite, sans dosage ajouté. La validation exige, pour
  chaque ligne, nom, dosage, posologie et durée, ou la mention « Aucun médicament prescrit ».
  L'allergie renseignée dans la fiche est rappelée en tête.
- **Statut de la consultation** : « Validée » quand la fiche et l'ordonnance sont validées ;
  toute modification ultérieure la repasse « En cours » (`src/lib/data/consultation-status.ts`).

## Documents PDF

- **Uniquement des données validées** : la fiche d'observation n'est générée qu'une fois validée
  par le médecin, l'ordonnance qu'une fois validée et avec au moins un médicament. Les champs vides
  ne sont pas imprimés ; aucune valeur n'est ajoutée.
- **Fiche d'observation** : identification (appel, patient, navire), sections de la fiche de
  référence, schéma des lésions annoté, prescriptions, décision, fiche de suivi, et le diagramme
  de soins sur une page en paysage. Pied de page : médecin, date de validation, version, pagination.
- **Ordonnance** : médecin et établissement (Paramètres), patient, âge, date, allergie signalée,
  lignes (nom, dosage, posologie, durée, motif), consignes, zone de signature.
- **Versions** : chaque génération crée une nouvelle version (unicité garantie en base) ; les
  anciennes restent consultables. Un avertissement apparaît si la fiche ou l'ordonnance a été
  validée à nouveau depuis le dernier PDF.
- **Accès** : PDF chiffrés sur le disque (`documents/<user_id>/<consultation_id>/`). Ouvrir ou
  télécharger passe par `/api/documents/[id]`, qui vérifie l'accès puis redirige vers un lien
  signé valable 60 secondes, lui-même refusé sans la session du propriétaire. Génération et
  téléchargement sont journalisés.
- Les heures affichées utilisent `NEXT_PUBLIC_APP_TIME_ZONE` (Europe/Paris par défaut) ; le PDF
  utilise le fuseau du navigateur du médecin.

## Installation sur Windows

Prérequis : Windows 10 ou 11, 10 Go libres au minimum, Node.js 22.13 ou plus récent (proposé par
l'installation via winget s'il manque).

1. Double-cliquez sur **`windows\Installer-AurisMED.cmd`**. Le script :
   - vérifie Node.js, la mémoire, la carte graphique et l'espace disque ;
   - installe les dépendances et construit l'application (télémétrie Next.js désactivée) ;
   - télécharge whisper.cpp (version processeur, ou CUDA si une carte NVIDIA est détectée) ;
   - vous **demande** quel modèle de transcription et quel modèle d'analyse télécharger, en
     recommandant celui qui convient à votre poste (rien n'est choisi à votre place, et le plus gros
     modèle n'est jamais pris d'office) ;
   - installe Ollama s'il manque (winget) et télécharge le modèle d'analyse choisi ;
   - propose un raccourci « AurisMED » sur le Bureau.
2. Double-cliquez sur **`windows\Demarrer-AurisMED.cmd`** (ou le raccourci). Le navigateur s'ouvre
   sur `http://127.0.0.1:3000` ; au premier lancement, créez le compte du médecin.
3. Après le premier lancement, copiez `data\cle\aurismed.key` sur un support séparé.

Seuls les programmes et les modèles d'IA sont téléchargés pendant l'installation ; aucune donnée
de patient ne quitte le poste. Le serveur n'écoute que sur `127.0.0.1` : il n'est pas joignable
depuis le réseau.

| Outil (dossier `windows`) | Rôle |
| --- | --- |
| `Installer-AurisMED.cmd` | installation ou mise à jour des moteurs et modèles |
| `Demarrer-AurisMED.cmd` | démarrage de l'application et des moteurs |
| `Sauvegarder-AurisMED.cmd [dossier]` | copie de la base et des fichiers chiffrés (la clé n'est pas incluse) |
| `Reinitialiser-mot-de-passe.cmd` | nouveau mot de passe pour un compte (ferme ses sessions) |

### Développement

```bash
npm install
npm run dev          # http://127.0.0.1:3000
```

Les variables facultatives (dossiers, adresses et modèles des moteurs) sont décrites dans
`.env.example`.

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement |
| `npm run build` / `npm start` | build et serveur de production (127.0.0.1:3000) |
| `npm run lint` | ESLint |
| `npm run typecheck` | génération des types de routes + TypeScript |
| `npm test` | tests unitaires (Vitest) : base locale (isolation entre comptes, journal en ajout seul, contraintes), comptes et sessions, chiffrement des fichiers, conversion WAV, validation, extraction, ordonnance, PDF |
| `npm run eval:extraction` | évaluation de l'extraction sur des scénarios fictifs avec le modèle local |
| `npm run compte:reinitialiser` | réinitialisation d'un mot de passe |
| `npm run sauvegarder` | sauvegarde de la base et des fichiers |

## Sécurité et données de santé

- **Aucun envoi en ligne** : transcription, analyse, base et fichiers restent sur le poste. Pas de
  clé d'API, pas de repli vers un service externe, télémétrie Next.js désactivée.
- **Comptes locaux** : mots de passe hachés (scrypt), sessions par jeton aléatoire (seule son
  empreinte est en base, cookie `httpOnly`), expiration après 12 h d'inactivité, 5 essais puis
  blocage de 5 minutes, sessions fermées au changement de mot de passe.
- **Isolation** : chaque médecin n'accède qu'à ses lignes et à ses fichiers (vérifié par des tests).
- **Chiffrement** : audio et PDF chiffrés en AES-256-GCM ; liens de lecture signés, valables
  60 secondes et liés à la session du propriétaire. La base SQLite elle-même n'est pas chiffrée :
  activez **BitLocker** sur le disque du poste.
- **Effacement** : les fichiers supprimés sont écrasés avant suppression et la base efface les
  pages libérées (`secure_delete`). Sur un SSD, l'écrasement n'est pas garanti au niveau physique :
  BitLocker reste la protection de référence.
- Journal d'audit en ajout seul : connexion, déconnexion, mots de passe, actions sur les moteurs,
  analyse IA, validations, génération et téléchargement des documents (métadonnées uniquement).
- En-têtes de sécurité (`X-Frame-Options`, `nosniff`, `Permissions-Policy` limitant le micro au
  site), pages authentifiées en `Cache-Control: private, no-store`.
- Consentement explicite à l'enregistrement, information sur l'analyse par l'IA locale, rétention
  configurable de l'audio.

**Utilisez uniquement des données synthétiques en développement et en test.** Cette application
n'a fait l'objet d'aucune évaluation réglementaire (RGPD, hébergement de données de santé,
dispositif médical) ; un tel audit est nécessaire avant tout usage avec de vrais patients.
