# AurisMED

Assistant de documentation médicale vocale. Le médecin mène la téléconsultation, AurisMED enregistre,
transcrit, extrait les informations médicales et pré-remplit la **fiche d'observation médicale**
(structure de la fiche de référence en 9 pages) ainsi que l'**ordonnance**. Le médecin vérifie,
corrige et valide ; l'application génère ensuite les PDF.

> AurisMED n'est pas un logiciel de gestion de clinique. Pas de facturation, de rendez-vous,
> de pharmacie, de laboratoire ni de dossier patient complet.

## État d'avancement

| Phase | Contenu | État |
| --- | --- | --- |
| 1 | Fondation : Next.js, Tailwind, shadcn/ui, Supabase, schéma, connexion, tableau de bord | ✅ |
| 2 | Consultation : patient, navire, brouillons, historique, paramètres | ✅ |
| 3 | Enregistrement vocal et transcription | ✅ |
| 4 | Extraction IA (JSON structuré, confiance, sources) et revue par le médecin | ✅ |
| 5 | Fiche d'observation complète (décision, schéma des lésions, suivi, diagramme de soins) et ordonnance | ✅ |
| 6 | PDF (fiche d'observation, ordonnance), page Documents | ✅ |
| 7 | Tests et finalisation | à venir |

## Pile technique

- **Next.js 16** (App Router, Turbopack), **React 19**, **TypeScript**
- **Tailwind CSS 4**, composants **shadcn/ui** (style new-york, Radix UI), icônes **Lucide**
- **Supabase** : PostgreSQL, Auth, Row Level Security, Storage privé
- **Zod** pour la validation des entrées
- API OpenAI (transcription et extraction), **@react-pdf/renderer** (PDF générés côté serveur)

## Architecture

```
src/
  app/
    (auth)/              connexion, mot de passe oublié, nouveau mot de passe
    (app)/               pages protégées (sidebar) : tableau-de-bord, consultations,
                         consultations/nouvelle, documents, parametres
    auth/actions.ts      Server Actions d'authentification
    auth/confirm/        retour des liens e-mail (réinitialisation)
    configuration/       écran affiché tant que Supabase n'est pas configuré
  components/
    ui/                  composants shadcn/ui
    layout/              sidebar, en-têtes de page
  lib/
    supabase/            clients serveur, navigateur et rafraîchissement de session (proxy)
    auth.ts              couche d'accès : utilisateur courant vérifié côté serveur
    data/                lectures en base (côté serveur uniquement)
    validation/          schémas Zod
    env.ts               lecture des variables d'environnement
  proxy.ts               protection des routes (ex-« middleware » dans Next.js 16)
  types/database.ts      types de la base
supabase/
  migrations/            schéma SQL, RLS, buckets privés
  tests/                 tests d'isolation RLS sur PostgreSQL local
```

Transcription : `src/server/transcription/` (interface `TranscriptionProvider`, implémentation
OpenAI, mise en paragraphes), routes `src/app/api/recordings/[id]/transcribe` et
`src/app/api/consultations/[id]/transcription`, interface dans
`src/components/consultation/recording/`.

Extraction : `src/lib/medical/` (catalogue des champs de la fiche, état et validation),
`src/server/ai/` (schéma JSON, instructions, appel OpenAI, contrôles et fusion), route
`src/app/api/consultations/[id]/extraction`, interface dans `src/components/consultation/observation/`.

PDF : `src/server/pdf/` (mise en forme testée dans `model.ts`, gabarits React PDF, génération et
stockage dans `generate.ts`), routes `src/app/api/consultations/[id]/documents` (génération) et
`src/app/api/documents/[id]` (ouverture / téléchargement), page `src/app/(app)/documents`.

## Enregistrement et transcription

1. **Consentement** : avant le premier enregistrement, le médecin confirme l'accord du patient et
   prend connaissance de l'envoi de l'audio et du texte au fournisseur (OpenAI). Les deux
   horodatages sont stockés sur la consultation.
2. **Enregistrement** (MediaRecorder) : pause, reprise, arrêt, durée, niveau audio, état du micro.
   Toutes les 10 minutes, le segment en cours est clos et envoyé dans le bucket privé
   `recordings`, puis un nouveau segment démarre. Un segment dont l'envoi échoue reste dans la
   page avec un bouton Réessayer. Import de fichiers audio possible (24 Mo maximum par fichier).
3. **Transcription** : chaque segment est envoyé séparément (langue `fr`, vocabulaire médical en
   indication, fin du segment précédent pour la continuité), puis les textes sont assemblés et
   mis en paragraphes sans modifier les mots. Une erreur s'affiche sur le segment concerné et la
   transcription reprend là où elle s'est arrêtée.
4. **Correction et confirmation** : la correction est enregistrée automatiquement. La
   confirmation démarre le délai de conservation de l'audio (Paramètres, 30 jours par défaut,
   0 = suppression immédiate). Les fichiers expirés sont supprimés à l'ouverture du tableau de
   bord ou d'une consultation.

