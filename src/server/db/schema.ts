/**
 * Schéma SQLite d'AurisMED (base locale). Chaque entrée est appliquée une seule
 * fois, dans l'ordre ; ne jamais modifier une migration déjà livrée, en ajouter
 * une nouvelle.
 *
 * Correspondance avec l'ancien schéma Supabase :
 *   - jsonb      -> TEXT contenant du JSON (sérialisé par la couche d'accès) ;
 *   - timestamptz -> TEXT ISO 8601 en UTC ;
 *   - la RLS est remplacée par le filtrage par propriétaire de src/server/db/query.ts.
 */
export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "0001_initial",
    sql: `
create table users (
  id text primary key,
  email text not null unique collate nocase,
  password_hash text not null,
  created_at text not null,
  updated_at text not null,
  disabled_at text
);

create table sessions (
  id text primary key,            -- empreinte SHA-256 du jeton (le jeton n'est jamais stocké)
  user_id text not null references users (id) on delete cascade,
  created_at text not null,
  expires_at text not null,
  last_seen_at text not null
);
create index sessions_user_idx on sessions (user_id);

create table profiles (
  id text primary key references users (id) on delete cascade,
  full_name text,
  email text,
  professional_info text not null default '{}',
  created_at text not null,
  updated_at text not null
);

create table user_settings (
  user_id text primary key references profiles (id) on delete cascade,
  audio_retention_days integer not null default 30 check (audio_retention_days between 0 and 3650),
  transcription_language text not null default 'fr',
  institution_info text not null default '{}',
  created_at text not null,
  updated_at text not null
);

create table consultations (
  id text primary key,
  user_id text not null references profiles (id) on delete cascade,
  patient_name text,
  patient_first_name text,
  patient_date_of_birth text,
  patient_gender text check (patient_gender in ('M', 'F')),
  patient_information text not null default '{}',
  vessel_information text not null default '{}',
  call_information text not null default '{}',
  consultation_date text not null,
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'validated', 'archived')),
  recording_consent_at text,
  ai_processing_acknowledged_at text,
  created_at text not null,
  updated_at text not null
);
create index consultations_user_date_idx on consultations (user_id, consultation_date desc);
create index consultations_user_status_idx on consultations (user_id, status);

create table recordings (
  id text primary key,
  consultation_id text not null references consultations (id) on delete cascade,
  user_id text not null references profiles (id) on delete cascade,
  storage_path text not null,
  mime_type text,
  size_bytes integer check (size_bytes >= 0),
  duration real check (duration >= 0),
  segment_index integer not null default 0,
  transcription_status text not null default 'pending'
    check (transcription_status in ('pending', 'processing', 'completed', 'failed')),
  transcription_error text,
  source text not null default 'microphone' check (source in ('microphone', 'upload')),
  original_filename text,
  transcript text,
  delete_after text,
  deleted_at text,
  created_at text not null,
  unique (consultation_id, segment_index)
);
create index recordings_retention_idx on recordings (delete_after) where deleted_at is null;

create table transcriptions (
  id text primary key,
  consultation_id text not null unique references consultations (id) on delete cascade,
  user_id text not null references profiles (id) on delete cascade,
  original_transcript text not null default '',
  corrected_transcript text,
  language text not null default 'fr',
  provider text,
  model text,
  confirmed_at text,
  created_at text not null,
  updated_at text not null
);

create table observation_forms (
  id text primary key,
  consultation_id text not null unique references consultations (id) on delete cascade,
  user_id text not null references profiles (id) on delete cascade,
  form_data text not null default '{}',
  ai_extraction text,
  schema_version integer not null default 1,
  validation_status text not null default 'draft'
    check (validation_status in ('draft', 'ai_extracted', 'in_review', 'validated')),
  validated_at text,
  created_at text not null,
  updated_at text not null
);

create table prescriptions (
  id text primary key,
  consultation_id text not null unique references consultations (id) on delete cascade,
  user_id text not null references profiles (id) on delete cascade,
  prescription_data text not null default '{}',
  validation_status text not null default 'draft' check (validation_status in ('draft', 'validated')),
  validated_at text,
  created_at text not null,
  updated_at text not null
);

create table generated_documents (
  id text primary key,
  consultation_id text not null references consultations (id) on delete cascade,
  user_id text not null references profiles (id) on delete cascade,
  document_type text not null check (document_type in ('observation', 'prescription')),
  storage_path text not null,
  version integer not null default 1,
  created_at text not null,
  unique (consultation_id, document_type, version)
);
create index generated_documents_user_date_idx on generated_documents (user_id, created_at desc);

-- Journal d'audit en ajout seul : métadonnées techniques uniquement, jamais de contenu médical.
create table audit_logs (
  id integer primary key autoincrement,
  user_id text not null references profiles (id) on delete cascade,
  consultation_id text references consultations (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata text not null default '{}',
  created_at text not null
);
create index audit_logs_user_date_idx on audit_logs (user_id, created_at desc);
-- Seule mise à jour tolérée : la remise à null de consultation_id quand la consultation est supprimée.
create trigger audit_logs_no_update before update on audit_logs
  when not (
    new.consultation_id is null and old.consultation_id is not null
    and new.id = old.id and new.user_id = old.user_id and new.action = old.action
    and new.entity_type is old.entity_type and new.entity_id is old.entity_id
    and new.metadata = old.metadata and new.created_at = old.created_at
  )
  begin select raise(abort, 'audit_logs is append-only'); end;
create trigger audit_logs_no_delete before delete on audit_logs
  begin select raise(abort, 'audit_logs is append-only'); end;
`,
  },
  {
    id: "0002_app_settings",
    sql: `
-- Réglages du poste (modèles locaux choisis...) : communs à tous les comptes.
create table app_settings (
  key text primary key,
  value text not null,
  updated_at text not null
);
`,
  },
  {
    id: "0003_transcription_segments",
    sql: `
-- Transcription en direct : un morceau de parole transcrit pendant la
-- consultation, avec son interlocuteur (proposé par l'IA locale ou corrigé par
-- le médecin). Les morceaux sont assemblés en transcription à la fin.
create table transcription_segments (
  id text primary key,
  consultation_id text not null references consultations (id) on delete cascade,
  user_id text not null references profiles (id) on delete cascade,
  seq integer not null check (seq >= 0),
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null check (end_ms >= start_ms),
  text text not null default '',
  speaker text not null default 'unknown' check (speaker in ('doctor', 'patient', 'unknown')),
  speaker_source text not null default 'default' check (speaker_source in ('default', 'ai', 'doctor')),
  model text,
  created_at text not null,
  updated_at text not null,
  unique (consultation_id, seq)
);
`,
  },
];
