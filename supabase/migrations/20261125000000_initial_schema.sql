-- =============================================================================
-- AurisMED — schéma initial
-- Documentation médicale vocale : consultations, enregistrements, transcriptions,
-- fiches d'observation, ordonnances, documents générés, journal d'audit.
--
-- Principes :
--   * chaque ligne porte user_id (propriétaire) ; la RLS limite l'accès à auth.uid().
--   * les tables enfants vérifient que la consultation parente appartient à l'utilisateur.
--   * les fichiers (audio, PDF) sont stockés dans des buckets privés, rangés sous
--     <user_id>/<consultation_id>/..., sans URL publique.
--   * le journal d'audit est en ajout seul (aucune mise à jour ni suppression).
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Fonctions utilitaires
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Empêche de réattribuer une ligne à un autre utilisateur.
create or replace function public.prevent_owner_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot be changed';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles : un profil par compte Supabase Auth
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  -- Informations affichées sur les documents (spécialité, n° RPPS, adresse...).
  professional_info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- user_settings : préférences (rétention audio, établissement, langue)
-- -----------------------------------------------------------------------------

create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- Nombre de jours de conservation de l'audio après confirmation de la transcription.
  -- 0 = suppression immédiate après confirmation.
  audio_retention_days integer not null default 30 check (audio_retention_days between 0 and 3650),
  transcription_language text not null default 'fr',
  -- Informations optionnelles de l'établissement imprimées sur l'ordonnance.
  institution_info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- Création automatique du profil et des paramètres à l'inscription d'un compte.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', null));
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- consultations
-- -----------------------------------------------------------------------------

create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  patient_name text,
  patient_first_name text,
  patient_date_of_birth date,
  patient_gender text check (patient_gender in ('M', 'F')),
  -- Âge, nationalité, n° d'immatriculation, fonction...
  patient_information jsonb not null default '{}'::jsonb,
  -- Nom du navire, pavillon, type, dotation, MMSI, position, escales...
  vessel_information jsonb not null default '{}'::jsonb,
  consultation_date timestamptz not null default now(),
  status text not null default 'draft'
    check (status in ('draft', 'in_progress', 'validated', 'archived')),
  -- Consentement explicite à l'enregistrement et information sur le transfert
  -- des données au fournisseur d'IA configuré.
  recording_consent_at timestamptz,
  ai_processing_acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index consultations_user_date_idx on public.consultations (user_id, consultation_date desc);
create index consultations_user_status_idx on public.consultations (user_id, status);
create index consultations_patient_search_idx
  on public.consultations (user_id, lower(patient_name), lower(patient_first_name));

create trigger consultations_set_updated_at
  before update on public.consultations
  for each row execute function public.set_updated_at();
create trigger consultations_owner_guard
  before update on public.consultations
  for each row execute function public.prevent_owner_change();

-- Vérifie qu'une consultation appartient à l'utilisateur courant (utilisé par la RLS).
create or replace function public.owns_consultation(target uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.consultations c
    where c.id = target and c.user_id = (select auth.uid())
  );
$$;

-- -----------------------------------------------------------------------------
-- recordings : métadonnées audio (le fichier est dans le bucket "recordings")
-- -----------------------------------------------------------------------------

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  storage_path text not null,
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  duration double precision check (duration >= 0),
  -- Ordre du segment pour les longues consultations enregistrées par morceaux.
  segment_index integer not null default 0,
  transcription_status text not null default 'pending'
    check (transcription_status in ('pending', 'processing', 'completed', 'failed')),
  transcription_error text,
  -- Date à partir de laquelle l'audio peut être supprimé (politique de rétention).
  delete_after timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (consultation_id, segment_index)
);

create index recordings_consultation_idx on public.recordings (consultation_id);
create index recordings_retention_idx on public.recordings (delete_after) where deleted_at is null;

create trigger recordings_owner_guard
  before update on public.recordings
  for each row execute function public.prevent_owner_change();

-- -----------------------------------------------------------------------------
-- transcriptions
-- -----------------------------------------------------------------------------