Pour changer de fournisseur : implémenter `TranscriptionProvider` et l'ajouter dans
`src/server/transcription/index.ts` (variable `TRANSCRIPTION_PROVIDER`).

## Extraction IA et revue de la fiche

1. **Catalogue unique** (`src/lib/medical/catalog.ts`) : chaque champ de la fiche de référence
   (type, options, unités, limites plausibles) sert à la fois au formulaire, aux instructions de
   l'IA, au schéma JSON strict et à la validation serveur. Les champs de décision et d'envoi au
   CCMM ne sont jamais proposés à l'IA.
2. **Analyse** : la transcription confirmée (texte corrigé) est envoyée au modèle
   `OPENAI_EXTRACTION_MODEL` (température 0, `json_schema` strict). Chaque proposition doit
   citer l'extrait exact de la transcription, le locuteur, la nature (rapportée, observée,
   mesurée) et une confiance. L'IA ne doit ni inventer, ni poser de diagnostic, ni déduire une
   posologie.
3. **Contrôles serveur** (`src/server/ai/process.ts`) : réponse validée par Zod, valeurs
   converties dans le type du champ (sinon écartées et listées), citation recherchée dans la
   transcription (sinon confiance faible), constante non mesurée, confiance non élevée ou
   contradiction → « À vérifier ». Les champs non mentionnés restent vides.
4. **Fusion** : une nouvelle analyse ne remplace que les propositions non revues. Ce que le
   médecin a saisi, corrigé, rejeté ou confirmé est conservé.
5. **Revue** : pour chaque champ, accepter, corriger, rejeter (avec possibilité de rétablir) et
   voir la source surlignée dans la transcription. Acceptation groupée possible, uniquement pour
   les propositions à confiance élevée dont la citation a été retrouvée, sur action explicite.
   Les médicaments cités sont proposés un par un, sans dosage déduit. La fiche est enregistrée
   automatiquement ; la validation est refusée (côté serveur aussi) tant qu'une proposition n'a
   pas été revue, et toute modification ultérieure la repasse en vérification.

Évaluation avec le vrai fournisseur sur 8 scénarios fictifs (`src/server/ai/scenarios.ts`) :
`OPENAI_API_KEY=… npm run eval:extraction` (les transcriptions envoyées sont synthétiques).

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
- **Accès** : fichiers dans le bucket privé `documents` (`<user_id>/<consultation_id>/`). Ouvrir ou
  télécharger passe par `/api/documents/[id]`, qui vérifie l'accès (RLS) puis redirige vers une URL
  signée valable 60 secondes. Génération et téléchargement sont journalisés.
- Les heures affichées utilisent `NEXT_PUBLIC_APP_TIME_ZONE` (Europe/Paris par défaut) ; le PDF
  utilise le fuseau du navigateur du médecin.

## Installation

