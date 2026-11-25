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
| 3 | Enregistrement vocal et transcription | à venir |
| 4 | Extraction IA (JSON structuré, confiance, sources) | à venir |
| 5 | Fiche d'observation complète (BFV, bilans, décision, suivi, diagramme de soins) | à venir |
| 6 | PDF (fiche d'observation, ordonnance) | à venir |
| 7 | Tests et finalisation | à venir |

## Pile technique

- **Next.js 16** (App Router, Turbopack), **React 19**, **TypeScript**
- **Tailwind CSS 4**, composants **shadcn/ui** (style new-york, Radix UI), icônes **Lucide**
- **Supabase** : PostgreSQL, Auth, Row Level Security, Storage privé
- **Zod** pour la validation des entrées
- À venir : API OpenAI (transcription et extraction), **@react-pdf/renderer** (PDF)

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

Prévu dans les phases suivantes : `src/server/transcription/` (fournisseur de transcription
remplaçable), `src/server/ai/` (extraction médicale), `src/server/pdf/` (documents),
`src/lib/medical/` (schéma de la fiche d'observation).

## Installation

Prérequis : Node.js 20.9 ou plus récent, un projet Supabase (l'offre gratuite suffit).

```bash
npm install
cp .env.example .env.local     # puis renseignez les valeurs
```

### 1. Créer la base de données

Option A, éditeur SQL de Supabase : exécutez dans l'ordre chaque fichier de
`supabase/migrations/` (`20261125000000_initial_schema.sql`, puis `20261125010000_consultation_call_information.sql`).

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
| `npm test` | tests unitaires (Vitest) : validation, calcul de l'âge, conversion formulaire / base |
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
  (accès par URL signée de courte durée dans les phases suivantes).
- Journal d'audit en ajout seul (connexion, déconnexion, changement de mot de passe ; les actions
  sur les documents s'y ajouteront).
- En-têtes de sécurité (`X-Frame-Options`, `nosniff`, `Permissions-Policy` limitant le micro au
  site), pages authentifiées en `Cache-Control: private, no-store`, pas d'indexation.
- Prévu : consentement explicite à l'enregistrement, information sur la transmission de l'audio
  et de la transcription au fournisseur d'IA, rétention configurable de l'audio.

**Utilisez uniquement des données synthétiques en développement et en test.** Cette application
n'a fait l'objet d'aucune évaluation réglementaire (RGPD, hébergement de données de santé,
dispositif médical) ; un tel audit est nécessaire avant tout usage avec de vrais patients.