create table public.transcriptions (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  original_transcript text not null default '',
  corrected_transcript text,
  language text not null default 'fr',
  provider text,
  model text,
  -- Renseigné quand le médecin confirme la transcription (déclenche la rétention audio).
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transcriptions_consultation_idx on public.transcriptions (consultation_id, created_at desc);

create trigger transcriptions_set_updated_at
  before update on public.transcriptions
  for each row execute function public.set_updated_at();
create trigger transcriptions_owner_guard
  before update on public.transcriptions
  for each row execute function public.prevent_owner_change();

-- -----------------------------------------------------------------------------
-- observation_forms : fiche d'observation (une par consultation)
--   form_data      : valeurs validées / éditées par le médecin
--   ai_extraction  : dernière réponse brute validée (schéma) de l'IA, avec sources
--                    et niveaux de confiance ; jamais recopiée sans action du médecin
-- -----------------------------------------------------------------------------

create table public.observation_forms (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null unique references public.consultations (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  form_data jsonb not null default '{}'::jsonb,
  ai_extraction jsonb,
  schema_version integer not null default 1,
  validation_status text not null default 'draft'
    check (validation_status in ('draft', 'ai_extracted', 'in_review', 'validated')),
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger observation_forms_set_updated_at
  before update on public.observation_forms
  for each row execute function public.set_updated_at();
create trigger observation_forms_owner_guard
  before update on public.observation_forms
  for each row execute function public.prevent_owner_change();

-- -----------------------------------------------------------------------------
-- prescriptions : ordonnance (une par consultation pour le MVP)
-- -----------------------------------------------------------------------------

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null unique references public.consultations (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  prescription_data jsonb not null default '{}'::jsonb,
  validation_status text not null default 'draft'
    check (validation_status in ('draft', 'validated')),
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger prescriptions_set_updated_at
  before update on public.prescriptions
  for each row execute function public.set_updated_at();
create trigger prescriptions_owner_guard
  before update on public.prescriptions
  for each row execute function public.prevent_owner_change();

-- -----------------------------------------------------------------------------
-- generated_documents : PDF générés (fichiers dans le bucket "documents")
-- -----------------------------------------------------------------------------

create table public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  document_type text not null check (document_type in ('observation', 'prescription')),
  storage_path text not null,
  version integer not null default 1,
  created_at timestamptz not null default now()
);

create index generated_documents_user_date_idx on public.generated_documents (user_id, created_at desc);
create index generated_documents_consultation_idx
  on public.generated_documents (consultation_id, document_type, version desc);

-- -----------------------------------------------------------------------------
-- audit_logs : actions importantes (création, validation, export, suppression...)
-- -----------------------------------------------------------------------------

create table public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  consultation_id uuid references public.consultations (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  -- Ne jamais y stocker de contenu médical : uniquement des métadonnées techniques.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_user_date_idx on public.audit_logs (user_id, created_at desc);

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.consultations enable row level security;
alter table public.recordings enable row level security;
alter table public.transcriptions enable row level security;
alter table public.observation_forms enable row level security;
alter table public.prescriptions enable row level security;
alter table public.generated_documents enable row level security;
alter table public.audit_logs enable row level security;

-- profiles : lecture et mise à jour de son propre profil (création par trigger).
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- user_settings
create policy "settings_select_own" on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "settings_update_own" on public.user_settings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- consultations
create policy "consultations_select_own" on public.consultations
  for select to authenticated using (user_id = (select auth.uid()));
create policy "consultations_insert_own" on public.consultations
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "consultations_update_own" on public.consultations
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "consultations_delete_own" on public.consultations
  for delete to authenticated using (user_id = (select auth.uid()));

-- Tables rattachées à une consultation : propriétaire + consultation possédée.
do $$
declare
  t text;
begin
  foreach t in array array['recordings', 'transcriptions', 'observation_forms', 'prescriptions', 'generated_documents']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()) and public.owns_consultation(consultation_id))',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.owns_consultation(consultation_id))',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_delete_own', t);
  end loop;
end;
$$;

-- audit_logs : ajout et lecture uniquement.
create policy "audit_select_own" on public.audit_logs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "audit_insert_own" on public.audit_logs
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and (consultation_id is null or public.owns_consultation(consultation_id))
  );

-- Aucun accès anonyme.
revoke all on all tables in schema public from anon;

-- =============================================================================
-- Stockage : buckets privés
-- Chemin des objets : <user_id>/<consultation_id>/<fichier>
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('recordings', 'recordings', false, 52428800,
    array['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/flac']),
  ('documents', 'documents', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

create policy "storage_select_own" on storage.objects
  for select to authenticated using (
    bucket_id in ('recordings', 'documents')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "storage_insert_own" on storage.objects
  for insert to authenticated with check (
    bucket_id in ('recordings', 'documents')
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.owns_consultation(((storage.foldername(name))[2])::uuid)
  );
create policy "storage_update_own" on storage.objects
  for update to authenticated using (
    bucket_id in ('recordings', 'documents')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "storage_delete_own" on storage.objects
  for delete to authenticated using (
    bucket_id in ('recordings', 'documents')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