Prérequis : Node.js 20.9 ou plus récent, un projet Supabase (l'offre gratuite suffit).

```bash
npm install
cp .env.example .env.local     # puis renseignez les valeurs
```

### 1. Créer la base de données

Option A, éditeur SQL de Supabase : exécutez dans l'ordre chaque fichier de
`supabase/migrations/` (`20261125000000_initial_schema.sql`, `20261125010000_consultation_call_information.sql`,
`20261125020000_recording_transcripts.sql`, `20261125030000_document_versions.sql`).

Option B, CLI Supabase :

```bash
npx supabase login
npx supabase link --project-ref <votre-ref>
npx supabase db push
```

La migration crée les tables, les index, les politiques RLS, le journal d'audit et deux buckets
privés (`recordings`, `documents`).

### 2. Configurer l'authentification

Dans Supabase > Authentication :

1. **Sign In / Providers** : désactivez « Allow new users to sign up » (comptes créés uniquement
   par l'administrateur).
2. **Users > Add user** : créez le compte du médecin (e-mail et mot de passe, « Auto Confirm User »).
3. **URL Configuration** : `Site URL` = votre `NEXT_PUBLIC_SITE_URL`, et ajoutez
   `http://localhost:3000/auth/confirm` (et l'URL de production) aux « Redirect URLs ».
4. **Emails > Reset Password** (recommandé) : remplacez le lien par
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reinitialiser-mot-de-passe`.

Le nom du médecin, son n° RPPS, l'établissement et la durée de conservation de l'audio se règlent
ensuite dans **Paramètres**.

### 3. Lancer l'application

```bash
npm run dev          # http://localhost:3000
npm run build && npm start   # production locale
```

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement |
| `npm run build` | build de production |
| `npm run lint` | ESLint |
| `npm run typecheck` | génération des types de routes + TypeScript |
| `npm test` | tests unitaires (Vitest) : validation, calcul de l'âge, conversion formulaire / base, mise en paragraphes, contrôles et fusion de l'extraction, règles de l'ordonnance, mise en forme et rendu des PDF (contenu vérifié avec `pdftotext` s'il est installé) |
| `npm run eval:extraction` | évaluation de l'extraction sur des scénarios fictifs avec le fournisseur réel (clé requise, appels facturés) |
| `npm run test:db` | applique la migration sur un PostgreSQL local jetable et vérifie l'isolation RLS (nécessite `initdb`, `pg_ctl` et `psql`) |

## Services externes et identifiants

| Service | Variables | Nécessaire pour |
| --- | --- | --- |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | toute l'application |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_TRANSCRIPTION_MODEL`, `OPENAI_EXTRACTION_MODEL` | transcription (phase 3), extraction (phase 4) |

Les clés OpenAI ne sont lues que côté serveur. La clé publique Supabase est conçue pour être
exposée : l'accès aux données est contrôlé par la RLS.

## Sécurité et données de santé

- Routes protégées par le proxy, puis vérification de l'utilisateur côté serveur à chaque page.
- RLS sur toutes les tables : chaque médecin n'accède qu'à ses propres lignes ; les tables liées
  vérifient en plus que la consultation lui appartient. Aucun accès anonyme.
- Fichiers audio et PDF dans des buckets **privés**, rangés par utilisateur, sans URL publique
  (accès par URL signée de courte durée).
- Journal d'audit en ajout seul : connexion, déconnexion, changement de mot de passe, analyse IA,
  validations, génération et téléchargement des documents (métadonnées uniquement).
- En-têtes de sécurité (`X-Frame-Options`, `nosniff`, `Permissions-Policy` limitant le micro au
  site), pages authentifiées en `Cache-Control: private, no-store`, pas d'indexation.
- Consentement explicite à l'enregistrement, information sur la transmission de l'audio et de la
  transcription au fournisseur d'IA, rétention configurable de l'audio.

**Utilisez uniquement des données synthétiques en développement et en test.** Cette application
n'a fait l'objet d'aucune évaluation réglementaire (RGPD, hébergement de données de santé,
dispositif médical) ; un tel audit est nécessaire avant tout usage avec de vrais patients.
